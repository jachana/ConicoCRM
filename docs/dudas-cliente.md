# Dudas a Confirmar con el Cliente

## Fase 4+5 — Nota de Venta y Factura

---

### 1. ¿Nota de Venta y Factura son documentos separados o uno solo?

**Contexto:** En el diseño original (PROGRESS.md) estaban en fases separadas. El cliente mencionó que "están unidas y comparten el estado de despachada/entregada/pagada/pendiente".

**Opciones:**
- **A) Un solo registro** con un campo `tipo` (NV o Factura) y los mismos estados — más simple, menos duplicación
- **B) Dos registros vinculados** — NV existe primero, luego se genera una Factura asociada — más control, permite que NV exista sin Factura

**Recomendación del equipo:** Opción B (botón manual "Generar Factura"), porque:
- La factura es un documento legal — el negocio debe decidir cuándo emitirla
- No toda NV necesita factura (boleta, crédito diferido, etc.)
- Los estados del negocio (pendiente/despachado/entregado/pagado) pueden ser compartidos igual

**Pregunta concreta:** ¿Siempre que hay una Nota de Venta se genera una Factura, o hay casos donde la NV no lleva factura?

---

### 2. Estados exactos del ciclo NV/Factura

**Contexto:** PROGRESS.md decía `Pendiente → Entregada → Cancelada`. El cliente mencionó también `despachada` y `pagada`.

**Pregunta concreta:** ¿Cuál es el flujo completo de estados? Por ejemplo:
```
Pendiente → Despachada → Entregada → Pagada
                                    ↓
                                 Cancelada (¿desde qué estados se puede cancelar?)
```

---

### 3. ¿Quién puede cambiar el estado?

**Pregunta concreta:** ¿El vendedor puede marcar como Despachada/Entregada, o eso es solo admin/subadmin?

---

### 5. Campos adicionales en PDF de Factura *(pendiente)*

**Contexto:** La Nota de Venta usa el mismo formato que la cotización (solo cambia el título). La Factura probablemente necesita campos adicionales.

**Confirmar con el cliente:** ¿Qué campos adicionales necesita el PDF de Factura?
- Número de OC del cliente
- Condición de pago (ej. "30 días")
- Fecha de vencimiento (ya está en el sistema, ¿mostrar en PDF?)
- Otros datos legales o comerciales requeridos

---

### 6. Campos del registro de pago en Factura

**Asunción actual:** Se guarda fecha de pago, monto y método (efectivo, transferencia, cheque) — todos opcionales por ahora.

**Confirmar:** ¿Qué campos son obligatorios al marcar una factura como pagada? ¿Hay métodos de pago adicionales (débito, crédito, depósito)?

---

### 4. Número correlativo de la Factura

**Contexto:** Las cotizaciones tienen numeración correlativa desde 12250.

**Pregunta concreta:** ¿Las facturas tienen su propio número correlativo? ¿Desde qué número parte? ¿Y las Notas de Venta tienen número propio también, o heredan el número de la cotización?
