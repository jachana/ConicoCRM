# Dashboard Configurable — Spec

## Contexto

Fase 9 del proyecto Conico PMS. Reemplaza el placeholder `"Dashboard — próximamente"` en la ruta `/`.

## Resumen

Panel de widgets configurable por rol. Admin activa un modo edición para agregar, mover y configurar widgets con drag-and-drop libre. El layout de cada rol se persiste en base de datos. Vendedores ven sus propias métricas filtradas automáticamente por el backend.

---

## Arquitectura

### Backend

Nuevo router `backend/app/api/dashboard.py` montado en `/api/dashboard/`.

**Endpoints:**

| Método | Ruta | Descripción | Roles |
|--------|------|-------------|-------|
| GET | `/layout/{role}` | Lee layout del rol | todos |
| PUT | `/layout/{role}` | Guarda layout del rol | admin |
| GET | `/data/{widget_type}` | Datos para un widget | todos |

**Parámetros comunes de `/data/{widget_type}`:**
- `date_from: date` (opcional)
- `date_to: date` (opcional)
- `limit: int` (default 10, para rankings)

El backend detecta el rol del token JWT. Si el usuario es `vendedor`, agrega automáticamente `WHERE vendedor_id = current_user.id` en todas las queries que aplique. No requiere parámetro extra desde el frontend.

### Frontend

Nuevos archivos:

```
frontend/src/
  pages/Dashboard.tsx                    # Página principal
  components/dashboard/
    WidgetGrid.tsx                       # react-grid-layout wrapper
    Widget.tsx                           # Widget individual (datos + chart)
    WidgetPicker.tsx                     # Panel para agregar widgets (edit mode)
    WidgetConfig.tsx                     # Modal de configuración por widget
  hooks/
    useDashboardLayout.ts                # Carga y guarda layout via API
    useDashboardData.ts                  # Fetch de datos por widget type
  types/
    dashboard.ts                         # Tipos TypeScript
```

**Dependencias nuevas:**
- `react-grid-layout` — drag-and-drop y resize de widgets
- `recharts` — gráficos de barras, línea

---

## Modelo de datos

### Tabla `dashboard_layouts`

```sql
CREATE TABLE dashboard_layouts (
  role        VARCHAR(20) PRIMARY KEY,  -- 'admin' | 'subadmin' | 'vendedor'
  layout_json TEXT NOT NULL,
  updated_by  INTEGER REFERENCES users(id) ON DELETE SET NULL,
  updated_at  TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);
```

Una migración Alembic nueva.

### Estructura de `layout_json`

```json
{
  "widgets": [
    {
      "id": "w1",
      "type": "ventas_periodo",
      "chart": "bar",
      "date_range": "month",
      "grid": { "x": 0, "y": 0, "w": 6, "h": 4 }
    }
  ]
}
```

Campos por widget:
- `id`: string único generado en frontend (uuid corto)
- `type`: uno de los 8 tipos del catálogo
- `chart`: tipo de gráfico válido para ese widget
- `date_range`: `"today"` | `"week"` | `"month"` | `"quarter"` | `"year"` | `"custom"`
- `date_from` / `date_to`: solo si `date_range = "custom"`
- `grid`: posición y tamaño en react-grid-layout (cols=12)

---

## Catálogo de widgets

8 widgets pre-programados. Los tipos de gráfico son fijos por widget.

| `type` | Nombre UI | Chart types | Filtrable por fecha | Solo admin/subadmin |
|--------|-----------|-------------|--------------------|--------------------|
| `ventas_periodo` | Ventas del período | `kpi`, `bar`, `line` | sí | no |
| `cotizaciones_abiertas` | Cotizaciones abiertas | `kpi`, `bar` | sí | no |
| `top_clientes` | Top clientes | `table`, `bar` | sí | no |
| `top_productos` | Top productos | `table`, `bar` | sí | no |
| `stock_critico` | Stock crítico | `table` | no | no |
| `nv_por_cobrar` | NV por cobrar | `kpi`, `table` | no | no |
| `cotizaciones_por_vendedor` | Cotizaciones por vendedor | `table`, `bar` | sí | sí |
| `ventas_por_vendedor` | Ventas por vendedor | `table`, `bar` | sí | sí |

Los widgets marcados "Solo admin/subadmin" no aparecen en el WidgetPicker cuando el dashboard es del rol `vendedor`. El backend también devuelve 403 si un vendedor llama a `/data/cotizaciones_por_vendedor` o `/data/ventas_por_vendedor`.

### Tamaños de grid por defecto (cols=12, al agregar widget)

| `type` | w | h |
|--------|---|---|
| `ventas_periodo` (kpi) | 3 | 3 |
| `ventas_periodo` (bar/line) | 6 | 4 |
| `cotizaciones_abiertas` (kpi) | 3 | 3 |
| `cotizaciones_abiertas` (bar) | 6 | 4 |
| `top_clientes` / `top_productos` (table) | 6 | 5 |
| `top_clientes` / `top_productos` (bar) | 6 | 4 |
| `stock_critico` (table) | 6 | 5 |
| `nv_por_cobrar` (kpi) | 3 | 3 |
| `nv_por_cobrar` (table) | 6 | 5 |
| `cotizaciones_por_vendedor` / `ventas_por_vendedor` | 6 | 5 |

---

## Respuestas de la API de datos

### `ventas_periodo`
```json
{ "total": 4200000, "series": [{"periodo": "2026-01", "monto": 800000}, ...] }
```

### `cotizaciones_abiertas`
```json
{ "total": 12, "por_estado": [{"estado": "abierta", "count": 9}, {"estado": "no_definido", "count": 3}] }
```

### `top_clientes`
```json
[{ "cliente_id": 1, "nombre": "Empresa A", "total": 1200000 }, ...]
```

### `top_productos`
```json
[{ "producto_id": 1, "nombre": "Prod A", "sku": "SKU01", "cantidad": 45, "total": 900000 }, ...]
```

### `stock_critico`
```json
[{ "producto_id": 1, "nombre": "Prod X", "sku": "SKU01", "stock_actual": 2, "stock_minimo": 10 }, ...]
```

### `nv_por_cobrar`
Incluye NV en estado `pendiente` o `despachada` (excluye `entregada`, `pagada`, `cancelada`).
```json
{ "total_monto": 820000, "count": 7, "items": [{"numero": 45, "cliente": "...", "total": 320000}, ...] }
```

### `cotizaciones_por_vendedor` / `ventas_por_vendedor`
```json
[{ "vendedor_id": 1, "nombre": "Juan", "total": 2100000, "count": 8 }, ...]
```

---

## Edit mode UX

1. Botón **"Editar dashboard"** visible solo para `admin` (verificado por permiso en frontend y backend)
2. Al activar edit mode:
   - Grid muestra handles de drag y resize en cada widget
   - Cada widget muestra botones ⚙ (configurar) y ✕ (eliminar)
   - Panel lateral derecho: "Agregar widget" con lista del catálogo
3. Clic en ⚙: abre modal `WidgetConfig` con:
   - Selector de tipo de gráfico (solo los válidos para ese widget)
   - Selector de rango de tiempo (si aplica)
   - Selector de límite de filas (para tablas/rankings)
4. Clic en widget del catálogo: agrega con posición `{x:0, y:Infinity}` (se apila al final)
5. **Guardar**: `PUT /api/dashboard/layout/{role}` con layout completo → muestra toast de éxito
6. **Cancelar**: revierte al layout original (estado guardado antes de entrar a edit mode)
7. **Cargar template**: dropdown con presets hardcodeados en frontend que reemplazan el layout en memoria (admin debe guardar para persistir)

### Templates predefinidos

- **Ventas**: ventas_periodo (line), top_clientes (table), top_productos (bar)
- **Operacional**: cotizaciones_abiertas (kpi), stock_critico (table), nv_por_cobrar (kpi)
- **Completo**: todos los widgets para el rol

---

## Rangos de tiempo

| Valor | Descripción |
|-------|-------------|
| `today` | Hoy |
| `week` | Esta semana (lunes a hoy) |
| `month` | Este mes |
| `quarter` | Este trimestre |
| `year` | Este año |
| `custom` | Usa `date_from` y `date_to` |

El frontend calcula las fechas concretas al hacer fetch. El backend recibe siempre `date_from` y `date_to` como parámetros ISO.

---

## Permisos y roles

- **Admin**: puede entrar a edit mode, guardar layouts para cualquier rol, ver todos los datos
- **Subadmin**: ve el layout del rol `subadmin` (si no existe, usa el de `admin`), no puede editar
- **Vendedor**: ve el layout del rol `vendedor`, datos filtrados a `vendedor_id = current_user.id`

Si no existe layout guardado para un rol, el frontend muestra el template "Completo" por defecto (sin persistir).

---

## Testing

**Backend** — tests de integración en `backend/tests/test_dashboard.py`:
- CRUD de layouts por rol (GET/PUT, permisos)
- Cada endpoint de data: respuesta correcta con datos de prueba, filtro por fecha, filtro por vendedor

**Frontend** — validación manual:
- Modo vista: cada widget carga datos y renderiza correctamente
- Modo edición: agregar, mover, configurar, eliminar widgets; guardar y cancelar
- Cambio de rol: layout diferente por rol
- Vendedor: datos filtrados correctamente
