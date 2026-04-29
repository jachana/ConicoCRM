import base64
from pathlib import Path


def empresa_logo_data_uri(logo_path: str | None) -> str | None:
    """Return a base64 data URI for the given logo file path, or None if unavailable."""
    if not logo_path:
        return None
    path = Path(logo_path)
    if not path.exists():
        return None
    suffix = path.suffix.lower()
    mime = {
        ".jpg": "image/jpeg",
        ".jpeg": "image/jpeg",
        ".png": "image/png",
        ".webp": "image/webp",
    }.get(suffix, "image/png")
    try:
        data = base64.b64encode(path.read_bytes()).decode()
    except OSError:
        return None
    return f"data:{mime};base64,{data}"


def apply_config_logo(config: dict, empresa=None) -> None:
    """Set empresa_logo_url in config. Uploaded config logo takes priority over empresa logo."""
    logo_path = config.get("empresa_logo_path")
    if logo_path:
        uri = empresa_logo_data_uri(logo_path)
        if uri:
            config["empresa_logo_url"] = uri
            return
    if empresa and getattr(empresa, "logo_path", None):
        uri = empresa_logo_data_uri(empresa.logo_path)
        if uri:
            config["empresa_logo_url"] = uri
