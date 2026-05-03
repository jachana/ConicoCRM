"""
Onboarding NC/ND Históricas Import API

Endpoints for bulk-importing historical Notas de Crédito and Notas de Débito
during onboarding.

Endpoints:
  GET  /template  - Download Excel template
  POST /preview   - Validate and preview file (no DB writes)
  POST /import    - Execute transactional import with idempotency
"""

import io
import json
import uuid
from typing import Optional

from fastapi import APIRouter, Depends, HTTPException, UploadFile
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.boleta import Boleta
from app.models.factura import Factura
from app.models.import_report import ImportReport
from app.models.nota_credito import NotaCredito, NotaCreditoLinea
from app.models.nota_debito import NotaDebito, NotaDebitoLinea
from app.models.user import User
from app.services.nc_historicas_parser import NCHistoricasParser, ParseError

router = APIRouter()


# ============================================================================
# DB lookup helpers
# ============================================================================

def _get_existing_nc_folios(db: Session) -> set[int]:
    """Return set of existing NotaCredito.numero values."""
    rows = db.query(NotaCredito.numero).filter(NotaCredito.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _get_existing_nd_folios(db: Session) -> set[int]:
    """Return set of existing NotaDebito.numero values."""
    rows = db.query(NotaDebito.numero).filter(NotaDebito.numero.isnot(None)).all()
    return {r[0] for r in rows if r[0] is not None}


def _get_facturas_by_numero(db: Session) -> dict[int, int]:
    """Return {numero: cliente_id} for all facturas."""
    rows = db.query(Factura.numero, Factura.cliente_id).filter(Factura.numero.isnot(None)).all()
    return {r[0]: r[1] for r in rows if r[0] is not None}


def _get_boletas_by_numero(db: Session) -> dict[int, tuple[int, int]]:
    """Return {numero: (boleta_id, cliente_id)} for all boletas."""
    rows = db.query(Boleta.numero, Boleta.id, Boleta.cliente_id).filter(Boleta.numero.isnot(None)).all()
    return {r[0]: (r[1], r[2]) for r in rows if r[0] is not None}


def _ncnd_row_to_dict(row) -> dict:
    """Convert NCNDRow to a JSON-serializable dict."""
    return {
        "tipo": row.tipo,
        "folio": row.folio,
        "fecha": row.fecha.isoformat() if row.fecha else None,
        "motivo": row.motivo,
        "neto": float(row.neto),
        "iva": float(row.iva),
        "total": float(row.total),
        "folio_referencia": row.folio_referencia,
        "tipo_referencia": row.tipo_referencia,
        "status": row.status,
        "row_num": row.row_num,
    }


def _invalid_row_to_dict(row) -> dict:
    return {
        "row_num": row.row_num,
        "folio": row.folio_raw,
        "tipo": row.tipo_raw,
        "motivo": row.motivo,
    }


# ============================================================================
# GET /template
# ============================================================================

@router.get("/template")
def get_template(perms: tuple[User, Session] = Depends(require_admin)):
    try:
        template_bytes = NCHistoricasParser.generate_template()
        return StreamingResponse(
            io.BytesIO(template_bytes),
            media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
            headers={"Content-Disposition": "attachment; filename=plantilla_nc_nd_historicas.xlsx"},
        )
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Error generando plantilla: {e}")


# ============================================================================
# POST /preview
# ============================================================================

@router.post("/preview")
async def preview_nc_nd(
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

    existing_folios = {
        "NC": _get_existing_nc_folios(db),
        "ND": _get_existing_nd_folios(db),
    }

    try:
        result = NCHistoricasParser.parse(
            content,
            file.filename or "nc_nd.xlsx",
            existing_folios=existing_folios,
        )
    except ParseError as e:
        raise HTTPException(status_code=422, detail=str(e))

    facturas_by_numero = _get_facturas_by_numero(db)
    boletas_by_numero = _get_boletas_by_numero(db)

    valid_rows_out = []
    pendiente_ref_count = 0
    for row in result.valid_rows:
        row_dict = _ncnd_row_to_dict(row)
        pendiente_ref = False
        if row.folio_referencia is not None:
            found_in_factura = row.folio_referencia in facturas_by_numero
            found_in_boleta = row.folio_referencia in boletas_by_numero
            if not found_in_factura and not found_in_boleta:
                pendiente_ref = True
                pendiente_ref_count += 1
        row_dict["pendiente_ref"] = pendiente_ref
        valid_rows_out.append(row_dict)

    invalid_rows = [_invalid_row_to_dict(r) for r in result.invalid_rows]

    return {
        "valid": valid_rows_out,
        "invalid": invalid_rows,
        "a_crear": result.a_crear,
        "a_omitir": result.a_omitir,
        "invalid_count": result.invalid_count,
        "pendiente_ref": pendiente_ref_count,
    }


# ============================================================================
# POST /import
# ============================================================================

@router.post("/import")
async def import_nc_nd(
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

    # Idempotency: return cached result if same import_id
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

    existing_folios = {
        "NC": _get_existing_nc_folios(db),
        "ND": _get_existing_nd_folios(db),
    }

    try:
        parse_result = NCHistoricasParser.parse(
            content,
            file.filename or "nc_nd.xlsx",
            existing_folios=existing_folios,
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
        facturas_by_numero = _get_facturas_by_numero(db)
        boletas_by_numero = _get_boletas_by_numero(db)

        # Track existing folios in memory to avoid race condition duplication
        nc_folios_seen = set(existing_folios["NC"])
        nd_folios_seen = set(existing_folios["ND"])

        created_count = 0
        omitted_count = 0
        error_count = len(parse_result.invalid_rows)
        report_rows = []

        for row in parse_result.valid_rows:
            row_dict = _ncnd_row_to_dict(row)

            if row.status == "omitir":
                omitted_count += 1
                report_rows.append({**row_dict, "import_status": "omitido"})
                continue

            # Double-check idempotency (race condition guard)
            if row.tipo == "NC" and row.folio in nc_folios_seen:
                omitted_count += 1
                report_rows.append({**row_dict, "import_status": "omitido"})
                continue
            if row.tipo == "ND" and row.folio in nd_folios_seen:
                omitted_count += 1
                report_rows.append({**row_dict, "import_status": "omitido"})
                continue

            # Determine cliente_id and optional boleta_id from folio_referencia
            cliente_id = None
            boleta_id = None
            pendiente_ref = False

            if row.folio_referencia is not None:
                if row.tipo_referencia == 39 and row.folio_referencia in boletas_by_numero:
                    # Boleta reference (tipo 39)
                    blt_id, blt_cliente_id = boletas_by_numero[row.folio_referencia]
                    boleta_id = blt_id
                    cliente_id = blt_cliente_id
                elif row.folio_referencia in facturas_by_numero:
                    cliente_id = facturas_by_numero[row.folio_referencia]
                elif row.folio_referencia in boletas_by_numero:
                    blt_id, blt_cliente_id = boletas_by_numero[row.folio_referencia]
                    boleta_id = blt_id
                    cliente_id = blt_cliente_id
                else:
                    pendiente_ref = True

            # ND requires cliente_id — skip if None
            if row.tipo == "ND" and cliente_id is None:
                error_count += 1
                motivo = (
                    f"ND folio {row.folio}: cliente_id no encontrado "
                    f"(folio_referencia={row.folio_referencia} no está en facturas ni boletas)"
                    if row.folio_referencia
                    else f"ND folio {row.folio}: folio_referencia requerido para determinar cliente_id"
                )
                report_rows.append({**row_dict, "import_status": "error", "motivo": motivo})
                continue

            if row.tipo == "NC":
                nc = NotaCredito(
                    numero=row.folio,
                    fecha=row.fecha,
                    cliente_id=cliente_id,
                    boleta_id=boleta_id,
                    razon=row.motivo,
                    monto_neto=row.neto,
                    monto_iva=row.iva,
                    monto_total=row.total,
                    historico=True,
                    dte_estado="no_emitida",
                )
                db.add(nc)
                db.flush()

                linea = NotaCreditoLinea(
                    nota_credito_id=nc.id,
                    orden=1,
                    descripcion=row.motivo,
                    cantidad=1,
                    precio_unitario=row.neto,
                    subtotal=row.neto,
                )
                db.add(linea)
                nc_folios_seen.add(row.folio)

                import_status = "creado_pendiente" if pendiente_ref else "creado"
                created_count += 1
                report_rows.append({
                    **row_dict,
                    "import_status": import_status,
                    "nc_id": nc.id,
                    "pendiente_ref": pendiente_ref,
                })

            else:  # ND
                nd = NotaDebito(
                    numero=row.folio,
                    fecha=row.fecha,
                    cliente_id=cliente_id,
                    razon=row.motivo,
                    monto_neto=row.neto,
                    monto_iva=row.iva,
                    monto_total=row.total,
                    historico=True,
                    dte_estado="no_emitida",
                )
                db.add(nd)
                db.flush()

                linea = NotaDebitoLinea(
                    nota_debito_id=nd.id,
                    orden=1,
                    descripcion=row.motivo,
                    cantidad=1,
                    precio_unitario=row.neto,
                    subtotal=row.neto,
                )
                db.add(linea)
                nd_folios_seen.add(row.folio)

                import_status = "creado_pendiente" if pendiente_ref else "creado"
                created_count += 1
                report_rows.append({
                    **row_dict,
                    "import_status": import_status,
                    "nd_id": nd.id,
                    "pendiente_ref": pendiente_ref,
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
            "total_rows": len(parse_result.valid_rows) + len(parse_result.invalid_rows),
            "rows": report_rows,
        }

        import_report = ImportReport(
            import_id=import_id,
            status=overall_status,
            created_count=created_count,
            error_count=error_count,
            total_rows=len(parse_result.valid_rows) + len(parse_result.invalid_rows),
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
