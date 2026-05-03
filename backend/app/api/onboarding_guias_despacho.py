"""
Onboarding Guías de Despacho Históricas Import API

Endpoints:
  GET  /template  - Download two-sheet Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import with idempotency
"""

import io
import json
import uuid
from decimal import Decimal
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.cliente import Cliente
from app.models.factura import Factura
from app.models.guia_despacho import GuiaDespacho, GuiaDespachoLinea
from app.models.import_report import ImportReport
from app.models.producto import Producto
from app.models.user import User
from app.services.gd_historicas_parser import GDHistoricasParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_existing_folios(db: Session) -> set[int]:
    rows = db.query(GuiaDespacho.numero).filter(GuiaDespacho.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _get_clientes_by_rut(db: Session) -> dict[str, int]:
    rows = db.query(Cliente.rut, Cliente.id).filter(Cliente.rut.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_productos_by_sku(db: Session) -> dict[str, int]:
    rows = db.query(Producto.sku, Producto.id).filter(Producto.sku.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0]}


def _get_facturas_by_numero(db: Session) -> set[int]:
    rows = db.query(Factura.numero).filter(Factura.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _gd_group_to_dict(group) -> dict:
    return {
        "folio_guia": group.folio_guia,
        "rut_receptor": group.rut_receptor,
        "fecha": group.fecha.isoformat() if group.fecha else None,
        "tipo_traslado": group.tipo_traslado,
        "sede_destino": group.sede_destino,
        "folio_factura": group.folio_factura,
        "status": group.status,
        "row_num": group.row_num,
        "lineas_count": len(group.lines),
        "lineas": [
            {"sku": l.sku, "cantidad": float(l.cantidad)}
            for l in group.lines
        ],
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "folio_guia": row.folio_guia_raw,
        "sheet": row.sheet,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = GDHistoricasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_guias_despacho_historicas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_gd(
    file: UploadFile,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    existing_folios = _get_existing_folios(db)

    try:
        result = GDHistoricasParser.parse(content, file.filename or "gd.xlsx", existing_folios)
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    clientes_by_rut = _get_clientes_by_rut(db)
    facturas_by_numero = _get_facturas_by_numero(db)

    valid_out = []
    sin_cliente = 0
    factura_encontrada = 0
    factura_pendiente = 0

    for group in result.valid_groups:
        g = _gd_group_to_dict(group)
        g["cliente_encontrado"] = (
            clientes_by_rut.get(group.rut_receptor) is not None
            if group.rut_receptor else None
        )
        if group.rut_receptor and not clientes_by_rut.get(group.rut_receptor):
            sin_cliente += 1
        if group.folio_factura is not None:
            if group.folio_factura in facturas_by_numero:
                g["factura_encontrada"] = True
                factura_encontrada += 1
            else:
                g["factura_encontrada"] = False
                factura_pendiente += 1
        else:
            g["factura_encontrada"] = None
        valid_out.append(g)

    return {
        "valid": valid_out,
        "invalid": [_invalid_row_to_dict(r) for r in result.invalid_rows],
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "invalid_count": len(result.invalid_rows),
        "sin_cliente": sin_cliente,
        "factura_encontrada": factura_encontrada,
        "factura_pendiente": factura_pendiente,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_gd(
    file: UploadFile,
    idempotency_key: Optional[str] = None,
    perms: tuple[User, Session] = Depends(require_admin),
):
    current_user, db = perms

    try:
        content = await file.read()
        if not content:
            raise HTTPException(status_code=400, detail="El archivo está vacío")
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Error leyendo archivo: {e}")

    import_id = idempotency_key or str(uuid.uuid4())

    existing_report = (
        db.query(ImportReport).filter(ImportReport.import_id == import_id).first()
    )
    if existing_report:
        report_data = json.loads(existing_report.report_json or "{}")
        return {
            "status": existing_report.status,
            "import_id": existing_report.import_id,
            "timestamp": existing_report.created_at.isoformat(),
            "report": report_data,
        }

    existing_folios = _get_existing_folios(db)

    try:
        parse_result = GDHistoricasParser.parse(
            content, file.filename or "gd.xlsx", existing_folios
        )
    except ParseError as e:
        err_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=str(e),
            filename=file.filename,
            total_rows=0,
        )
        db.add(err_report)
        db.commit()
        raise HTTPException(status_code=422, detail=str(e))

    try:
        clientes_by_rut = _get_clientes_by_rut(db)
        productos_by_sku = _get_productos_by_sku(db)
        facturas_by_numero = _get_facturas_by_numero(db)

        folios_seen = set(existing_folios)
        created_count = 0
        omitted_count = 0
        error_count = len(parse_result.invalid_rows)
        report_rows = []

        for group in parse_result.valid_groups:
            g_dict = _gd_group_to_dict(group)

            if group.status == "omitir":
                omitted_count += 1
                report_rows.append({**g_dict, "import_status": "omitido"})
                continue

            if group.folio_guia in folios_seen:
                omitted_count += 1
                report_rows.append({**g_dict, "import_status": "omitido"})
                continue

            cliente_id = clientes_by_rut.get(group.rut_receptor) if group.rut_receptor else None

            gd = GuiaDespacho(
                numero=group.folio_guia,
                fecha=group.fecha,
                cliente_id=cliente_id,
                motivo_traslado=group.tipo_traslado,
                direccion_destino=group.sede_destino,
                estado="emitida",
                dte_estado="no_emitida",
                historico=True,
            )
            db.add(gd)
            db.flush()

            for orden, line in enumerate(group.lines):
                producto_id = productos_by_sku.get(line.sku) if line.sku else None
                descripcion = line.sku or "Ítem importado"

                linea = GuiaDespachoLinea(
                    guia_despacho_id=gd.id,
                    orden=orden,
                    producto_id=producto_id,
                    descripcion=descripcion,
                    cantidad=line.cantidad,
                    precio_unitario=Decimal("0"),
                    total_neto=Decimal("0"),
                    iva=Decimal("0"),
                    total_linea=Decimal("0"),
                )
                db.add(linea)

            folios_seen.add(group.folio_guia)
            created_count += 1

            import_status = "creado"
            factura_link = None
            if group.folio_factura is not None:
                if group.folio_factura in facturas_by_numero:
                    import_status = "creado_factura_ok"
                    factura_link = group.folio_factura
                else:
                    import_status = "creado_factura_pendiente"

            report_rows.append({
                **g_dict,
                "import_status": import_status,
                "gd_id": gd.id,
                "factura_link": factura_link,
            })

        overall_status = (
            "success" if error_count == 0
            else "partial" if (created_count + omitted_count) > 0
            else "error"
        )

        report_payload = {
            "created_count": created_count,
            "omitted_count": omitted_count,
            "error_count": error_count,
            "total_rows": len(parse_result.valid_groups) + len(parse_result.invalid_rows),
            "rows": report_rows,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            error_count=error_count,
            total_rows=len(parse_result.valid_groups) + len(parse_result.invalid_rows),
            filename=file.filename,
            report_json=json.dumps(report_payload, ensure_ascii=False, default=str),
        )
        db.add(import_report)
        db.commit()
        db.refresh(import_report)

        return {
            "status": overall_status,
            "import_id": import_id,
            "timestamp": import_report.created_at.isoformat(),
            "report": report_payload,
        }

    except Exception as e:
        db.rollback()
        err_report = ImportReport(
            import_id=import_id,
            status="error",
            error_message=f"Transaction error: {e}",
            filename=file.filename,
            total_rows=0,
        )
        db.add(err_report)
        db.commit()
        raise HTTPException(status_code=500, detail=f"Import error: {e}")
