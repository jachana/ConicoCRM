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
MIME_VALIDOS = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2 MB

# Magic bytes for supported image formats
MAGIC_BYTES = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"RIFF", "image/webp"),  # checked together with WEBP at bytes 8-12
]


def _validate_magic(data: bytes, declared_mime: str) -> bool:
    """Return True if data starts with a recognised image magic sequence."""
    for magic, mime in MAGIC_BYTES:
        if mime == "image/webp":
            if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                return True
        else:
            if data[: len(magic)] == magic:
                return True
    return False


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

    if not _validate_magic(content, content_type):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="El archivo no es una imagen válida",
        )

    # Strip directory components from filename to prevent path traversal
    filename = Path(file.filename or "logo").name
    dir_path = UPLOAD_DIR / "empresas" / str(empresa_id)
    dir_path.mkdir(parents=True, exist_ok=True)
    dest = dir_path / f"logo_{uuid.uuid4()}_{filename}"

    # Remember old path before writing new file
    old_path = Path(empresa.logo_path) if empresa.logo_path else None

    # 1. Write new file first (before touching DB or deleting old)
    try:
        dest.write_bytes(content)
    except OSError:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail="Error al guardar el archivo",
        )

    # 2. Update DB and commit
    empresa.logo_path = str(dest)
    db.add(empresa)
    db.commit()
    db.refresh(empresa)

    # 3. Only delete old file after successful commit
    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass  # non-fatal: orphaned file, will be cleaned up eventually

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
