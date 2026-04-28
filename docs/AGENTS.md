# Conico — Guía para el equipo de agentes

> Este documento define **cómo trabaja un equipo de agentes (humanos o IA) sobre Conico** sin pisarse: cómo elegir tarea, cómo aislar contexto, cómo entregar.

Última actualización: 2026-04-24. Documentos relacionados: `docs/architecture.md`, `docs/backlog.md`, `docs/state-of-product.html`, `PROGRESS.md`.

---

## 0. Lectura obligatoria antes de la primera tarea

1. `CLAUDE.md` (raíz) — política de comandos y reglas del proyecto.
2. `docs/architecture.md` — stack, modelo de datos, flujos.
3. `docs/backlog.md` — tareas con scope cerrado.
4. `PROGRESS.md` — qué ya está hecho.
5. `docs/dudas-cliente.md` — decisiones bloqueantes pendientes.

---

## 1. Reglas de oro

1. **Una tarea, una rama, un PR.** Nada de PRs combinando dos tareas del backlog.
2. **No pisar trabajo en progreso.** Antes de empezar, mirar PRs abiertos y la columna "owner" del backlog.
3. **Test obligatorio.** Backend: pytest. Frontend: vitest. Sin tests = no merge.
4. **Actualizar `PROGRESS.md`** en el mismo PR cuando una tarea queda lista.
5. **No tocar archivos fuera del scope** declarado en la tarea, salvo refactors triviales necesarios para que el cambio compile.
6. **Si descubres una decisión bloqueante** (cliente, producto, arquitectura), **detén la tarea**, anótala en `docs/dudas-cliente.md` y pide input.
7. **Lenguaje en datos:** español (códigos, mensajes UI, modelos). **Lenguaje en código:** español para dominio (cotizacion, factura, empresa) e inglés para infra (auth, middleware).

---

## 2. Cómo elegir tarea

Orden de prioridad:

1. **P0 sin owner** del Wave activo.
2. **P1 sin owner** del Wave activo.
3. **Cross-cutting (CC-XX)** que destrabe a otros.

No tomar dos tareas P0 al mismo tiempo. No empezar Wave N+1 si aún quedan P0 en Wave N salvo que sean independientes (ver §4).

Cuando tomas una tarea:
- Anota tu owner en el PR title o en el backlog (PR del documento si va por separado).
- Crea la rama `feat/W{wave}-{nn}-{slug}` (ej: `feat/W1-01-audit-log`).

---

## 3. Definition of Done

Una tarea está **lista** cuando:

- [ ] Cumple todos los criterios de aceptación de su entrada en `docs/backlog.md`.
- [ ] Tests pasan (backend + frontend) en local.
- [ ] CI verde (cuando exista — Wave 1 W1-03).
- [ ] `PROGRESS.md` actualizado.
- [ ] Si hay nuevos endpoints, están en el router de FastAPI y aparecen en `/docs` (Swagger).
- [ ] Si hay nuevos schemas/modelos, hay migración Alembic y un test que la ejerce.
- [ ] Si hay UI nueva, fue probada en navegador y hay al menos un test vitest.
- [ ] Si la tarea tiene impacto operacional (deploy, rotación de claves, restore), hay un runbook en `docs/runbooks/`.
- [ ] PR descripción declara: scope, qué cambia, cómo probar, riesgos.

---

## 4. Paralelismo seguro

El backlog está pensado para **3-4 agentes en paralelo**. Reglas para no chocarse:

### Particiones limpias (paralelo libre)
- **Backend nuevo módulo independiente** (un nuevo router + modelo): un solo owner.
- **Frontend nueva página independiente**: un solo owner.
- **Infra (CI, backups, observabilidad)**: aislado del código de aplicación.

### Zonas calientes (coordinar)
- `backend/app/main.py` (registro de routers) — merge primero, pull luego.
- `backend/app/database.py` y `Base.metadata` — toda nueva tabla obliga a que otras ramas se reinicialicen DB de tests.
- `frontend/src/router.tsx` — añadir rutas en orden alfabético; conflictos triviales.
- `frontend/src/components/layout/` — sidebar y AppLayout: cualquier cambio se anuncia.
- `PROGRESS.md` y `MEMORY.md` — siempre `git pull` antes de editar.

### Bloqueos transitivos
Si tu tarea depende de otra **no completada**, NO la empieces. Marca `blockedBy` en tu task y toma otra. Los `Depende de` están explícitos en `docs/backlog.md`.

---

## 5. Convenciones de código

### Backend
- **Endpoints:** plural en español: `/api/cotizaciones`, `/api/notas-venta`.
- **Permisos:** decorator `Depends(require_perm("modulo:accion"))`. Acciones: `view`, `view_all`, `create`, `edit`, `delete`, `admin`.
- **Schemas Pydantic:** sufijos `Create`, `Update`, `Out`. `Out` siempre tiene `model_config = ConfigDict(from_attributes=True)`.
- **SQLAlchemy:** Mapped + typed columns; FK con `ondelete` explícito; nada de `relationship()` sin `back_populates` o motivo.
- **Migraciones:** una migración por tarea funcional; nunca editar migraciones ya mergeadas.
- **Tests:** `tests/test_{modulo}.py` con fixtures en `conftest.py`.

### Frontend
- **Páginas:** `pages/{Entidad}.tsx` (lista), `pages/{Entidad}Detalle.tsx` (detalle/edit).
- **Components compartidos:** `components/{Nombre}.tsx` con `.test.tsx` al lado cuando aplica.
- **API clients:** `src/api/{entidad}.ts` exporta funciones, no clases.
- **TanStack Query:** `useQuery` con `queryKey: ['entidad', filters]`; `invalidateQueries` después de mutaciones.
- **Estilos:** Tailwind first; clases largas se extraen a constantes locales si se repiten.
- **No imports de archivos `.js`** generados (artifacts checked-in legacy — ver CC-04).

### Migraciones de DB
- `alembic revision --autogenerate -m "Wn-XX descripción"` y revisar el archivo generado.
- Nunca borrar columnas en la misma migración que se introducen otras dependencias; partir en dos.
- Datos existentes: usar `op.execute(...)` con SQL idempotente.

---

## 6. Permisos al ejecutar comandos (per CLAUDE.md raíz)

Sin pedir permiso:
- `npm test`, `git status`, `ls`, `pytest`, `npm run build`, `npm run lint`, `git log`, `git diff`.

Con permiso:
- `rm`, `git reset --hard`, `git push --force`, drop de tabla, modificación de hooks.

---

## 7. Seguridad

- **Nunca commitear** `.env`, claves, tokens, secretos. Si encuentras uno en historia, marca para rotación inmediata.
- DTE webhook usa HMAC SHA256 con `LIOREN_WEBHOOK_SECRET` — nunca exponerlo en logs.
- Uploads (productos, RRHH) chequean permisos en cada descarga; nunca exponer ruta directa.
- JWT `JWT_SECRET` rotación documentada en runbook.

---

## 8. Política de IA / herramientas

- **Modelos planning vs coding:** Opus/4.7 para diseño y arquitectura, Sonnet/4.6 por defecto para implementar.
- **Subagents:** usar `superpowers:subagent-driven-development` para ejecutar planes, nunca inline.
- **Brainstorming:** usar `superpowers:brainstorming` antes de implementar features creativas.
- **TDD:** activar para fixes de bugs; opcional para features greenfield si está documentado.
- **Verification before completion:** confirmar con tests reales antes de marcar done.

---

## 9. Comunicación

- Cada PR title: `[W{wave}-{nn}] {descripción corta}`.
- Cada PR body: scope, qué cambia, cómo probar, riesgos.
- Si una tarea revela una segunda tarea, **no la añadas al PR** — abre una issue/entry nuevo en backlog.
- Si una tarea queda parcialmente bloqueada, deja el PR en draft y registra el bloqueo en su descripción.

---

## 10. Templates útiles

### Plantilla de PR
```
## Scope
W{X}-{NN} — {título}

## Qué cambia
- ...

## Cómo probar
1. ...

## Riesgos
- ...

## Checklist
- [ ] Tests pasan
- [ ] PROGRESS.md actualizado
- [ ] Sin secretos commiteados
- [ ] Migración Alembic incluida (si aplica)
- [ ] Runbook agregado (si aplica)
```

### Plantilla de runbook (`docs/runbooks/{nombre}.md`)
```
# {Título}

## Cuándo
{Cuándo ejecutar este procedimiento}

## Pre-requisitos
- ...

## Pasos
1. ...

## Verificación
- ...

## Rollback
- ...
```

---

## 11. Tareas que un agente NUNCA debe hacer sin aprobación humana

- Borrar usuarios o datos en producción.
- Rotar claves SII / Lioren / SMTP.
- `git push --force` a `master`.
- Cambiar el modelo `tenant` o `user` (afecta a todos los flujos).
- Desactivar pipeline CI o tests.
- Aceptar cambios de scope no escritos en `docs/backlog.md`.

---

Cualquier duda procedural: leer este archivo de nuevo. Cualquier duda de producto: anotar en `docs/dudas-cliente.md` y esperar respuesta.
