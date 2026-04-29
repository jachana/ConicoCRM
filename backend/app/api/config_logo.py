import mimetypes
import uuid
from pathlib import Path

from fastapi import APIRouter, Depends, HTTPException, UploadFile, status
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.api.config import require_admin
from app.models.system_config import SystemConfig
from app.models.user import User

router = APIRouter()

UPLOAD_DIR = Path("uploads") / "config"
MIME_VALIDOS = {"image/jpeg", "image/png", "image/webp"}
MAX_SIZE = 2 * 1024 * 1024  # 2 MB
MAGIC_BYTES = [
    (b"\xff\xd8\xff", "image/jpeg"),
    (b"\x89PNG\r\n\x1a\n", "image/png"),
    (b"RIFF", "image/webp"),
]


def _validate_magic(data: bytes) -> bool:
    for magic, mime in MAGIC_BYTES:
        if mime == "image/webp":
            if data[:4] == b"RIFF" and data[8:12] == b"WEBP":
                return True
        else:
            if data[: len(magic)] == magic:
                return True
    return False


@router.post("/logo", status_code=status.HTTP_204_NO_CONTENT)
async def subir_logo(
    file: UploadFile,
    perms: tuple[User, Session] = Depends(require_admin),
):
    _, db = perms
    content_type = file.content_type or ""
    if content_type not in MIME_VALIDOS:
        raise HTTPException(
            status_code=status.HTTP_422_UNPROCESSABLE_ENTITY,
            detail=f"Tipo no permitido. Use: {', '.join(sorted(MIME_VALIDOS))}",
        )

    content = await file.read()
    if len(content) > MAX_SIZE:
        raise HTTPException(
            status_code=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE,
            detail="El archivo supera el límite de 2 MB",
        )
    if not _validate_magic(content):
        raise HTTPException(
            status_code=status.HTTP_415_UNSUPPORTED_MEDIA_TYPE,
            detail="El archivo no es una imagen válida",
        )

    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)
    filename = Path(file.filename or "logo").name
    dest = UPLOAD_DIR / f"logo_{uuid.uuid4()}_{filename}"

    cfg = db.get(SystemConfig, "empresa_logo_path")
    old_path = Path(cfg.value) if cfg and cfg.value else None

    dest.write_bytes(content)

    if cfg:
        cfg.value = str(dest)
    else:
        db.add(SystemConfig(key="empresa_logo_path", value=str(dest)))
    db.commit()

    if old_path and old_path.exists():
        try:
            old_path.unlink()
        except OSError:
            pass


@router.get("/logo")
def servir_logo(perms: tuple[User, Session] = Depends(require_admin)):
    _, db = perms
    cfg = db.get(SystemConfig, "empresa_logo_path")
    if not cfg or not cfg.value:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Logo no configurado")
    path = Path(cfg.value)
    if not path.exists():
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Archivo no encontrado")
    content_type, _ = mimetypes.guess_type(str(path))
    return FileResponse(str(path), media_type=content_type or "application/octet-stream")


@router.delete("/logo", status_code=status.HTTP_204_NO_CONTENT)
def eliminar_logo(perms: tuple[User, Session] = Depends(require_admin)):
    _, db = perms
    cfg = db.get(SystemConfig, "empresa_logo_path")
    if cfg and cfg.value:
        path = Path(cfg.value)
        if path.exists():
            path.unlink()
        cfg.value = ""
        db.commit()
