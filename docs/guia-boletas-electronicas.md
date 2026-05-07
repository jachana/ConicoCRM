# Boletas Electrónicas — Guía de usuario

Referencia práctica para emitir, consultar y gestionar Boletas Electrónicas tipo 39 (afecta) y tipo 41 (exenta) en Conico CRM.

---

## ¿Qué es cada tipo?

| Tipo | Nombre oficial | IVA | Cuándo usarlo |
|------|---------------|-----|---------------|
| **39** | Boleta Electrónica Afecta | 19% sobre el neto | Venta de productos o servicios gravados con IVA. Caso más común. |
| **41** | Boleta Electrónica Exenta | 0% | Venta de servicios o bienes exentos de IVA (transporte terrestre de pasajeros, arrendamiento de inmuebles amoblados, etc.). |

**Regla práctica:** si no sabes cuál usar, tu contador confirma qué productos/servicios son exentos. El tipo por defecto en Conico es **39**.

---

## Flujos de emisión

### Venta anónima (consumidor final)

El comprador no requiere que la boleta esté a su nombre:

1. Menú lateral → **Boletas** → botón **Nueva Boleta**.
2. Dejar el campo **Cliente** en blanco.
3. Conico asigna automáticamente:
   - **RUT receptor:** `66666666-6` (RUT genérico del SII para consumidor final)
   - **Nombre:** `Consumidor Final`
4. Completar el resto del formulario y emitir.

### Venta identificada (cliente conocido)

Cuando el comprador quiere la boleta a su nombre:

1. En **Cliente**, buscar y seleccionar al cliente registrado.
2. Si no está registrado, se puede ingresar manualmente el **RUT** y **Nombre** del receptor sin crear un cliente.
3. El RUT y nombre se imprimirán en el PDF y en el XML enviado al SII.

### Venta de vehículo con patente

Para compraventas donde el SII exige la patente en el DTE:

1. Completar el formulario de boleta normalmente.
2. Ingresar la patente en el campo **Patente vehículo** (ej: `ABCD12`).
3. La patente queda registrada en `referencias` del XML DTE y aparece en el PDF y en los filtros de búsqueda.

---

## Crear una boleta paso a paso

1. Menú lateral → **Boletas** → **Nueva Boleta**.
2. Completar el formulario:

   | Campo | Descripción |
   |-------|-------------|
   | **Tipo DTE** | `39` (afecta, con IVA) o `41` (exenta, sin IVA). Default: 39. |
   | **Fecha** | Fecha de emisión. Default: hoy. |
   | **Cliente** | Opcional. Si se omite, se usa RUT genérico 66666666-6. |
   | **RUT receptor** | Alternativa al cliente: ingresar RUT manualmente si no es cliente registrado. |
   | **Nombre receptor** | Nombre del comprador cuando se usa RUT manual. |
   | **Método de pago** | `efectivo`, `débito`, `crédito`, `transferencia` u `otro`. Default: efectivo. |
   | **Patente vehículo** | Solo para venta de vehículos. Campo opcional. |
   | **Líneas de detalle** | Una o más líneas con descripción, cantidad y precio unitario. |

3. El sistema calcula automáticamente:
   - **Neto** = suma de (cantidad × precio unitario)
   - **IVA** = neto × 19% (solo para tipo 39; es 0 para tipo 41)
   - **Total** = neto + IVA

4. Click **Guardar** → la boleta se crea directamente en estado `no_emitida`.

> **Nota:** A diferencia de facturas, las boletas se emiten de forma **automática** al guardar si la integración Lioren está activa. Si la integración no está configurada, el botón **Emitir DTE** aparece en el detalle.

---

## Boleta tipo 41 (exenta) — consideraciones

- Las líneas de detalle de una boleta tipo 41 no pueden tener IVA.
- Conico valida esto al guardar: si una línea está marcada como afecta y el tipo es 41, el sistema rechaza la operación.
- El PDF imprime "Boleta Electrónica Exenta" y muestra solo el monto total sin desglosar neto/IVA.

---

## Estados del DTE

| Estado | Descripción |
|--------|-------------|
| `no_emitida` | Creada, no enviada al SII. Se puede editar. |
| `pendiente` | Enviada al SII, esperando resolución. |
| `aceptada` | SII aprobó. La boleta es válida tributariamente. |
| `rechazada` | SII rechazó. Ver detalle de error y reemitir. |

Una boleta `aceptada` no se puede modificar. Para corregirla, se debe anular con Nota de Crédito (ver sección Anulación).

---

## Anular una boleta

Cuando una boleta `aceptada` debe cancelarse:

1. Abrir el detalle de la boleta.
2. Botón **Anular** → se abre el modal de anulación.
3. Ingresar la **Razón de anulación** (texto libre).
4. Confirmar.

Conico crea automáticamente una **Nota de Crédito (DTE 61)** por el monto total de la boleta. La NC queda en estado `no_emitida` y debe emitirse contra el SII por separado desde la sección Notas de Crédito.

---

## PDF y envío por correo

### Descargar PDF

Desde el detalle de cualquier boleta (estado `aceptada`):
- Botón **Descargar PDF** → genera la representación impresa con folio SII, datos del receptor, líneas y totales.

### Enviar por correo electrónico

1. Abrir el detalle de la boleta.
2. Botón **Enviar por correo** → se abre un modal.
3. El campo de correo se pre-carga con el email del cliente si está registrado.
4. Se puede ingresar o cambiar la dirección manualmente.
5. Click **Enviar** → Conico envía el PDF al correo indicado.

---

## Buscar y filtrar boletas

En la lista de boletas (**Menú → Boletas**) están disponibles los siguientes filtros:

| Filtro | Tipo | Descripción |
|--------|------|-------------|
| Fecha desde / hasta | Fecha | Rango de fechas de emisión |
| Cliente | Texto | Nombre o RUT del cliente |
| Patente | Texto | Patente del vehículo |
| Estado | Selector | `no_emitida`, `pendiente`, `aceptada`, `rechazada` |
| Método de pago | Selector | efectivo, débito, crédito, transferencia, otro |
| Vendedor | Selector | Usuario que emitió la boleta |

---

## Exportar a Excel

En la lista de boletas → botón **Exportar Excel**:

- Descarga un archivo `.xlsx` con todas las boletas que coinciden con los filtros activos.
- Columnas: número, fecha, RUT, nombre receptor, método de pago, estado DTE, total, vendedor.
- Útil para cuadraturas de caja o reportes de ventas del período.

---

## Preguntas frecuentes

**¿Cuántos tipos de boleta puedo emitir?**
Dos: tipo 39 (afecta, con IVA 19%) y tipo 41 (exenta, sin IVA). No existe boleta tipo 34 para personas naturales — ese es un tipo de factura no afecta.

**¿Puedo cambiar el tipo de boleta después de guardar?**
No. El tipo DTE queda fijo al crear la boleta. Si se equivocó el tipo, debe anular la boleta y crear una nueva con el tipo correcto.

**¿La boleta rebaja stock automáticamente?**
No. El stock se descuenta al emitir una **Factura** o **Boleta** según la configuración del módulo de inventario. Confirmar con el administrador qué documentos afectan el stock en su empresa.

**¿Qué pasa si el SII rechaza la boleta?**
El estado queda en `rechazada`. En el detalle del DTE se muestra el código y mensaje de error del SII. Los errores más comunes son: RUT receptor inválido, monto negativo o folio CAF vencido. Corregir el problema y hacer click en **Emitir DTE** nuevamente.

**¿Puedo emitir boletas sin conexión a Lioren?**
Las boletas pueden guardarse en estado `no_emitida` sin Lioren. La integración con el SII (a través de Lioren) es necesaria para que el DTE sea válido tributariamente. Contactar al administrador para configurar las credenciales Lioren.

**¿Qué significa "Consumidor Final" en el RUT?**
Es el nombre estándar que el SII acepta para ventas al público general donde no se requiere identificar al comprador. El RUT `66666666-6` es el RUT genérico oficial para este caso.
