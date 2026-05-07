# Notas de Crédito y Débito — Guía de usuario

Referencia práctica para emitir, consultar y entender las Notas de Crédito (NC, DTE tipo 61) y Notas de Débito (ND, DTE tipo 56) en Conico CRM.

---

## ¿Cuándo usar cada una?

| Situación | Documento | Tipo DTE |
|-----------|-----------|----------|
| Corregir un precio cobrado de más en una factura | Nota de Crédito | 61 |
| Anular una factura completa | Nota de Crédito | 61 |
| Anular una boleta electrónica | Nota de Crédito | 61 |
| Anular una guía de despacho | Nota de Crédito | 61 |
| Corregir un precio cobrado de menos en una factura | Nota de Débito | 56 |
| Agregar un cargo adicional a una factura ya emitida | Nota de Débito | 56 |
| Cobrar intereses por pago tardío | Nota de Débito | 56 |
| Reversar un descuento otorgado | Nota de Débito | 56 |

**Regla general:**
- NC **reduce** el monto que el cliente debe → el cliente paga menos o recupera dinero.
- ND **aumenta** el monto que el cliente debe → el cliente paga más.

Ambas son documentos tributarios electrónicos (DTE) que deben ser aceptados por el SII antes de quedar vigentes.

---

## Notas de Crédito (DTE 61)

### Casos de uso

#### Corrección total de factura (anulación)

Cuando una factura fue emitida con error grave o el cliente devuelve toda la mercadería:

1. Crear una NC por el **monto total** de la factura original.
2. En el campo **Razón**, indicar: `"Anulación factura N° [número]"`.
3. Las líneas de detalle deben replicar las líneas de la factura original con los mismos montos.

Ejemplo:
- Factura N° 1045, monto total: $119.000 (neto $100.000 + IVA $19.000)
- NC: 1 línea → descripción `"Anulación factura 1045"`, precio unitario $100.000
- Resultado: NC por neto $100.000, IVA $19.000, total $119.000

#### Corrección parcial de factura

Cuando el precio real fue menor al facturado:

1. Crear NC por la **diferencia** entre lo facturado y lo correcto.
2. En Razón: `"Corrección precio ítem X en factura N° [número]"`.

Ejemplo:
- Factura N° 1046 cobró producto a $50.000, el precio correcto era $40.000.
- Diferencia neta: $10.000
- NC: 1 línea → descripción `"Corrección precio producto X"`, precio unitario $10.000
- Resultado: NC por neto $10.000, IVA $1.900, total $11.900

#### Anulación de boleta electrónica

El SII permite anular boletas electrónicas dentro de un plazo mediante NC:

1. Crear NC con el monto total de la boleta.
2. En Razón: `"Anulación boleta N° [número]"`.
3. El campo **boleta_id** vincula la NC a la boleta original (visible en el sistema).

#### Anulación de guía de despacho

Si una guía de despacho debe anularse antes de facturar:

1. Ir a la guía de despacho → botón **Crear NC** (pre-carga el formulario con `guia_despacho_id`).
2. Conico vincula automáticamente la NC a la guía mediante el campo interno.
3. En Razón: `"Anulación guía de despacho N° [número]"`.

> **Nota:** Una NC puede anular **una sola cosa** a la vez: una boleta O una guía de despacho. No se puede emitir una NC que anule dos documentos simultáneamente.

### Crear una Nota de Crédito en Conico

1. Menú lateral → **Notas de Crédito** → botón **Nueva NC**.
2. Completar el formulario:

   | Campo | Descripción |
   |-------|-------------|
   | **Fecha** | Fecha del documento (por defecto hoy). |
   | **Cliente** | Seleccionar el cliente de la factura/boleta original. |
   | **Razón** | Texto libre que explica el motivo (aparece en el XML del DTE). |
   | **Líneas de detalle** | Agregar una o más líneas con descripción, cantidad y precio unitario. |

3. El sistema calcula automáticamente:
   - **Neto** = suma de (cantidad × precio unitario) por cada línea
   - **IVA** = neto × 19%
   - **Total** = neto + IVA

4. Click **Guardar** → la NC queda en estado `no_emitida`.
5. Para enviar al SII: abrir la NC → botón **Emitir DTE**.

### Estados de la NC

| Estado | Descripción |
|--------|-------------|
| `no_emitida` | Creada pero no enviada al SII. Se puede editar o eliminar. |
| `pendiente` | Enviada al SII, esperando resolución (proceso asíncrono). |
| `aceptada` | SII aceptó el DTE. La NC es válida tributariamente. |
| `rechazada` | SII rechazó el DTE. Revisar el error y reemitir. |

> Una NC en estado `aceptada` **no se puede modificar ni eliminar**. Si hay error, se debe emitir otra NC corrigiendo la primera.

---

## Notas de Débito (DTE 56)

### Casos de uso

#### Cargo adicional por servicio no contemplado

Si se prestó un servicio extra que no estaba en la factura original:

1. Crear ND por el monto del servicio adicional.
2. En Razón: `"Cargo adicional: [descripción del servicio]"`.

#### Intereses por pago tardío

Si el contrato contempla recargos por mora:

1. Calcular el monto de interés.
2. Crear ND con una línea: descripción `"Intereses mora [período]"`, monto del interés.

#### Reversar descuento otorgado

Si se aplicó un descuento que no correspondía:

1. Crear ND por el monto del descuento revertido.
2. En Razón: `"Reverso descuento aplicado en factura N° [número]"`.

### Crear una Nota de Débito en Conico

1. Menú lateral → **Notas de Débito** → botón **Nueva ND**.
2. Completar el formulario:

   | Campo | Descripción |
   |-------|-------------|
   | **Fecha** | Fecha del documento (por defecto hoy). |
   | **Cliente** | Obligatorio. |
   | **Razón** | Motivo del cargo adicional. |
   | **Líneas de detalle** | Descripción, cantidad y precio unitario del cargo. |

3. El sistema calcula neto, IVA (19%) y total automáticamente.
4. Click **Guardar** → estado `no_emitida`.
5. Para enviar al SII: abrir la ND → botón **Emitir DTE**.

### Estados de la ND

Mismos estados que la NC: `no_emitida` → `pendiente` → `aceptada` / `rechazada`.

---

## Comparación NC vs ND

| Característica | NC (DTE 61) | ND (DTE 56) |
|----------------|-------------|-------------|
| Efecto en saldo | Reduce deuda del cliente | Aumenta deuda del cliente |
| Puede anular guía de despacho | Sí (campo guia_despacho_id) | No |
| Puede anular boleta | Sí (campo boleta_id) | No |
| Cliente obligatorio | No (puede ser nulo para boletas anónimas) | Sí, siempre |
| IVA aplicado | 19% sobre neto | 19% sobre neto |
| Número correlativo | Secuencia propia (nc_last_id) | Secuencia propia (nd_last_id) |

---

## Proceso de emisión DTE

Al hacer click en **Emitir DTE**:

```
Conico crea DteEmision (tipo 061 ó 056)
         │
         ▼
Tarea asíncrona Celery → envío a SII vía Lioren
         │
         ▼
SII responde (TrackID)
         │
         ▼
Polling hasta estado final: aceptado / rechazado
         │
         ▼
dte_estado actualizado en el documento
```

El proceso es asíncrono: al hacer click en Emitir, el estado pasa a `pendiente` de inmediato. La respuesta final del SII puede demorar segundos o minutos. Refrescar la página para ver el estado actualizado.

---

## PDF del documento

En el detalle de cualquier NC o ND (estado `aceptada`), el botón **Descargar PDF** genera la representación impresa del DTE con:

- Datos del emisor y receptor
- Número de folio SII
- Fecha de emisión
- Razón del documento
- Detalle de líneas
- Montos (neto, IVA, total)

El PDF puede descargarse y enviarse al cliente como comprobante.

---

## Preguntas frecuentes

**¿Puedo emitir una NC sin vincularla a ningún documento original?**
Sí. El campo razón explica el motivo. El SII acepta NC sin referencia explícita a documento original, aunque es buena práctica incluir el número de la factura o boleta en la razón.

**¿La NC cambia el estado de la factura original en Conico?**
Actualmente no. El estado de la factura no se modifica automáticamente. El impacto tributario queda registrado en el libro de ventas del SII.

**¿Puedo emitir una ND para un cliente sin factura previa?**
Sí, la ND es un documento independiente. Solo requiere un cliente registrado en el sistema.

**¿Qué pasa si el SII rechaza el DTE?**
El estado queda en `rechazada`. Revisar el campo `respuesta_sii` (visible en la página de detalle del DTE) para ver el código de error. Corregir el problema y volver a hacer click en **Emitir DTE**.

**¿Se puede anular una NC o ND ya aceptada?**
No existe botón de anulación directa. Para anular una NC aceptada, se debe emitir una nueva NC que contrarreste la primera. Contactar al contador para definir el asiento correcto.
