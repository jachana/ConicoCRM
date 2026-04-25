# Backlog

Tareas accionables. PROGRESS.md describe lo terminado; aquí está lo que sigue.

## Done

- **W1-04 — Boleta DTE 39/41 standalone** — emitida 2026-04-25. Modelos Boleta/BoletaLinea, DTE 39 afecta + 41 exenta, receptor anónimo con patente, stock al emitir + reversa, anulación → NC 61, frontend list/nueva/detalle.

## Pending — Wave 1 hardening

(Resto de la wave; ver `PROGRESS.md` § Hardening producción para detalle de cada uno.)

- **W1-03 — Rate limiting + auth tightening**
- **W1-05 — Guía de Despacho DTE 52**
- **W1-07 — Documentación operacional ampliada**

## Derivadas de W1-04

### W1-08 — Refactor stock al emitir documento tributario
- **Prioridad:** P0 · **Owner:** backend · **Esfuerzo:** M
- **Por qué:** Confirmado 2026-04-25 — stock debe descontarse al emitir Factura/Boleta, no al crear NV.
- **Scope:** mover hook descuento desde POST/PATCH NV a Factura. NV solo reserva (o no toca) stock. Migrar movimientos históricos. NC devuelve stock.
- **Aceptación:** crear NV no toca stock; emitir Factura desde esa NV descuenta; cambio compatible con Boleta (W1-04).

### W5-04 — Unidades alternativas de venta (caja/pack/detalle)
- **Prioridad:** P1 · **Owner:** fullstack · **Esfuerzo:** L
- **Por qué:** producto puede venderse en distintas unidades; necesita brainstorm propio.
- **Scope:** modelo `unidad_base` + `unidades_alternativas[]` con factor; selector unidad en cotización/NV/factura/boleta línea; conversión a base para stock.
- **Aceptación:** vender 1 caja (12u) descuenta 12 del stock base; reportes muestran columna en unidad de venta y unidad base.
