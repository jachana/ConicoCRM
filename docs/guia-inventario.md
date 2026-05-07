# Inventario y Control de Stock — Guía de usuario

Referencia práctica para gestionar el inventario, entender cuándo se descuenta el stock y hacer ajustes manuales en Conico CRM.

---

## Conceptos clave

### stock_actual y stock_mínimo

Cada producto tiene dos valores de stock:

| Campo | Descripción |
|-------|-------------|
| **stock_actual** | Unidades disponibles actualmente en inventario. |
| **stock_mínimo** | Umbral de alerta. Si `stock_actual < stock_mínimo`, el producto aparece como **Crítico** en rojo. |

El stock mínimo no bloquea ventas — solo alerta.

---

## ¿Cuándo se descuenta el stock?

Este es el punto más importante: **el momento del descuento depende del tipo de documento.**

| Documento | ¿Cuándo descuenta stock? |
|-----------|--------------------------|
| **Boleta** | Al crear la boleta (inmediato). |
| **Nota de Venta** | Al crear la NV (si el producto tiene costo cargado). Si el costo es $0, queda en estado `pendiente_aprobacion_costo` y no descuenta hasta que se apruebe. |
| **Factura** | **Nunca** — las facturas no afectan el stock directamente. |
| **Guía de Despacho** | **Nunca** — solo registra el traslado, no modifica inventario. |
| **Orden de Compra** | Descuenta al recepcionar (entrada de mercadería). |

> **Resumen práctico:** Las boletas y notas de venta descontadas → si emites una factura sin nota de venta previa, el stock no se mueve. Verifica el flujo con tu contador para asegurarte de que el ciclo es el correcto para tu empresa.

### ¿Qué pasa si se anula una Nota de Venta?

Al anular o eliminar una NV, Conico **revierte automáticamente** el movimiento de salida — el stock vuelve al valor anterior.

---

## Ver el inventario

**Menú → Inventario → pestaña Stock actual**

La tabla muestra todos los productos con:

| Columna | Descripción |
|---------|-------------|
| Nombre | Nombre del producto |
| SKU | Código de identificación |
| Stock mínimo | Umbral de alerta |
| Stock actual | Unidades disponibles |
| Estado | **OK** (verde) o **Crítico** (rojo) si está bajo el mínimo |

### Filtrar y buscar

- **Búsqueda por nombre o SKU**: campo de texto en la parte superior.
- Los Admins ven además la fecha de última actualización de costo.

### Alerta de stock bajo

Los productos con `stock_actual < stock_mínimo` se muestran en rojo con estado **Crítico**. También están disponibles vía API en `/api/inventario/stock-bajo` para integraciones o revisiones programáticas.

---

## Ver movimientos de inventario

**Menú → Inventario → pestaña Movimientos**

Registro completo de todos los cambios de stock, con:

| Columna | Descripción |
|---------|-------------|
| Fecha | Cuándo ocurrió el movimiento |
| Producto | Producto afectado |
| Tipo | `entrada`, `salida` o `ajuste` |
| Cantidad | Unidades (con signo: + suma, − resta) |
| Referencia | Documento origen (NV, boleta, OC, ajuste manual) |
| Usuario | Quién generó el movimiento |

### Filtros disponibles

- **Tipo**: entrada / salida / ajuste
- **Fecha desde / hasta**: rango de fechas

Los movimientos incluyen un enlace directo al documento de referencia (clic en la referencia para abrir la NV, boleta u OC correspondiente).

---

## Ajuste manual de stock

Para corregir el stock por conteo físico, mermas, devoluciones o correcciones:

1. **Menú → Inventario** → botón **Ajuste manual**.
2. Completar el formulario:

   | Campo | Descripción |
   |-------|-------------|
   | **Producto** | Seleccionar el producto a ajustar. |
   | **Tipo** | **Suma** (+1) o **Resta** (−1). |
   | **Cantidad** | Unidades a sumar o restar (número positivo). |
   | **Motivo** | Ver tabla de motivos abajo. |
   | **Nota** | Texto libre explicativo (opcional pero recomendado). |

3. Guardar. El movimiento queda registrado con el usuario que realizó el ajuste.

### Motivos de ajuste

| Motivo | Cuándo usarlo |
|--------|--------------|
| **Conteo físico** | Resultado de inventario físico periódico. |
| **Merma** | Productos dañados, vencidos o perdidos. |
| **Corrección** | Error en un movimiento anterior. |
| **Otro** | Cualquier causa no contemplada en los anteriores. |

> **Protección anti-negativo:** El sistema rechaza ajustes que llevarían el stock a valores negativos. Si necesitas reducir más de lo disponible, primero verificar si hay stock registrado incorrectamente.

---

## Carga inicial de stock (onboarding)

Para cargar el inventario inicial desde otro sistema:

1. Preparar un Excel con las columnas:

   | Columna | Requerido | Descripción |
   |---------|-----------|-------------|
   | `sku` | Sí | SKU del producto (debe existir en el catálogo). |
   | `nombre_bodega` | Sí | Nombre exacto de la bodega. |
   | `cantidad` | Sí | Unidades a cargar. |
   | `costo_unitario` | No | Costo unitario del producto. |

2. Ir a **Configuración → Importar stock inicial** → subir el archivo.
3. El sistema valida SKUs, nombres de bodega y detecta duplicados.
4. Resultado: reporte con filas exitosas y errores por fila.

El proceso genera movimientos de tipo `entrada` con motivo `carga_inicial` para trazabilidad completa.

---

## Relación con el catálogo de productos

El inventario está directamente ligado al **catálogo**. Para que un producto aparezca en inventario:

1. Debe estar creado en **Catálogo → Productos**.
2. Debe tener un **SKU** asignado.
3. El campo **stock_mínimo** se configura en la ficha del producto.

Para actualizar el stock mínimo de un producto:
- **Catálogo → Productos** → editar el producto → campo **Stock mínimo**.

---

## Flujos comunes

### Flujo de venta con boleta (retail)

```
Crear Boleta
     │
     ▼
Stock se descuenta automáticamente
     │
     ▼
MovimientoInventario: salida / referencia_tipo=boleta
```

### Flujo de venta con Nota de Venta

```
Crear Nota de Venta
     │
     ├── Producto con costo cargado → Stock descuenta al crear NV
     │
     └── Producto con costo $0 → NV en "pendiente_aprobacion_costo"
                                     │
                                     ▼
                              Admin aprueba costo → Stock descuenta
```

### Flujo de compra (entrada de mercadería)

```
Crear Orden de Compra
     │
     ▼
Recepcionar OC
     │
     ▼
Stock aumenta → MovimientoInventario: entrada / referencia_tipo=orden_compra
```

---

## Preguntas frecuentes

**¿Puedo tener stock negativo?**
No. El sistema bloquea ajustes manuales que resultarían en stock negativo. Para ventas (boletas/NV), el sistema sí puede descontar stock si no hay validación previa activada — consulta con el administrador la configuración vigente.

**¿El inventario funciona por bodega?**
La carga inicial es por bodega, pero el `stock_actual` del producto es una cifra global (suma de todas las bodegas). No hay vista de stock por bodega en tiempo real actualmente.

**¿Cómo sé qué documento originó un movimiento?**
En la pestaña **Movimientos**, cada fila tiene un enlace directo al documento de origen (NV, boleta, OC o ajuste manual). El campo `referencia_tipo` indica el tipo.

**¿Los movimientos de inventario se pueden eliminar?**
No directamente. Son registros de auditoría inmutables. Para corregir un error, hacer un ajuste manual en sentido contrario con motivo **Corrección**.

**¿Quién puede hacer ajustes manuales?**
Solo usuarios con permiso `inventario: edit`. Por defecto, Admin y SubAdmin. Los Vendedores no tienen acceso al módulo de inventario.

**¿El stock se sincroniza con el SII?**
No. El inventario es un control interno de Conico. El SII no recibe información de stock — solo los DTE (facturas, boletas, etc.).
