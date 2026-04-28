METODOS_PAGO = {
    "efectivo", "tarjeta_credito", "tarjeta_debito",
    "transferencia", "cheque", "vale_vista",
    "credito_simple", "otros",
}

PLAZO_FORZADO_CERO = {"efectivo", "tarjeta_debito", "tarjeta_credito"}
PLAZO_OBLIGATORIO = {"credito_simple"}


def validate_metodo_plazo(metodo: str | None, plazo: int) -> None:
    if metodo is None:
        return
    if metodo not in METODOS_PAGO:
        raise ValueError(f"metodo_pago inválido. Opciones: {sorted(METODOS_PAGO)}")
    if metodo in PLAZO_FORZADO_CERO and plazo != 0:
        raise ValueError(f"'{metodo}' requiere plazo_dias = 0")
    if metodo in PLAZO_OBLIGATORIO and plazo == 0:
        raise ValueError(f"'{metodo}' requiere plazo_dias > 0")
