# Cotización — Validez y Expiración

**Date:** 2026-04-22
**Status:** Approved

## Context

`validez_dias` (Integer, default=5) already exists in the Cotizacion model, schema, and frontend form. What is missing is:
- Visual display of the expiration date (`fecha + validez_dias`)
- Expiration banner in the UI
- Block on NV generation when the cotización is expired
- Backend guard on the NV creation endpoint

The expiration date is derived, never stored. To "un-expire" a cotización, the user changes `fecha` (fecha de emisión) to a more recent date.

## Changes

### Backend — `app/schemas/cotizacion.py`

Add `fecha_expiracion: date` to `CotizacionOut` as a computed field:

```python
from datetime import timedelta
from pydantic import computed_field

class CotizacionOut(BaseModel):
    # ... existing fields ...

    @computed_field
    @property
    def fecha_expiracion(self) -> date:
        return self.fecha + timedelta(days=self.validez_dias)
```

No migration required — this field is never stored.

### Backend — `app/api/nota_ventas.py`

In `crear_nv_desde_cotizacion`, add expiration check after the `cerrada_fv` guard:

```python
from datetime import date, timedelta

if date.today() > cot.fecha + timedelta(days=cot.validez_dias):
    raise HTTPException(
        status_code=status.HTTP_409_CONFLICT,
        detail="Cotización expirada. Cambie la fecha de emisión para generar una NV.",
    )
```

### Frontend — `CotizacionDetalle.tsx`

**Expiration banner:** Same style as the locked banner, but amber/orange color. Shown when `fecha_expiracion < today` AND `!isLocked`. Message: *"Esta cotización está expirada. Cambie la fecha de emisión para poder generar una NV."*

**Expiration date display:** Show `Válido hasta: {fecha_expiracion formatted as DD/MM/YYYY}` as a read-only label near the `fecha` / `validezDias` fields.

**Generar NV button:** Disabled with tooltip `"Cotización expirada"` when `isExpired`. This is additive to the existing `isLocked` disable logic.

## Expiration Logic

```
isExpired = fecha_expiracion < today   (derived from API response)
isLocked  = cotizacion.is_locked       (existing flag)

Banner shown: isExpired && !isLocked
NV button disabled: isLocked || isExpired
```

Locked takes visual priority (if locked, show locked banner, not expiration banner).

## Out of Scope

- Locking the cotización itself on expiration (pending client answer — see dudas-cliente.md question 7)
- Expiration affecting PDF generation or email sending
- Auto-expiration via background job
