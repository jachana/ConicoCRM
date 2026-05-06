# Roles y Permisos — Referencia

> Estado: documento vivo. Última revisión: 2026-05-06.
>
> Audiencia: developers, operadores, soporte y onboarding. Aquí se documenta **quién puede hacer qué** dentro de Conico, cómo se resuelve cada decisión en tiempo de ejecución, y dónde mirar el código fuente cuando algo no calza con lo descrito acá.
>
> Si ves una discrepancia entre este documento y el código, **el código gana**: por favor abre un PR para sincronizar este archivo (paths y line numbers están al final, en *Referencia rápida al código*).

---

## 1. Modelo en una página

Conico tiene **tres capas independientes** que un request debe pasar antes de llegar al handler:

```
┌──────────────────────────────────────────────────────────────────┐
│  1. Autenticación   ── ¿Hay un JWT válido? (get_current_user)    │
│           ↓                                                      │
│  2. Rol + Permiso   ── ¿El rol del usuario (con override por     │
│                          usuario) tiene permiso sobre módulo +   │
│                          acción?  (require_permission / Depends) │
│           ↓                                                      │
│  3. Módulo activo   ── ¿La empresa tiene este módulo habilitado? │
│                          (require_modulo / ModuloGuard)          │
└──────────────────────────────────────────────────────────────────┘
```

Una acción se permite **solo si las tres capas la permiten**. Si cualquiera falla:

| Capa | HTTP | Detail |
|------|------|--------|
| 1. Autenticación | `401 Unauthorized` | `Invalid token` / `User not found` |
| 2. Permiso | `403 Forbidden` | `Sin permisos` (`Solo administradores` para `require_admin`) |
| 3. Módulo desactivado | `403 Forbidden` | `{"error": "modulo_disabled", "slug": "...", "label": "..."}` |

> **Nota práctica para soporte:** un `403` con `detail.error == "modulo_disabled"` no es un problema de roles — es un módulo apagado en la empresa. Se arregla en `Configuración → Módulos`, no en permisos por usuario.

---

## 2. Roles base

Conico tiene tres roles, almacenados como string en `users.role` (`backend/app/models/user.py`):

| Rol | Para quién | Capacidades distintivas |
|-----|-----------|-------------------------|
| **`admin`** | Dueño / gerente / TI | Bypass total: ignora overrides y siempre obtiene `True` en `has_permission`. Único rol que ve `usuarios`, `rrhh`, auditoría, telemetría, configuración avanzada. |
| **`subadmin`** | Jefe de operaciones, contador, supervisor de ventas | Casi todo lo de admin **excepto** gestión de usuarios y RRHH. Puede leer libros pero no editarlos. Puede ver y aprobar (en algunos flujos), pero no toca usuarios. |
| **`vendedor`** | Ejecutivo de ventas / atención al cliente | Solo flujo comercial: ver catálogo, crear y editar cotizaciones, NV, boletas, guías. **No** borra documentos, **no** ve proveedores, OC, inventario, RRHH ni reportes consolidados. Sus cotizaciones pueden requerir aprobación de márgenes/términos. |

**No hay herencia explícita.** El sistema no implementa "subadmin extiende vendedor"; cada rol tiene su tabla de permisos por defecto declarada en `_DEFAULT` (`backend/app/core/permissions.py`). En la práctica subadmin ⊃ vendedor en casi todos los módulos, pero esto es una convención del seed de defaults, **no** una regla del runtime.

---

## 3. Matriz roles × módulos × acciones

Esta es la **fuente de verdad por defecto** (sin overrides), exactamente como aparece en `_DEFAULT` (`backend/app/core/permissions.py:12`).

Acciones declaradas: `view` · `create` · `edit` · `delete` · `view_all` · `admin` *(las dos últimas solo se usan en `tareas` por ahora).*

Leyenda: ✅ permitido · ❌ denegado · — no aplica (acción no declarada para ese módulo, equivale a denegado por *fail-closed*).

### 3.1 Módulos comerciales (ventas)

| Módulo | Acción | admin | subadmin | vendedor |
|---|---|:---:|:---:|:---:|
| `catalogo` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ view, ❌ resto |
| `cotizaciones` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ todo **menos** delete |
| `nota_venta` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ todo **menos** delete |
| `facturas` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ view, ❌ resto |
| `boletas` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ todo **menos** delete |
| `guias_despacho` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ todo **menos** delete |

### 3.2 Compras y stock

| Módulo | Acción | admin | subadmin | vendedor |
|---|---|:---:|:---:|:---:|
| `proveedores` | view / create / edit / delete | ✅ todo | ✅ todo | ❌ todo |
| `ordenes_compra` | view / create / edit / delete | ✅ todo | ✅ todo | ❌ todo |
| `inventario` | view / create / edit / delete | ✅ todo | ✅ todo | ❌ todo |

### 3.3 Clientes y empresas

| Módulo | Acción | admin | subadmin | vendedor |
|---|---|:---:|:---:|:---:|
| `clientes` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ view+create+edit, ❌ delete |
| `empresas` | view / create / edit / delete | ✅ todo | ✅ todo | ✅ view, ❌ resto |

### 3.4 Contabilidad / SII

| Módulo | Acción | admin | subadmin | vendedor |
|---|---|:---:|:---:|:---:|
| `libros` | view / create / edit / delete | ✅ todo | ✅ view, ❌ resto | ✅ view, ❌ resto |
| `dte_recepcion` | view / create / edit / delete | ✅ todo | ✅ view+create+edit, ❌ delete | ✅ view+create+edit, ❌ delete |

### 3.5 Operación interna

| Módulo | Acción | admin | subadmin | vendedor |
|---|---|:---:|:---:|:---:|
| `dashboard` | view / create / edit / delete | ✅ todo | ✅ view, ❌ resto | ✅ view, ❌ resto |
| `usuarios` | view / create / edit / delete | ✅ todo | ❌ todo | ❌ todo |
| `rrhh` | view / create / edit / delete | ✅ todo | ❌ todo | ❌ todo |
| `tareas` | view / create / edit / delete / view_all / admin | ✅ todo | ✅ view+create+edit, ❌ delete, ❌ view_all, ❌ admin | ✅ view+create+edit, ❌ delete, ❌ view_all, ❌ admin |

> **Detalle importante de `tareas`:** las acciones `view_all` y `admin` *solo* las recibe `admin`. `view_all` controla si la persona ve tareas asignadas a otros (no solo las propias); `admin` permite editar reglas de auto-asignación.

### 3.6 Acciones especiales no declaradas

Si un módulo no declara una acción en `_DEFAULT`, `has_permission` la trata como **denegada** (`fail-closed`):

```python
# permissions.py:62
return _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)
#                                                          ^^^^^ default False
```

Esto es **intencional** — agregar una nueva acción a un endpoint nunca debe accidentalmente abrirla a roles que aún no la conocen.

---

## 4. Override por usuario

### 4.1 Para qué sirve

A veces necesitas dar a un vendedor en particular permiso para borrar boletas, o quitarle al subadmin Marta el acceso a `inventario`. Eso se hace **sin cambiar el rol** mediante `PermissionOverride` (`backend/app/models/permission.py`).

### 4.2 Schema

```sql
CREATE TABLE permission_overrides (
    id        SERIAL PRIMARY KEY,
    user_id   INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    module    VARCHAR(50) NOT NULL,
    action    VARCHAR(20) NOT NULL,
    allowed   BOOLEAN NOT NULL,
    UNIQUE (user_id, module, action)
);
```

- Un override es un **par (módulo, acción) → bool** específico para un usuario.
- Es **absoluto**: si `allowed=True` el usuario tiene el permiso aunque su rol base lo niegue, y viceversa.
- `ON DELETE CASCADE`: al eliminar un usuario sus overrides se borran automáticamente.

### 4.3 Resolución (precedencia)

```
                ┌─────────────────────┐
                │  user.role == admin │──► True (bypass total)
                └──────────┬──────────┘
                           │ no
                           ▼
                ┌─────────────────────┐
                │  override exists?   │──► override.allowed
                └──────────┬──────────┘
                           │ no
                           ▼
                ┌─────────────────────┐
                │  _DEFAULT[role][m][a] (fallback False)
                └─────────────────────┘
```

Codificado literalmente en `has_permission` (`backend/app/core/permissions.py:54`):

```python
def has_permission(db: Session, user: User, module: str, action: str) -> bool:
    if user.role == "admin":
        return True                            # 1. admin bypass
    override = db.query(PermissionOverride).filter_by(
        user_id=user.id, module=module, action=action
    ).first()
    if override is not None:
        return override.allowed                # 2. override
    return _DEFAULT.get(user.role, {}).get(module, {}).get(action, False)  # 3. default
```

### 4.4 Cuándo aplicar overrides vs cambiar el rol

- **Cambia el rol** cuando el cambio es estructural (Marta fue ascendida a subadmin).
- **Usa overrides** cuando es una excepción individual o temporal (al becario le habilitamos `inventario.view` solo durante la inducción).

> ⚠️ **`admin` y overrides:** los overrides para usuarios admin son *dead data*. Se almacenan en la tabla pero `has_permission` retorna `True` antes de consultarlos. No es un bug; el endpoint `PUT /api/users/{id}/permissions` los persiste por uniformidad de UI, pero no afectan el resultado en ejecución.

### 4.5 Endpoints de gestión

Todos en `backend/app/api/users.py` y todos requieren rol `admin` (excepto `me`):

| Método | Path | Quién | Qué hace |
|---|---|---|---|
| `GET` | `/api/users/me/permissions` | cualquier autenticado | Permisos efectivos del usuario actual (rol + sus overrides). |
| `GET` | `/api/users/{id}/permissions` | admin | Permisos efectivos del usuario `id`. |
| `PUT` | `/api/users/{id}/permissions` | admin | Reemplaza los overrides del usuario por el body recibido (módulo → acción → bool). |

El body de `PUT` es un dict anidado:

```json
{
  "boletas":  { "delete": true,  "edit": true  },
  "usuarios": { "view":   false }
}
```

Las claves desconocidas en `module` o `action` se **ignoran silenciosamente** (`if module not in MODULES: continue`). Esto previene enviar permisos para módulos inexistentes pero también significa que typos pasan desapercibidos — verifica en la respuesta que el efecto fue el deseado.

---

## 5. Cómo se aplica en backend (FastAPI `Depends`)

Conico no usa decoradores: usa **dependencies** de FastAPI declaradas en parámetros. Las helpers viven en `backend/app/api/deps.py`.

### 5.1 `require_permission(module, action)` — el caso común

```python
# backend/app/api/clientes.py
@router.get("/{cliente_id}")
def get_cliente(
    cliente_id: int,
    perms: tuple[User, Session] = require_permission("clientes", "view"),
):
    user, db = perms
    ...
```

Características:
- Devuelve `tuple[User, Session]` — el handler obtiene **usuario y sesión gratis**, sin pedirlos por separado. Esto es el patrón canónico en el repo (439 usos en 62 archivos al 2026-05-06).
- Si `has_permission(...)` falla: `403 Sin permisos`.
- Internamente llama a `get_current_user`, así que la autenticación va incluida.

### 5.2 `require_admin` — atajo "solo admin"

```python
# backend/app/api/auditoria.py
@router.get("/audit-log")
def list_audit(
    perms: tuple[User, Session] = require_permission("usuarios", "admin"),
):
    ...
```

> ⚠️ **Patrón mixto:** existen **dos** helpers `require_admin`:
> - `app/api/deps.py::require_admin` — devuelve `tuple[User, Session]` y se usa con `Depends()`.
> - `app/api/users.py::require_admin` — devuelve solo `User` (variante interna del módulo de usuarios).
>
> En endpoints que necesitan admin **y** acceso a una acción en particular, se prefiere `require_permission("usuarios", "admin")` (módulo `usuarios` + acción `admin`) que es equivalente y más expresivo.

### 5.3 `require_modulo(slug)` — gating por empresa

```python
# Solo accesible si la empresa tiene boletas habilitado
@router.post("/boletas")
def crear_boleta(
    user: User = require_modulo("boletas"),
    perms: tuple[User, Session] = require_permission("boletas", "create"),
):
    ...
```

Resuelve `Empresa.modulos_enabled` → `compute_effective_modulos` (que aplica dependencias de `OPTIONAL_MODULES`) y devuelve `403 modulo_disabled` con payload estructurado si está apagado. Ver el catálogo de módulos opcionales y sus dependencias en `backend/app/core/modulos.py`.

### 5.4 Orden recomendado de dependencies

```python
def handler(
    user: User = require_modulo("nota_credito"),               # 1. ¿módulo activo?
    perms: tuple[User, Session] = require_permission("..."),    # 2. ¿permiso?
    body: SchemaIn = ...,                                       # 3. validación payload
):
```

FastAPI las resuelve en el orden declarado. Poner `require_modulo` antes evita filtrar a usuarios de empresas que no tienen el feature un `403 Sin permisos` que les confunde — verán "módulo no disponible" que es la verdad.

---

## 6. Cómo se aplica en frontend

### 6.1 Tres mecanismos, uno solo por capa

| Capa | Mecanismo | Archivo |
|---|---|---|
| Ruta | Wrappers `<RequireAuth>`, `<RequireAdmin>`, `<RequireNotVendedor>` | `frontend/src/router.tsx` |
| Módulo activo | `<ModuloGuard slug="...">` | `frontend/src/components/ModuloGuard.tsx` |
| Botón / sección | Hook `useEffectivePermissions()` o lectura directa de `useAuthStore().user.role` | `frontend/src/hooks/useEffectivePermissions.ts` |

Una ruta típica las combina:

```tsx
// frontend/src/router.tsx
{ path: 'rrhh',
  element: (
    <ModuloGuard slug="rrhh_empleados">
      <RequireAdmin>
        <RRHH />
      </RequireAdmin>
    </ModuloGuard>
  )
}
```

Lectura: "Si la empresa tiene el módulo `rrhh_empleados` activo **y** el usuario es admin, mostrar `<RRHH />`."

### 6.2 Hook `useEffectivePermissions`

El hook canónico para gating en componentes:

```tsx
import { useEffectivePermissions } from '@/hooks/useEffectivePermissions'

function ClienteDetalle() {
  const { permissions, role, isViewingAs } = useEffectivePermissions()
  const canDelete = permissions?.clientes?.delete ?? false

  return (
    <div>
      ...
      {canDelete && <Button variant="danger" onClick={...}>Eliminar</Button>}
    </div>
  )
}
```

Bajo el capó: hace `GET /api/users/me/permissions` (cache de 5 min) y, si el usuario admin está en modo "view as", clamp-ea a `myPerms ∧ targetPerms` (AND lógico) para que la previsualización **nunca pueda elevar**.

### 6.3 "View as" — preview de roles para admin

`useViewAsStore` (`frontend/src/stores/viewAs.ts`) guarda en `sessionStorage` el usuario "objetivo" que un admin está previsualizando.

- **Solo afecta UI.** Las llamadas al backend siguen yendo con el JWT real del admin, así que **no** otorga ni quita permisos a nivel API.
- Se limpia automáticamente al hacer `logout` (ver `auth.ts:23`).
- Las **route guards** (`RequireAdmin`, `RequireNotVendedor`) siguen evaluando el rol real, no el efectivo. Es decir: un admin en "view as vendedor" sigue viendo `/usuarios` si navega ahí directo. Esto es por diseño: queremos que el admin pueda salir de la previsualización sin reloguearse.
- Las **gates intra-página** (botones, secciones, tabs) usan `useEffectivePermissions` y sí respetan la previsualización.

> Si encuentras una página donde "view as vendedor" muestra cosas que un vendedor real no vería, casi siempre es porque el componente está leyendo `useAuthStore().user.role` directo en vez de `useEffectivePermissions().role`. El fix es cambiar a `effectiveRole ?? user?.role`.

### 6.4 `<ModuloGuard>` vs route guard

`<ModuloGuard>` muestra una pantalla "Módulo no disponible" en lugar de redirigir. Eso es deliberado: si la empresa apaga `oportunidades`, queremos comunicar el motivo (con CTA para reactivarlo si el usuario es admin), no devolver un `Navigate` que luce como bug.

---

## 7. Diagrama de precedencia (caso completo)

Cuando un usuario hace clic en "Eliminar boleta", esto es lo que ocurre:

```
[Click] ─► <Button> renderizado solo si permissions.boletas.delete (frontend gate)
   │
   ▼
DELETE /api/boletas/123
   │
   ▼
get_current_user           ──► 401 si JWT inválido o usuario inactivo
   │
   ▼
require_modulo("boletas")  ──► 403 modulo_disabled si Empresa.modulos_enabled.boletas == False
   │
   ▼
require_permission("boletas", "delete")
   │
   ▼ has_permission(...)
   │   ¿role == admin?              ─► True
   │   ¿override (uid, "boletas", "delete")?  ─► override.allowed
   │   ¿_DEFAULT[role]["boletas"]["delete"]?   ─► False/True (default False)
   │
   ▼ True → handler corre · False → 403 Sin permisos
```

**Reglas mentales rápidas para depurar `403`:**
1. ¿El `detail` dice `modulo_disabled`? → la empresa tiene el módulo apagado, mira `Configuración → Módulos`.
2. ¿El `detail` dice `Solo administradores`? → endpoint usa `require_admin`, no `require_permission`. Cambiar el rol o usar otro endpoint.
3. ¿El `detail` dice `Sin permisos`? → revisa `_DEFAULT[role]` para ese módulo+acción y los overrides en `permission_overrides` para ese `user_id`.

---

## 8. Pitfalls comunes

### 8.1 "Cambié el override y el usuario sigue viendo lo mismo"

El frontend cachea `GET /api/users/me/permissions` por 5 minutos (`staleTime: 5 * 60_000`). Para forzar refresco: el usuario debe recargar la página o el admin debe invalidar la query desde devtools. **No es un bug** — es para evitar pegarle al backend en cada render.

### 8.2 "El endpoint devuelve 403 pero el rol parece correcto"

Causas más comunes, en orden:
1. El usuario tiene un `PermissionOverride` con `allowed=False` que se olvidó borrar.
2. El módulo está apagado en la empresa (mira el body del 403, ver §1).
3. El endpoint usa una acción que no está en `_DEFAULT` para ese módulo (fail-closed).
4. El JWT está caducado y el frontend no refrescó el access token (debería ser 401, pero un proxy puede convertirlo).

### 8.3 "Quiero permitir esto para vendedores en general"

Edita `_DEFAULT["vendedor"][modulo]` en `backend/app/core/permissions.py`. **Esto cambia el comportamiento para todos los vendedores.** Los overrides existentes se mantienen y siguen siendo absolutos sobre el nuevo default.

### 8.4 "Agregué un módulo nuevo y nadie lo ve"

Checklist:
- [ ] Agregar `slug` a `MODULES` en `permissions.py`.
- [ ] Declarar permisos por defecto para los tres roles en `_DEFAULT`.
- [ ] Si es opcional por empresa: agregar a `OPTIONAL_MODULES` en `backend/app/core/modulos.py` con sus `requires`.
- [ ] Frontend: agregar guard de ruta y `<ModuloGuard slug="...">`.
- [ ] Frontend tipos: extender `Permissions` y `Modulo` en `types/`.

### 8.5 "Vendedor no puede borrar sus propias cotizaciones"

Por diseño. La política es "vendedores crean y editan, admins/subadmins borran". Si necesitas permitir auto-borrado caso a caso, usa override por usuario; si la política completa cambió, edita `_DEFAULT["vendedor"]["cotizaciones"]["delete"]`.

---

## 9. Referencia rápida al código

| Concepto | Archivo | Líneas relevantes |
|---|---|---|
| Modelo `User` (campo `role`) | `backend/app/models/user.py` | `:14` |
| Modelo `PermissionOverride` | `backend/app/models/permission.py` | `:5–13` |
| Tablas `MODULES` / `ACTIONS` / `_DEFAULT` | `backend/app/core/permissions.py` | `:5–52` |
| `has_permission` y `get_user_permissions` | `backend/app/core/permissions.py` | `:54–80` |
| `require_admin`, `require_permission`, `require_modulo` | `backend/app/api/deps.py` | `:13–53` |
| `get_current_user` | `backend/app/api/auth.py` | `:49–62` |
| Endpoints de gestión de overrides | `backend/app/api/users.py` | `:78–132` |
| Catálogo de módulos opcionales | `backend/app/core/modulos.py` | `:22–58` |
| Route guards frontend | `frontend/src/router.tsx` | `:55–73` |
| `<ModuloGuard>` | `frontend/src/components/ModuloGuard.tsx` | completo |
| `useEffectivePermissions` | `frontend/src/hooks/useEffectivePermissions.ts` | completo |
| "View as" store | `frontend/src/stores/viewAs.ts` | completo |
| Auth store | `frontend/src/stores/auth.ts` | completo |

---

## 10. TL;DR

- **3 roles**: `admin` (todo), `subadmin` (todo menos usuarios y RRHH), `vendedor` (flujo comercial sin borrado).
- **3 capas** que un request debe pasar: autenticación → permiso (rol + override) → módulo activo en la empresa.
- **Admin hace bypass total** del paso 2; sus `PermissionOverride` no se evalúan.
- **Overrides** son absolutos por `(user, module, action)` y se gestionan vía `PUT /api/users/{id}/permissions` (admin only).
- **Frontend** hace gating cosmético; el backend es la fuente real de verdad. Los gates frontend usan `useEffectivePermissions` para soportar "view as" sin elevar.
- Cuando algo no calza con este documento, **el código es la verdad** — abre PR para sincronizar este archivo.
