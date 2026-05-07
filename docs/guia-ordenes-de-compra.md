# Órdenes de Compra y Recepción — Guía de usuario

Referencia práctica para crear, enviar y recepcionar Órdenes de Compra (OC) en Conico CRM.

---

## ¿Qué es una Orden de Compra?

La OC es el documento interno que formaliza la solicitud de mercadería a un proveedor. En Conico registra qué se compró, a qué precio y cuánto se recibió. Al recepcionar una OC, el stock del inventario sube automáticamente.

---

## Estados de una OC

| Estado | Descripción |
|--------|-------------|
| `borrador` | Creada, no enviada al proveedor. Editable. |
| `enviada` | Enviada al proveedor por correo desde Conico. |
| `recibida_parcial` | Al menos una línea fue recepcionada (pero no todas). |
| `recibida_completa` | Todas las líneas fueron recepcionadas en su totalidad. |
| `cancelada` | Anulada. Solo desde `borrador` o `enviada`. |

---

## Crear una Orden de Compra

1. **Menú → Órdenes de Compra** → botón **Nueva OC**.
2. Completar:

   | Campo | Descripción |
   |-------|-------------|
   | **Proveedor** | Proveedor al que se compra. |
   | **Fecha** | Fecha de la OC. Default: hoy. |
   | **Líneas de detalle** | Producto, cantidad y precio unitario de cada ítem. |
   | **Notas** | Observaciones internas o para el proveedor. |

3. Guardar → OC en estado `borrador`.

---

## Enviar al proveedor

Desde el detalle de la OC (estado `borrador`) → botón **Enviar por correo**:
- Conico envía el PDF de la OC al email del proveedor.
- El estado cambia a `enviada`.
- Una OC `enviada` no puede editarse.

---

## Recepcionar mercadería

Al llegar la mercadería del proveedor:

1. Abrir la OC → botón **Recepcionar**.
2. Para cada línea, ingresar la **cantidad efectivamente recibida** (puede ser menor a lo pedido).
3. Confirmar.

### Efectos de la recepción

- **Stock**: `producto.stock_actual` aumenta por la cantidad recibida. Crea un `MovimientoInventario` de tipo `entrada` con `referencia_tipo=orden_compra`.
- **Precio de costo**: si el precio unitario de la línea es mayor al costo registrado del producto, Conico actualiza `producto.precio_costo` automáticamente.
- **Estado OC**:
  - Todas las líneas recibidas en su totalidad → `recibida_completa`.
  - Solo algunas líneas o cantidades parciales → `recibida_parcial`.

### Recepciones parciales

Se puede recepcionar en múltiples etapas. Cada vez que se recepciona:
- Las cantidades se acumulan en `cantidad_recibida` por línea.
- El stock sube solo por el delta de esa recepción.
- La OC sigue en `recibida_parcial` hasta completar todas las líneas.

---

## Cancelar una OC

Solo se puede cancelar desde `borrador` o `enviada`:

1. Detalle de la OC → botón **Cancelar OC**.
2. Confirmar.

Una OC parcial o completamente recepcionada **no puede cancelarse** (el stock ya fue ajustado).

---

## Relación con inventario

La OC es la fuente principal de **entradas de stock**. El flujo completo:

```
Crear OC (borrador)
      │
      ▼
Enviar al proveedor (enviada)
      │
      ▼
Recepcionar mercadería
      │
      ▼
Stock sube → MovimientoInventario tipo=entrada / referencia_tipo=orden_compra
```

Los movimientos de entrada de OC son visibles en **Inventario → Movimientos** con enlace directo a la OC de origen.

---

## Reportes de OC pendientes

Las OC en estados `borrador`, `enviada` o `pendiente` aparecen en los reportes de compras pendientes. Útil para el seguimiento de pedidos en tránsito.

---

## Preguntas frecuentes

**¿Puedo editar una OC ya enviada?**
No. Una vez en estado `enviada`, la OC es inmutable. Si hay error, cancelar y crear una nueva.

**¿Qué pasa si recibo más de lo pedido?**
La cantidad recibida puede ser mayor a la pedida. El stock subirá por la cantidad efectivamente ingresada. No hay validación que bloquee recepciones superiores al pedido.

**¿Quién puede crear y recepcionar OC?**
Usuarios con permiso `ordenes_compra: create` y `ordenes_compra: edit`. Por defecto, Admin y SubAdmin. Los Vendedores no tienen acceso al módulo.

**¿Las OC generan DTE?**
No. Las OC son documentos internos. El DTE de compra (factura del proveedor) se registra en **DTE Recepción**, que es un módulo separado.
