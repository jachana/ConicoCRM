import re

_CLEAN_RE = re.compile(r'[\.\s]')


def clean_rut(rut: str) -> str:
    """Strip dots/spaces, uppercase, e.g. '76.543.210-k' -> '76543210-K'"""
    return _CLEAN_RE.sub('', rut).upper()


def validate_rut(rut: str) -> bool:
    """Return True if Chilean RUT format and check digit are valid."""
    cleaned = clean_rut(rut)
    if not re.fullmatch(r'\d{1,8}-[\dK]', cleaned):
        return False
    digits, dv = cleaned[:-2], cleaned[-1]
    total = 0
    factor = 2
    for c in reversed(digits):
        total += int(c) * factor
        factor = factor + 1 if factor < 7 else 2
    remainder = total % 11
    expected = 11 - remainder
    if expected == 11:
        expected_dv = '0'
    elif expected == 10:
        expected_dv = 'K'
    else:
        expected_dv = str(expected)
    return dv == expected_dv
