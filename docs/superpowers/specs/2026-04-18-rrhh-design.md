# Conico PMS — Fase 8: RRHH

**Fecha:** 2026-04-18  
**Estado:** Aprobado

## Contexto

Módulo de Recursos Humanos visible y accesible **solo para Admin**. Gestiona empleados de la empresa, sus documentos adjuntos (contratos, liquidaciones) y un registro simple de vacaciones tomadas.

---

## Modelos de datos

### `empleados`
| Campo | Tipo | Notas |
|---|---|---|
| id | Integer PK | |
| nombre | String(255) | requerido |
| cargo | String(255) | requerido |
| sueldo_base | Numeric(10,2) | nullable |
| fecha_ingreso | Date | nullable |
| is_active | Boolean | default True |
| created_at | DateTime(tz) | server default |

### `empleado_documentos`
| Campo | Tipo | Notas |
|---|---|---|
| id | Integer PK | |
| empleado_id | FK → empleados (CASCADE DELETE) | |
| nombre | String(255) | nombre original del archivo |
| tipo | String(20) | `contrato` \| `liquidacion` \| `otro` |
| ruta | String(500) | path relativo en disco |
| subido_en | DateTime(tz) | server default |
| subido_por | FK → users (SET NULL) | nullable |

### `empleado_vacaciones`
| Campo | Tipo | Notas |
|---|---|---|
| id | Integer PK | |
| empleado_id | FK → empleados (CASCADE DELETE) | |
| fecha_inicio | Date | requerido |
| fecha_fin | Date | requerido |
| dias | Integer | requerido |
| descripcion | Text | nullable |
| registrado_en | DateTime(tz) | server default |

**Almacenamiento de archivos:** `uploads/empleados/{empleado_id}/{uuid4}_{filename_original}`. Directorio creado automáticamente si no existe. Límite: 10 MB por archivo. Tipos aceptados: cualquiera.

---

## API Backend

### Estructura de archivos nuevos/modificados

```
backend/app/
  models/
    empleado.py              (nuevo)
    empleado_documento.py    (nuevo)
    empleado_vacacion.py     (nuevo)
    __init__.py              (modificar: 3 imports)
  schemas/
    empleado.py              (nuevo)
    empleado_documento.py    (nuevo)
    empleado_vacacion.py     (nuevo)
  api/
    empleados.py             (nuevo)
    empleados_documentos.py  (nuevo)
    empleados_vacaciones.py  (nuevo)
  main.py                    (modificar: 3 routers)
  core/permissions.py        (modificar: "rrhh" ya existe)
backend/
  migrations/versions/       (nueva migración Alembic)
  tests/
    test_empleados.py        (nuevo)
    test_empleados_documentos.py (nuevo)
    test_empleados_vacaciones.py (nuevo)
    conftest.py              (modificar: import nuevos modelos)
uploads/                     (nuevo directorio, en .gitignore)
docker-compose.yml           (modificar: volumen uploads)
```

### Endpoints

#### `empleados.py` → `/api/empleados`
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | rrhh:view | Listar (query param `q` filtra nombre o cargo) |
| POST | `/` | rrhh:create | Crear empleado |
| GET | `/{id}` | rrhh:view | Obtener empleado |
| PATCH | `/{id}` | rrhh:edit | Actualizar empleado |
| DELETE | `/{id}` | rrhh:delete | Eliminar (409 si tiene docs o vacaciones) |

#### `empleados_documentos.py` → `/api/empleados/{empleado_id}/documentos`
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | rrhh:view | Listar docs del empleado |
| POST | `/` | rrhh:create | Subir archivo (multipart: `file` + `tipo`) |
| GET | `/{doc_id}/download` | rrhh:view | Descargar archivo (FileResponse protegido) |
| DELETE | `/{doc_id}` | rrhh:delete | Eliminar doc (borra archivo del disco) |

#### `empleados_vacaciones.py` → `/api/empleados/{empleado_id}/vacaciones`
| Método | Ruta | Permiso | Descripción |
|---|---|---|---|
| GET | `/` | rrhh:view | Listar períodos de vacaciones |
| POST | `/` | rrhh:create | Registrar período |
| PATCH | `/{vac_id}` | rrhh:edit | Editar período |
| DELETE | `/{vac_id}` | rrhh:delete | Eliminar período |

---

## Frontend

### Archivos nuevos/modificados
```
frontend/src/
  pages/
    RRHH.tsx              (nuevo)
    RRHH.test.tsx         (nuevo)
  types/index.ts          (modificar: Empleado, EmpleadoDocumento, EmpleadoVacacion)
  router.tsx              (modificar: ruta /rrhh)
```
Sidebar ya tiene `/rrhh` — solo es visible para admin vía permisos del backend (el frontend no lo oculta condicionalmente en v1).

### Estructura de la página `RRHH.tsx`

**Vista principal:**
- Título + búsqueda + botón "Agregar empleado"
- Tabla: Nombre | Cargo | Sueldo Base | Fecha Ingreso | Activo | (acciones)
- Click en fila → abre panel de detalle

**Panel de detalle (modal grande):**
- Sección **Datos**: form editable (nombre, cargo, sueldo_base, fecha_ingreso, is_active) + guardar
- Sección **Documentos**: lista (nombre, tipo, fecha) + botón subir + descarga + eliminar
- Sección **Vacaciones**: tabla (fecha inicio, fecha fin, días, descripción) + botón agregar + eliminar

---

## Infraestructura

### Docker Compose
Agregar volumen `uploads` al servicio `backend`:
```yaml
volumes:
  - ./backend:/app
  - uploads_data:/app/uploads

volumes:
  uploads_data:
```

### `.gitignore`
Agregar `uploads/` para no commitear archivos binarios.

---

## Permisos

El módulo `rrhh` ya existe en `permissions.py` con acceso solo para `admin`. No requiere cambios.

---

## Fuera del scope (v1)

- Cálculo automático de saldo de vacaciones
- Historial de cambios de sueldo
- Notificaciones de vencimiento de documentos
- Exportación Excel de empleados
