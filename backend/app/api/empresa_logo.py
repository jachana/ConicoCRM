import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.empresa import Empresa
from app.models.user import User
from app.schemas.empresa import EmpresaOut

router = APIRouter()

UPLOAD_DIR = Path("uploads")
MIME_VALIDOS = {"image/jpeg", "image/png", "image/svg+xml", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2 MB


@router.post("/{empresa_id}/logo", response_model=EmpresaOut)
async def subir_logo(
    empresa_id: int,
    file: UploadFile,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    content_type = file.content_type or ""
    if content_type not in MIME_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo de archivo no permitido. Use: {', '.join(sorted(MIME_VALIDOS))}",
        )

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 2 MB",
        )

    # Delete old logo from disk if present
    if empresa.logo_path:
        old_path = Path(empresa.logo_path)
        if old_path.exists():
            old_path.unlink()

    dir_path = UPLOAD_DIR / "empresas" / str(empresa_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    filename = file.filename or "logo"
    dest = dir_path / f"logo_{uuid.uuid4()}_{filename}"
    dest.write_bytes(content)

    empresa.logo_path = str(dest)
    db.commit()
    db.refresh(empresa)
    return empresa


@router.get("/{empresa_id}/logo")
def servir_logo(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "view"),
):
    _, db = perms
    empresa = db.get(Empresa, empresa_id)
    if not empresa or not empresa.logo_path:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo no encontrado")

    path = Path(empresa.logo_path)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo de logo no encontrado en disco")

    content_type, _ = mimetypes.guess_type(str(path))
    return FileResponse(str(path), media_type=content_type or "application/octet-stream")


@router.delete("/{empresa_id}/logo", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_logo(
    empresa_id: int,
    perms: tuple[User, Session] = require_permission("empresas", "edit"),
):
    _, db = perms
    empresa = db.get(Empresa, empresa_id)
    if not empresa:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Empresa no encontrada")

    if empresa.logo_path:
        path = Path(empresa.logo_path)
        if path.exists():
            path.unlink()
        empresa.logo_path = None
        db.commit()
