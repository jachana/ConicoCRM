import uuid
from pathlib import Path

from fastapi import APIRouter, Form, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empleado import Empleado
from app.models.empleado_documento import EmpleadoDocumento
from app.models.user import User
from app.schemas.empleado_documento import EmpleadoDocumentoOut

router = APIRouter()

UPLOAD_DIR = Path("uploads")
TIPOS_VALIDOS = {"contrato", "liquidacion", "otro"}
MAX_SIZE = 10 * 1024 * 1024  # 10 MB


@router.get("/{empleado_id}/documentos/", response_model=list[EmpleadoDocumentoOut])
def listar_documentos(
    empleado_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "view"),
):
    _, db = perms
    if not db.get(Empleado, empleado_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")
    return db.query(EmpleadoDocumento).filter_by(empleado_id=empleado_id).order_by(EmpleadoDocumento.subido_en.desc()).all()


@router.post("/{empleado_id}/documentos/", response_model=EmpleadoDocumentoOut, status_code=status.HTTP_201_CREATED)
async def subir_documento(
    empleado_id: int,
    file: UploadFile,
    tipo: str = Form(...),
    perms: tuple[User, Session] = require_permission("rrhh", "create"),
):
    user, db = perms
    if tipo not in TIPOS_VALIDOS:
        raise HTTPException(status_code=status.HTTP_422_UNPROCESSABLE_ENTITY, detail=f"tipo debe ser uno de: {', '.join(TIPOS_VALIDOS)}")
    if not db.get(Empleado, empleado_id):
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empleado no encontrado")

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE, detail="Archivo supera el límite de 10 MB")

    dir_path = UPLOAD_DIR / "empleados" / str(empleado_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "documento"
    dest = dir_path / f"{uuid.uuid4()}_{filename}"
    dest.write_bytes(content)

    doc = EmpleadoDocumento(
        empleado_id=empleado_id,
        nombre=filename,
        tipo=tipo,
        ruta=str(dest),
        subido_por_id=user.id,
    )
    db.add(doc)
    db.commit()
    db.refresh(doc)
    return doc


@router.get("/{empleado_id}/documentos/{doc_id}/download")
def descargar_documento(
    empleado_id: int,
    doc_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "view"),
):
    _, db = perms
    doc = db.get(EmpleadoDocumento, doc_id)
    if not doc or doc.empleado_id != empleado_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    path = Path(doc.ruta)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado en disco")
    return FileResponse(str(path), filename=doc.nombre)


@router.delete("/{empleado_id}/documentos/{doc_id}", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_documento(
    empleado_id: int,
    doc_id: int,
    perms: tuple[User, Session] = require_permission("rrhh", "delete"),
):
    _, db = perms
    doc = db.get(EmpleadoDocumento, doc_id)
    if not doc or doc.empleado_id != empleado_id:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Documento no encontrado")
    path = Path(doc.ruta)
    if path.exists():
        path.unlink()
    db.delete(doc)
    db.commit()
