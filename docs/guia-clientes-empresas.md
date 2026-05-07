# Guía: Gestión de Clientes y Empresas

Esta guía cubre la creación y administración de clientes y empresas en Conico: datos maestros, sedes de despacho, líneas de crédito, historial (timeline) e importación masiva desde Excel.

---

## Conceptos clave

| Concepto | Descripción |
|---|---|
| **Cliente** | Persona natural o de contacto asociada a una empresa |
| **Empresa** | Razón social compradora; tiene RUT, crédito y sedes propias |
| **Sede de despacho** | Dirección alternativa de entrega para una empresa |
| **Línea de crédito** | Monto máximo de deuda autorizado; bloquea operaciones si se supera |
| **Timeline** | Historial de documentos emitidos vinculados al cliente o empresa |

Un **cliente** puede existir sin empresa (persona natural), o estar vinculado a una empresa. Los documentos (cotizaciones, NV, facturas) se emiten a un cliente y quedan asociados a su empresa.

---

## 1. Clientes

### Crear un cliente

Ve a **Clientes** (`/clientes`) y haz clic en **Nuevo cliente**.

| Campo | Obligatorio | Descripción |
|---|---|---|
| Nombre | Sí | Nombre completo del contacto |
| RUT | No | RUT chileno con guion (ej. `12.345.678-9`) |
| Email | No | Se usa para envío de cotizaciones y documentos |
| Teléfono | No | Número de contacto |
| Empresa | No | Empresa a la que pertenece el cliente |
| Dirección de despacho | No | Dirección particular del contacto |
| Recibe correos | — | Activar para incluirlo en envíos automáticos |
| Notas | No | Observaciones internas |

Haz clic en **Guardar**. El cliente queda disponible inmediatamente en buscadores y formularios de documentos.

### Validación de RUT

El sistema valida el dígito verificador del RUT automáticamente. Si es incorrecto, aparece un error al guardar. El formato aceptado es:

- Con puntos y guion: `12.345.678-9`
- Sin puntos, con guion: `12345678-9`

El sistema normaliza el formato al guardar.

### Editar o buscar un cliente

Usa la barra de búsqueda en `/clientes` para filtrar por nombre, RUT o empresa. Haz clic en un cliente para abrir el panel de detalle, donde puedes editar sus datos o ver el timeline de documentos.

---

## 2. Empresas

### Crear una empresa

Ve a **Empresas** (`/empresas`) y haz clic en **Nueva empresa**.

| Campo | Obligatorio | Descripción |
|---|---|---|
| Nombre / Razón social | Sí | Nombre legal de la empresa |
| RUT | Sí | RUT empresa con guion (ej. `76.543.210-K`) |
| Email | No | Email principal de contacto |
| Teléfono | No | Teléfono de la empresa |
| Giro | No | Actividad comercial |
| Dirección | No | Dirección fiscal |
| Línea de crédito | No | Monto máximo autorizado de deuda (ver sección 4) |
| Plazo de crédito | No | Días de pago (ej. 30, 60, 90 días) |

### Vincular clientes a una empresa

Desde el detalle de un cliente, selecciona la empresa en el campo **Empresa**. También puedes filtrar clientes por empresa desde `/clientes`.

Una empresa puede tener múltiples clientes de contacto.

---

## 3. Sedes de despacho

Las sedes de despacho son direcciones alternativas de entrega para una empresa. Son útiles cuando el cliente tiene bodegas o sucursales distintas a la dirección fiscal.

### Agregar una sede

1. Ve a **Empresas** y abre el detalle de la empresa.
2. En la pestaña **Sedes**, haz clic en **Agregar sede**.
3. Completa nombre (ej. "Bodega Norte") y dirección.
4. Haz clic en **Guardar**.

La sede queda disponible en el selector de dirección de despacho al crear notas de venta y guías de despacho.

**Límite:** máximo 10 sedes por empresa.

### Editar o eliminar una sede

Desde la lista de sedes en el detalle de la empresa, usa los íconos de lápiz (editar) o papelera (eliminar). La eliminación es definitiva.

---

## 4. Línea de crédito

La línea de crédito controla cuánto puede deber una empresa antes de que el sistema bloquee nuevas operaciones.

### Configurar la línea de crédito

En el formulario de empresa (crear o editar), completa:
- **Línea de crédito**: monto en pesos (ej. `500000` = $500.000)
- **Plazo de crédito**: días de pago estándar (ej. `30`)

Si la línea de crédito es `0` o está vacía, no hay límite activo.

### Comportamiento del sistema

| Situación | Reacción |
|---|---|
| Deuda actual < línea de crédito | Operación normal |
| Deuda actual ≥ línea de crédito | Advertencia al crear cotización o NV |
| Exceso y sin aprobación | Requiere aprobación de admin para continuar |

La deuda se calcula sumando facturas emitidas y no pagadas vinculadas a la empresa.

### Aprobar excepción de crédito

Si un admin necesita autorizar una operación sobre el límite:
1. El vendedor crea la cotización (aparece advertencia de crédito).
2. El admin va a **Aprobaciones** (`/aprobaciones`) y aprueba la solicitud.
3. El vendedor puede continuar con la conversión a NV y factura.

---

## 5. Timeline (historial de documentos)

El timeline muestra todos los documentos emitidos vinculados a un cliente o empresa, en orden cronológico inverso.

### Ver el timeline de un cliente

1. Ve a **Clientes** y haz clic en el cliente.
2. En el panel lateral, selecciona la pestaña **Timeline**.
3. Aparecen cotizaciones, notas de venta, facturas, boletas y guías de despacho con fecha, estado y monto.

### Ver el timeline de una empresa

1. Ve a **Empresas** y haz clic en la empresa.
2. Selecciona la pestaña **Timeline**.
3. Muestra todos los documentos de todos los clientes vinculados a esa empresa.

El timeline es de solo lectura — los documentos se acceden haciendo clic en cada entrada.

---

## 6. Importación masiva desde Excel

Puedes importar clientes y empresas en lote desde un archivo Excel.

### Plantilla de importación

Ve a **Migración inicial** (`/migracion-inicial`) → pestaña **Clientes y Empresas**.

Descarga la plantilla de Excel haciendo clic en **Descargar plantilla**. La plantilla incluye las columnas requeridas con ejemplos de datos.

### Columnas de la plantilla

| Columna | Descripción | Formato |
|---|---|---|
| `rut_empresa` | RUT de la empresa | `76.543.210-K` |
| `nombre_empresa` | Razón social | Texto |
| `rut_cliente` | RUT del contacto | `12.345.678-9` |
| `nombre_cliente` | Nombre completo | Texto |
| `email_cliente` | Email de contacto | Texto |
| `telefono_cliente` | Teléfono | Texto |

### Proceso de importación

1. Completa la plantilla Excel con tus datos.
2. En `/migracion-inicial` → **Clientes y Empresas**, haz clic en **Subir archivo**.
3. Selecciona tu archivo Excel.
4. El sistema muestra una **previsualización**: filas válidas a crear, filas a actualizar y errores.
5. Revisa los errores en la tabla (columna, motivo) y corrígelos en el Excel si es necesario.
6. Haz clic en **Confirmar importación** para ejecutar.
7. Se muestra el resumen: creadas, actualizadas, sin cambio, errores.

### Reglas de importación

- Si el RUT de empresa ya existe, se **actualiza** (no se duplica).
- Si el RUT de cliente ya existe bajo esa empresa, se actualiza.
- Filas con RUT inválido se marcan como error y se omiten.
- La importación es incremental: puedes re-importar el mismo archivo sin duplicar registros.

### Errores frecuentes en importación

| Error | Causa | Solución |
|---|---|---|
| RUT inválido | Dígito verificador incorrecto | Verifica el RUT en el SII o corrige el dígito |
| Columna faltante | Plantilla incompleta | Usa siempre la plantilla descargada desde la app |
| Empresa sin nombre | `nombre_empresa` vacío | Completa el campo en el Excel |
| Email duplicado | Mismo email en dos filas | Unifica en una sola fila o usa emails distintos |

---

## Resumen de rutas

| Módulo | Ruta |
|---|---|
| Listado de clientes | `/clientes` |
| Listado de empresas | `/empresas` |
| Importación masiva | `/migracion-inicial` → pestaña Clientes y Empresas |
| Aprobaciones de crédito | `/aprobaciones` |
