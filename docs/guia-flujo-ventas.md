# Guía de ventas: Cotización → Nota de Venta → Factura → Pago

Esta guía explica el flujo completo de ventas en Conico, desde crear una cotización hasta registrar el pago de la factura electrónica.

---

## Resumen del flujo

```
Cotización  →  Nota de Venta (NV)  →  Factura (DTE 33)  →  Pago
(abierta)      (pendiente)             (emitida)             (pagada)
```

Cada etapa tiene sus propios estados y transiciones. No es obligatorio seguir todos los pasos — se puede crear una factura directamente, pero el flujo completo da mayor trazabilidad.

---

## 1. Cotización

### Crear una cotización

Ve a **Cotizaciones** (`/cotizaciones`) y haz clic en **Nueva cotización**.

Completa:
- **Cliente / Empresa**: busca por nombre o RUT. Si no existe, créalo desde Clientes.
- **Fecha de vencimiento**: días de validez de la oferta.
- **Líneas de producto**: agrega productos o servicios con cantidad y precio unitario.
- **Descuentos**: se aplican por línea o en el total.
- **Notas internas**: no aparecen en el PDF del cliente.

Haz clic en **Guardar** para crear la cotización en estado **Sin definir** (`no_definido`).

### Estados de la cotización

| Estado | Significado |
|---|---|
| Sin definir | Recién creada, sin acción del cliente |
| Abierta | Enviada al cliente, esperando respuesta |
| Aprobada | Cliente acepta; lista para convertir a NV |
| Cerrada (FV) | Convertida en factura de venta |
| Rechazada | Cliente declinó |

Cambia el estado manualmente desde el detalle de la cotización usando el selector de estado.

### Enviar la cotización por email

Desde el detalle de la cotización, haz clic en **Enviar por email**. El sistema genera un PDF con:
- Logo de la empresa
- Datos del emisor y del cliente
- Tabla de líneas con precios unitarios, descuentos y totales
- Condiciones de pago y fecha de vencimiento

El PDF también se puede descargar directamente con el botón **Descargar PDF**.

### Límite de crédito

Si la empresa del cliente tiene una **línea de crédito configurada** y el monto de la cotización la supera, aparece una advertencia en el detalle. En ese caso:

- El sistema muestra el crédito disponible vs. el monto de la cotización.
- Un **admin** puede aprobar la excepción desde la pantalla de **Aprobaciones** (`/aprobaciones`).
- Sin aprobación, no es posible convertir la cotización a NV.

### Flujo de aprobación de margen

Si alguna línea tiene un margen por debajo del umbral configurado (margen negativo o demasiado bajo), el sistema solicita aprobación de margen:

1. El vendedor guarda la cotización con líneas de bajo margen.
2. El sistema crea una solicitud de aprobación visible en **Aprobaciones**.
3. Un **admin o subadmin** aprueba o rechaza, opcionalmente ajustando el precio propuesto.
4. Solo con aprobación activa se puede continuar el flujo.

---

## 2. Nota de Venta (NV)

### Convertir cotización a NV

Desde el detalle de una cotización **Aprobada**, haz clic en **Convertir a Nota de Venta**.

- Puedes seleccionar líneas parciales (entregas parciales).
- Las líneas seleccionadas se copian a la NV.
- La cotización queda en estado **Cerrada (FV)**.

También puedes crear una NV directamente desde `/notas-de-venta` → **Nueva NV** sin pasar por cotización.

### Estados de la NV

| Estado | Significado |
|---|---|
| Pendiente | Creada, no despachada |
| Despachada | Mercadería en camino o entregada al transporte |
| Entregada | Confirmación de recepción por el cliente |
| Pagada | Factura asociada pagada |

El estado se cambia manualmente desde el detalle de la NV. El botón **Generar Factura** aparece a partir del estado **Pendiente**.

### Despacho y guía de despacho

Si se requiere guía de despacho (DTE tipo 52) antes de facturar:
1. Desde la NV, genera la **Guía de despacho**.
2. Emite la guía (requiere folios CAF tipo 52).
3. Cambia el estado de la NV a **Despachada**.
4. Una vez entregada, genera la factura referenciando la guía.

---

## 3. Factura electrónica (DTE tipo 33)

### Crear una factura desde la NV

Desde el detalle de la NV, haz clic en **Generar Factura**. El sistema pre-rellena:
- Datos del cliente y empresa emisora
- Líneas de la NV con precios y descuentos
- Método de pago y plazo

Revisa los datos y haz clic en **Crear factura**.

La factura queda en estado **Emitida** con DTE en **Sin emitir** (aún no enviada al SII).

### Emitir el DTE al SII

Desde el detalle de la factura, haz clic en **Emitir DTE**. El proceso:

1. Conico envía el XML firmado al proveedor SII (Lioren).
2. El estado DTE cambia a **Enviando...** (`pendiente` o `procesando`).
3. El SII procesa el documento (puede tardar segundos a minutos).
4. El estado final es **DTE OK** (`aceptada`) o **Rechazada** (`rechazada`).

| Estado DTE | Descripción |
|---|---|
| Sin emitir | No enviado al SII |
| Enviando… | En cola o procesando |
| DTE OK | Aceptado por el SII — documento válido |
| Rechazada | Rechazado por el SII — ver error en el detalle |

> **Importante:** Una vez que la factura está en estado DTE OK, no se puede editar ni eliminar sin anularla primero.

### Requisitos para emitir

- Folios CAF tipo 33 vigentes cargados en `/migracion-inicial`.
- RUT de empresa configurado en `/configuracion`.
- Datos de conexión con Lioren (configurados por soporte).

### Anular una factura

Solo los **admin** pueden anular facturas. Desde el detalle, el botón **Cambiar estado → Anulada** aparece si la factura no tiene DTE en proceso. Si ya fue aceptada por el SII, se debe emitir una **Nota de crédito** para revertirla.

---

## 4. Pagos

### Registrar un pago

Desde el detalle de la factura, en la sección **Pagos**, haz clic en **Registrar pago**.

Completa:
| Campo | Descripción |
|---|---|
| Monto | Monto del pago (puede ser parcial) |
| Fecha | Fecha del pago efectivo |
| Método | Transferencia, cheque, efectivo, etc. |
| Nota | Referencia o número de transferencia |

Haz clic en **Registrar**. El pago queda registrado y el saldo pendiente se actualiza.

### Pagos parciales

Puedes registrar múltiples pagos parciales. El estado de la factura cambia a **Pagada** automáticamente cuando el total de pagos iguala o supera el monto de la factura.

### Eliminar un pago

Haz clic en el ícono de papelera junto al pago. Solo disponible para **admin**.

---

## Glosario DTE/SII

| Término | Significado |
|---|---|
| **DTE** | Documento tributario electrónico — factura, boleta, guía de despacho en formato XML firmado |
| **CAF** | Código de autorización de folios — archivo XML del SII que autoriza el rango de números de documentos |
| **Folio** | Número correlativo de un DTE, asignado dentro del rango CAF |
| **Emisor** | Empresa que emite el DTE (Conico actúa como representante) |
| **Receptor** | Empresa o persona que recibe el DTE |
| **Lioren** | Proveedor certificado SII que Conico usa para enviar y recibir DTEs |
| **Tipo 33** | Factura electrónica afecta (con IVA) |
| **Tipo 52** | Guía de despacho electrónica |
| **Tipo 61** | Nota de crédito electrónica (reversa de factura) |
| **Tipo 56** | Nota de débito electrónica |
| **IVA** | 19% sobre el monto neto; se calcula automáticamente |

---

## Errores frecuentes

| Problema | Causa | Solución |
|---|---|---|
| No aparece botón "Emitir DTE" | Factura sin folios disponibles | Sube CAF tipo 33 en `/migracion-inicial` |
| DTE rechazado | Error en datos (RUT, monto, referencia) | Ver detalle del error en la factura y corregir |
| Límite de crédito bloqueado | Cliente sin crédito disponible | Pide aprobación a un admin desde `/aprobaciones` |
| No puede convertir a NV | Cotización no aprobada o sin aprobación de margen | Aprueba la cotización y resuelve pendientes de margen |
| Factura no se puede editar | DTE en estado "Enviando" o "DTE OK" | Espera respuesta del SII o anula si es necesario |
