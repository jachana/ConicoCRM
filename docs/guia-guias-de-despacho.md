# Guías de Despacho (DTE 52) — Guía de usuario

Referencia práctica para emitir, consultar y gestionar Guías de Despacho electrónicas (tipo DTE 52) en Conico CRM.

---

## ¿Qué es una Guía de Despacho?

La Guía de Despacho (GD) es un documento tributario electrónico que acredita el traslado de mercadería de un lugar a otro. Es obligatoria cuando los bienes se mueven antes de emitir la factura correspondiente, o cuando el traslado no constituye una venta.

El SII exige indicar el **motivo de traslado** en cada GD.

---

## Motivos de traslado

| Código | Descripción | Cuándo usarlo |
|--------|-------------|--------------|
| **1** | Operación constituye venta | El traslado es la entrega de una venta. La factura se emite después. |
| **2** | Ventas por entregar | Mercadería ya facturada que aún no se ha entregado. |
| **3** | Consignaciones | Bienes enviados en consignación (el receptor no es dueño aún). |
| **4** | Entrega gratuita | Muestra, regalo, donación — sin transacción comercial. |
| **5** | Traslado interno | Movimiento entre bodegas o sucursales propias. |
| **6** | Otros traslados no venta | Traslados que no corresponden a ninguna categoría anterior. |
| **7** | Guía de devolución | Mercadería devuelta al proveedor o desde el cliente. |
| **8** | Traslado para exportación | Mercadería que va a zona de exportación. |
| **9** | Venta para exportación | Venta a exportador directo. |

El motivo más común en operaciones de venta es el **motivo 1** (la GD acompaña la entrega y la factura se emite después).

---

## Crear una Guía de Despacho

1. Menú lateral → **Guías de Despacho** → botón **Nueva GD**.
2. Completar el formulario:

   | Campo | Obligatorio | Descripción |
   |-------|-------------|-------------|
   | **Fecha** | Sí | Fecha del documento. Default: hoy. |
   | **Motivo de traslado** | Sí | Código 1–9 según tabla anterior. |
   | **Cliente** | No | Cliente que recibe la mercadería. |
   | **Nota de Venta vinculada** | No | NV de origen si el traslado corresponde a un pedido. |
   | **Dirección destino** | No | Dirección de entrega de la mercadería. |
   | **Comuna destino** | No | Comuna de destino para el XML DTE. |
   | **Email de envío** | No | Correo para enviar la GD al destinatario. |
   | **Líneas de detalle** | Sí (mínimo 1) | Descripción, cantidad y precio unitario de cada ítem. |

3. **Precios en las líneas:** el precio unitario se ingresa **con IVA incluido** (precio bruto), igual que en boletas. Conico desglosa automáticamente neto e IVA al calcular los totales.

4. Click **Guardar** → la GD queda en estado `no_emitida`.

> La Nota de Venta vinculada es opcional. Se puede crear una GD sin NV de referencia.

---

## Emitir la GD al SII

Una GD en estado `no_emitida` no tiene validez tributaria. Para enviarla al SII:

1. Abrir el detalle de la GD.
2. Click **Emitir DTE**.
3. El estado cambia a `pendiente` de inmediato.
4. Un proceso asíncrono (Celery) envía la GD a través de Lioren al SII.
5. Refrescar la página para ver el estado final.

### Estados DTE

| Estado | Descripción |
|--------|-------------|
| `no_emitida` | Creada, no enviada al SII. Se puede editar dirección/comuna/email, o eliminar. |
| `pendiente` | Enviada al SII, esperando respuesta de Lioren. |
| `procesando` | SII recibió y está procesando el DTE. |
| `aceptada` | SII aprobó. La GD es válida tributariamente. |
| `rechazada` | SII rechazó. Ver error y corregir. |

Una GD `aceptada` no puede eliminarse. Solo se puede anular mediante Nota de Crédito.

---

## Editar una GD después de guardar

Solo se pueden modificar los campos de **metadatos accesorios**:

- Dirección destino
- Comuna destino
- Email de envío

Los ítems, cantidades, precios y motivo de traslado son inmutables. Si hay error en esos campos, eliminar la GD (solo si está `no_emitida`) y crearla nuevamente.

---

## Eliminar una GD

Solo se puede eliminar si `dte_estado == no_emitida`. Una GD ya enviada al SII no puede eliminarse — debe anularse con Nota de Crédito.

---

## Anular una GD aceptada

Para anular una GD que ya fue aceptada por el SII:

1. Emitir una **Nota de Crédito (DTE 61)** vinculada a la GD.
2. En la lista de Guías de Despacho → abrir la GD → botón **Crear NC** (pre-carga la NC con `guia_despacho_id`).
3. Una vez que la NC sea aceptada por el SII, la GD queda automáticamente en estado `anulada`.

> La GD anulada permanece visible en el historial — no desaparece del sistema.

---

## Relación con otros documentos

```
Nota de Venta (NV)
      │
      ▼ (opcional)
Guía de Despacho (DTE 52)    ←── Factura se emite después
      │
      ▼ (para anular)
Nota de Crédito (DTE 61)
```

**Flujo típico de venta con despacho:**

1. Se registra la **Nota de Venta** con el pedido del cliente.
2. Al despachar, se emite la **Guía de Despacho** (motivo 1) vinculada a la NV.
3. Al mes o al cobrar, se emite la **Factura** que referencia la GD.

Este flujo es común en empresas que despachan mercadería antes de que el cliente apruebe la factura.

---

## PDF y envío por correo

### Descargar PDF

Desde el detalle de cualquier GD → botón **Descargar PDF**. El PDF incluye:

- Datos del emisor (con logo si está configurado en Settings)
- Número y fecha
- Motivo de traslado
- Dirección de destino
- Listado de ítems con cantidades y precios
- Totales (neto, IVA, total)

### Enviar por correo electrónico

1. Abrir el detalle de la GD → botón **Enviar por correo**.
2. Conico resuelve el destinatario en este orden:
   - Correo ingresado manualmente en el modal
   - Campo **Email de envío** guardado en la GD
   - Email del cliente asociado
3. Error 422 si no se encuentra ningún correo.

---

## Buscar y filtrar GDs

En la lista **Menú → Guías de Despacho**:

| Filtro | Descripción |
|--------|-------------|
| Estado | `emitida`, `anulada` |
| Estado DTE | `no_emitida`, `pendiente`, `procesando`, `aceptada`, `rechazada` |
| Cliente | Filtrar por cliente asociado |
| Desde / Hasta | Rango de fechas |

Los vendedores solo ven sus propias GDs; administradores ven todas.

---

## Exportar a Excel

Lista de GDs → botón **Exportar Excel**:

- Descarga `.xlsx` con todas las GDs que coincidan con los filtros activos.
- Útil para cuadratura de despachos del período o revisión con el contador.

---

## Importación histórica (GDs de otro sistema)

Conico permite importar GDs históricas desde un Excel con dos hojas:

| Hoja | Columnas mínimas |
|------|-----------------|
| **Cabecera GD** | `folio_guia`, `fecha`, `tipo_traslado` (1–9) |
| **Detalle GD** | `folio_guia`, `cantidad` |

Campos opcionales en Cabecera: `rut_receptor`, `sede_destino`, `folio_factura`.  
Campos opcionales en Detalle: `sku` (para vincular con producto existente).

El importador valida folios únicos y tipos de traslado válidos antes de insertar.

---

## Preguntas frecuentes

**¿La GD descuenta stock?**
No. Las Guías de Despacho no afectan el inventario en Conico. El stock se descuenta al emitir la Factura o Boleta correspondiente.

**¿Puedo crear una GD sin cliente?**
Sí. El campo cliente es opcional. Si no se especifica, el XML DTE puede quedar sin receptor identificado — verificar con el contador si esto es válido para el tipo de traslado.

**¿Puedo vincular más de una GD a una sola Nota de Venta?**
Sí. No hay restricción de 1:1. Un pedido grande puede despacharse en múltiples GDs, todas vinculadas a la misma NV.

**¿Qué pasa si el SII rechaza la GD?**
El estado queda en `rechazada`. Revisar el mensaje de error en el detalle del DTE. Errores comunes: RUT del cliente inválido, motivo de traslado fuera de rango, o CAF vencido. Corregir lo que sea posible (en GDs `rechazadas`, algunos campos pueden editarse) y hacer click en **Emitir DTE** nuevamente.

**¿La factura debe referenciar la GD?**
Depende del caso. Si la GD se emitió con motivo 1 (venta), la factura posterior debe referenciar el folio de la GD en el XML DTE. Conico gestiona esta referencia automáticamente cuando la factura se genera desde la NV vinculada a la GD.

**¿Puedo emitir una GD sin la integración Lioren configurada?**
La GD puede guardarse en estado `no_emitida` sin Lioren. El botón **Emitir DTE** requiere credenciales Lioren activas. Contactar al administrador para configurarlas en Settings → Integraciones.
