# Tareas y Recordatorios Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Añadir módulo de Tareas/recordatorios al CRM Conico: CRUD manual + auto-generación vía Celery con 6 reglas configurables, widget "Mis pendientes", integración en fichas de entidades.

**Architecture:** Backend FastAPI + SQLAlchemy. Modelo `Tarea` con 6 FKs nullables (CHECK: máximo 1). Modelo `ReglaTarea` con seed de 6 reglas. Job Celery horario idempotente vía `dedup_key` único parcial. Frontend React: página `/tareas`, widget sidebar, sección "Tareas relacionadas" en fichas. Permisos nuevos `tareas:view/view_all/create/admin`.

**Tech Stack:** FastAPI, SQLAlchemy 2.0, Alembic, Celery + Redis, React + TypeScript, Vite, Tailwind.

**Spec:** `docs/superpowers/specs/2026-04-24-tareas-recordatorios-design.md`

---

## File Structure

### Backend (create)

- `backend/app/models/tarea.py` — modelo `Tarea`
- `backend/app/models/regla_tarea.py` — modelo `ReglaTarea`
- `backend/app/schemas/tarea.py` — Pydantic schemas (TareaIn/Out/Patch, MisPendientesOut)
- `backend/app/schemas/regla_tarea.py` — Pydantic schemas
- `backend/app/api/tareas.py` — endpoints CRUD + acciones + timeline
- `backend/app/api/reglas_tarea.py` — endpoints admin config
- `backend/app/tasks/tareas.py` — job Celery + auto-gen + auto-descarte
- `backend/app/services/tareas_asignacion.py` — resolver `asignado_rol` → user_id
- `backend/migrations/versions/XXXX_add_tareas.py` — migración DDL + seed reglas + seed permisos
- `backend/tests/test_tareas_model.py`
- `backend/tests/test_tareas_api.py`
- `backend/tests/test_tareas_auto.py`

### Backend (modify)

- `backend/app/models/__init__.py` — registrar Tarea, ReglaTarea
- `backend/app/main.py` — registrar routers tareas + reglas_tarea
- `backend/app/celery_app.py` — incluir `app.tasks.tareas`, añadir `beat_schedule` horario
- `backend/app/api/users.py` — hook: al desactivar user, reasignar sus tareas pendientes

### Frontend (create)

- `frontend/src/api/tareas.ts` — client API
- `frontend/src/types/tarea.ts` — tipos TypeScript
- `frontend/src/pages/Tareas.tsx` — página principal
- `frontend/src/pages/TareasConfig.tsx` — config reglas (admin)
- `frontend/src/components/TareaModal.tsx` — modal nueva/editar
- `frontend/src/components/TareaDrawer.tsx` — drawer detalle
- `frontend/src/components/MisPendientesWidget.tsx` — sidebar widget
- `frontend/src/components/TareasRelacionadas.tsx` — sección reutilizable

### Frontend (modify)

- `frontend/src/App.tsx` — nuevas rutas `/tareas`, `/admin/tareas/config`
- `frontend/src/components/Sidebar.tsx` — embed `MisPendientesWidget`
- `frontend/src/pages/CotizacionDetalle.tsx` — embed `TareasRelacionadas`
- `frontend/src/pages/NotaVentaDetalle.tsx` — idem
- `frontend/src/pages/FacturaDetalle.tsx` — idem
- `frontend/src/pages/ClienteDetalle.tsx` — idem (o crearla si no existe en la ficha)
- `frontend/src/pages/EmpresaDetalle.tsx` — idem
- `frontend/src/pages/ProductoDetalle.tsx` — idem (o equivalente)

---

## Task 1: Modelos SQLAlchemy (Tarea + ReglaTarea)

**Files:**
- Create: `backend/app/models/tarea.py`
- Create: `backend/app/models/regla_tarea.py`
- Modify: `backend/app/models/__init__.py`
- Test: `backend/tests/test_tareas_model.py`

- [ ] **Step 1: Escribir test del modelo `Tarea`**

```python
# backend/tests/test_tareas_model.py
from datetime import date, timedelta
from decimal import Decimal
import pytest
from sqlalchemy.exc import IntegrityError

from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea


def test_tarea_creada_con_defaults(db_session, admin_user):
    t = Tarea(
        titulo="Llamar cliente",
        due_date=date.today() + timedelta(days=1),
        origen="manual",
        asignado_id=admin_user.id,
        creado_por_id=admin_user.id,
    )
    db_session.add(t)
    db_session.commit()
    assert t.id is not None
    assert t.estado == "pendiente"
    assert t.descripcion is None


def test_check_constraint_max_una_fk(db_session, admin_user, cliente_demo, empresa_demo):
    t = Tarea(
        titulo="Bad",
        due_date=date.today(),
        origen="manual",
        asignado_id=admin_user.id,
        cliente_id=cliente_demo.id,
        empresa_id=empresa_demo.id,
    )
    db_session.add(t)
    with pytest.raises(IntegrityError):
        db_session.commit()


def test_dedup_key_unique_parcial_solo_pendiente(db_session, admin_user):
    t1 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=admin_user.id,
    )
    db_session.add(t1)
    db_session.commit()

    # misma key con estado 'pendiente' debe fallar
    t2 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=admin_user.id,
    )
    db_session.add(t2)
    with pytest.raises(IntegrityError):
        db_session.commit()
    db_session.rollback()

    # descartar t1 libera la key
    t1.estado = "descartada"
    t1.motivo_descarte = "test"
    db_session.commit()

    t3 = Tarea(
        titulo="x", due_date=date.today(), origen="auto",
        tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:1",
        asignado_id=admin_user.id,
    )
    db_session.add(t3)
    db_session.commit()
    assert t3.id != t1.id


def test_regla_tarea_seed(db_session):
    reglas = db_session.query(ReglaTarea).all()
    tipos = {r.tipo for r in reglas}
    esperados = {
        "cotizacion_vence", "factura_vencida", "aprobacion_pendiente",
        "nv_despachada_sin_avanzar", "cliente_sin_actividad", "stock_bajo_minimo",
    }
    assert esperados.issubset(tipos)
```

- [ ] **Step 2: Ejecutar tests — deben fallar**

Run: `cd backend && pytest tests/test_tareas_model.py -v`
Expected: fallos por `ModuleNotFoundError: app.models.tarea`

- [ ] **Step 3: Crear modelo `Tarea`**

```python
# backend/app/models/tarea.py
from datetime import date, datetime, timezone
from sqlalchemy import (
    Boolean, CheckConstraint, Date, DateTime, ForeignKey, Index,
    Integer, String, Text, text
)
from sqlalchemy.orm import Mapped, mapped_column, relationship
from app.database import Base


class Tarea(Base):
    __tablename__ = "tareas"

    id: Mapped[int] = mapped_column(primary_key=True)
    titulo: Mapped[str] = mapped_column(String(255), nullable=False)
    descripcion: Mapped[str | None] = mapped_column(Text, nullable=True)
    due_date: Mapped[date] = mapped_column(Date, nullable=False)

    estado: Mapped[str] = mapped_column(
        String(20), nullable=False, default="pendiente", server_default=text("'pendiente'")
    )
    motivo_descarte: Mapped[str | None] = mapped_column(String(255), nullable=True)

    origen: Mapped[str] = mapped_column(String(20), nullable=False)
    tipo_regla: Mapped[str | None] = mapped_column(String(40), nullable=True)
    dedup_key: Mapped[str | None] = mapped_column(String(100), nullable=True)

    asignado_id: Mapped[int] = mapped_column(
        ForeignKey("users.id", ondelete="RESTRICT"), nullable=False
    )
    creado_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    cliente_id: Mapped[int | None] = mapped_column(
        ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True
    )
    empresa_id: Mapped[int | None] = mapped_column(
        ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True
    )
    cotizacion_id: Mapped[int | None] = mapped_column(
        ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True
    )
    nota_venta_id: Mapped[int | None] = mapped_column(
        ForeignKey("notas_venta.id", ondelete="SET NULL"), nullable=True
    )
    factura_id: Mapped[int | None] = mapped_column(
        ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True
    )
    producto_id: Mapped[int | None] = mapped_column(
        ForeignKey("productos.id", ondelete="SET NULL"), nullable=True
    )

    completada_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True), nullable=True)
    completada_por_id: Mapped[int | None] = mapped_column(
        ForeignKey("users.id", ondelete="SET NULL"), nullable=True
    )

    created_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )
    updated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        server_default=text("CURRENT_TIMESTAMP"),
    )

    asignado = relationship("User", foreign_keys=[asignado_id])
    creado_por = relationship("User", foreign_keys=[creado_por_id])
    completada_por = relationship("User", foreign_keys=[completada_por_id])
    cliente = relationship("Cliente")
    empresa = relationship("Empresa")
    cotizacion = relationship("Cotizacion")
    nota_venta = relationship("NotaVenta")
    factura = relationship("Factura")
    producto = relationship("Producto")

    __table_args__ = (
        CheckConstraint(
            "("
            "(cliente_id IS NOT NULL)::int + "
            "(empresa_id IS NOT NULL)::int + "
            "(cotizacion_id IS NOT NULL)::int + "
            "(nota_venta_id IS NOT NULL)::int + "
            "(factura_id IS NOT NULL)::int + "
            "(producto_id IS NOT NULL)::int"
            ") <= 1",
            name="ck_tareas_max_una_entidad",
        ),
        Index("ix_tareas_asignado_estado_due", "asignado_id", "estado", "due_date"),
        Index(
            "ux_tareas_dedup_pendiente",
            "dedup_key",
            unique=True,
            postgresql_where=text("estado = 'pendiente' AND dedup_key IS NOT NULL"),
        ),
    )
```

- [ ] **Step 4: Crear modelo `ReglaTarea`**

```python
# backend/app/models/regla_tarea.py
from sqlalchemy import Boolean, Integer, String, text
from sqlalchemy.orm import Mapped, mapped_column
from app.database import Base


class ReglaTarea(Base):
    __tablename__ = "reglas_tarea"

    id: Mapped[int] = mapped_column(primary_key=True)
    tipo: Mapped[str] = mapped_column(String(40), unique=True, nullable=False)
    activa: Mapped[bool] = mapped_column(Boolean, nullable=False, default=True, server_default=text("true"))
    offset_dias: Mapped[int] = mapped_column(Integer, nullable=False)
    asignado_rol: Mapped[str] = mapped_column(String(20), nullable=False)
```

- [ ] **Step 5: Registrar modelos en `__init__.py`**

```python
# backend/app/models/__init__.py — añadir al final de los imports existentes
from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea

__all__ = [
    # ... existentes ...
    "Tarea",
    "ReglaTarea",
]
```

(Solo añadir las dos líneas de import y los dos strings a `__all__` — no tocar el resto.)

- [ ] **Step 6: Commit (modelos sin migración todavía)**

```bash
git add backend/app/models/tarea.py backend/app/models/regla_tarea.py backend/app/models/__init__.py backend/tests/test_tareas_model.py
git commit -m "feat(tareas): modelos Tarea y ReglaTarea"
```

---

## Task 2: Migración Alembic (tablas + seed reglas + seed permisos)

**Files:**
- Create: `backend/migrations/versions/z1a2b3c4d5e6_add_tareas.py`

- [ ] **Step 1: Identificar migración HEAD actual**

Run: `cd backend && alembic heads`
Anotar el revision id (ej. `5e920d5d1874`).

- [ ] **Step 2: Crear archivo de migración**

```python
# backend/migrations/versions/z1a2b3c4d5e6_add_tareas.py
"""add tareas y reglas_tarea

Revision ID: z1a2b3c4d5e6
Revises: 5e920d5d1874
Create Date: 2026-04-24
"""
from alembic import op
import sqlalchemy as sa

revision = "z1a2b3c4d5e6"
down_revision = "5e920d5d1874"  # REEMPLAZAR con heads real
branch_labels = None
depends_on = None


def upgrade():
    op.create_table(
        "reglas_tarea",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("tipo", sa.String(40), unique=True, nullable=False),
        sa.Column("activa", sa.Boolean, nullable=False, server_default=sa.text("true")),
        sa.Column("offset_dias", sa.Integer, nullable=False),
        sa.Column("asignado_rol", sa.String(20), nullable=False),
    )

    op.create_table(
        "tareas",
        sa.Column("id", sa.Integer, primary_key=True),
        sa.Column("titulo", sa.String(255), nullable=False),
        sa.Column("descripcion", sa.Text, nullable=True),
        sa.Column("due_date", sa.Date, nullable=False),
        sa.Column("estado", sa.String(20), nullable=False, server_default=sa.text("'pendiente'")),
        sa.Column("motivo_descarte", sa.String(255), nullable=True),
        sa.Column("origen", sa.String(20), nullable=False),
        sa.Column("tipo_regla", sa.String(40), nullable=True),
        sa.Column("dedup_key", sa.String(100), nullable=True),
        sa.Column("asignado_id", sa.Integer, sa.ForeignKey("users.id", ondelete="RESTRICT"), nullable=False),
        sa.Column("creado_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cliente_id", sa.Integer, sa.ForeignKey("clientes.id", ondelete="SET NULL"), nullable=True),
        sa.Column("empresa_id", sa.Integer, sa.ForeignKey("empresas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("cotizacion_id", sa.Integer, sa.ForeignKey("cotizaciones.id", ondelete="SET NULL"), nullable=True),
        sa.Column("nota_venta_id", sa.Integer, sa.ForeignKey("notas_venta.id", ondelete="SET NULL"), nullable=True),
        sa.Column("factura_id", sa.Integer, sa.ForeignKey("facturas.id", ondelete="SET NULL"), nullable=True),
        sa.Column("producto_id", sa.Integer, sa.ForeignKey("productos.id", ondelete="SET NULL"), nullable=True),
        sa.Column("completada_at", sa.DateTime(timezone=True), nullable=True),
        sa.Column("completada_por_id", sa.Integer, sa.ForeignKey("users.id", ondelete="SET NULL"), nullable=True),
        sa.Column("created_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.Column("updated_at", sa.DateTime(timezone=True), server_default=sa.text("CURRENT_TIMESTAMP")),
        sa.CheckConstraint(
            "("
            "(cliente_id IS NOT NULL)::int + "
            "(empresa_id IS NOT NULL)::int + "
            "(cotizacion_id IS NOT NULL)::int + "
            "(nota_venta_id IS NOT NULL)::int + "
            "(factura_id IS NOT NULL)::int + "
            "(producto_id IS NOT NULL)::int"
            ") <= 1",
            name="ck_tareas_max_una_entidad",
        ),
    )

    op.create_index(
        "ix_tareas_asignado_estado_due", "tareas",
        ["asignado_id", "estado", "due_date"],
    )
    op.create_index(
        "ux_tareas_dedup_pendiente", "tareas",
        ["dedup_key"],
        unique=True,
        postgresql_where=sa.text("estado = 'pendiente' AND dedup_key IS NOT NULL"),
    )

    # Seed reglas
    op.execute("""
        INSERT INTO reglas_tarea (tipo, activa, offset_dias, asignado_rol) VALUES
        ('cotizacion_vence', true, 2, 'owner'),
        ('factura_vencida', true, 1, 'owner'),
        ('aprobacion_pendiente', true, 1, 'admin'),
        ('nv_despachada_sin_avanzar', true, 3, 'owner'),
        ('cliente_sin_actividad', true, 30, 'owner'),
        ('stock_bajo_minimo', true, 0, 'admin')
    """)

    # Seed permisos en tabla permissions (si existe seed table) — alternativamente se hace en startup
    # Ver Task 3 para registro programático de permisos en el catálogo.


def downgrade():
    op.drop_index("ux_tareas_dedup_pendiente", table_name="tareas")
    op.drop_index("ix_tareas_asignado_estado_due", table_name="tareas")
    op.drop_table("tareas")
    op.drop_table("reglas_tarea")
```

- [ ] **Step 3: Ajustar `down_revision` al HEAD real**

Editar el archivo: reemplazar `5e920d5d1874` por el valor de `alembic heads` del Step 1 si es distinto.

- [ ] **Step 4: Correr migración**

Run: `cd backend && alembic upgrade head`
Expected: aplica sin errores. Verificar con `alembic current`.

- [ ] **Step 5: Correr tests del modelo**

Run: `cd backend && pytest tests/test_tareas_model.py -v`
Expected: todos los tests PASS (constraint, dedup, seed reglas).

- [ ] **Step 6: Commit**

```bash
git add backend/migrations/versions/z1a2b3c4d5e6_add_tareas.py
git commit -m "feat(tareas): migration + seed de 6 reglas"
```

---

## Task 3: Registro de permisos `tareas:*`

**Files:**
- Modify: archivo de catálogo de permisos (buscar dónde se declaran los módulos existentes)

- [ ] **Step 1: Localizar catálogo de permisos**

Run: `grep -rn "cotizaciones" backend/app/core/permissions.py || grep -rn "PERMISOS" backend/app/core/ | head`
Resultado esperado: archivo que lista módulos (ej. `PERMISOS_CATALOG` dict).

- [ ] **Step 2: Añadir módulo `tareas` al catálogo**

Ubicar el dict/list que declara módulos y añadir:

```python
# Ejemplo — adaptar al shape real del catálogo
"tareas": ["view", "view_all", "create", "admin"],
```

- [ ] **Step 3: Verificar asignación default por rol**

Localizar donde se asignan permisos por rol (migración de permisos o `core/permissions.py`). Asegurar:

- `vendedor` / `subadmin` / `admin`: reciben `tareas:view` + `tareas:create` por default.
- Solo `admin`: recibe también `tareas:view_all` + `tareas:admin`.

Si el mecanismo es migration-based, añadir otra migración Alembic `z2a3b4c5d6e7_seed_permisos_tareas.py` con INSERT en `permissions` (replicando el patrón existente).

- [ ] **Step 4: Test de permisos**

Añadir a `backend/tests/test_permissions.py` (o archivo equivalente de tests de permisos):

```python
def test_tareas_permisos_defaults(db_session, admin_user, vendedor_user):
    from app.core.permissions import has_permission
    assert has_permission(db_session, vendedor_user, "tareas", "view")
    assert has_permission(db_session, vendedor_user, "tareas", "create")
    assert not has_permission(db_session, vendedor_user, "tareas", "view_all")
    assert not has_permission(db_session, vendedor_user, "tareas", "admin")
    assert has_permission(db_session, admin_user, "tareas", "view_all")
    assert has_permission(db_session, admin_user, "tareas", "admin")
```

Run: `pytest backend/tests/test_permissions.py -v -k tareas`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/core/permissions.py backend/migrations/versions/ backend/tests/test_permissions.py
git commit -m "feat(tareas): permisos view/view_all/create/admin con defaults por rol"
```

---

## Task 4: Schemas Pydantic

**Files:**
- Create: `backend/app/schemas/tarea.py`
- Create: `backend/app/schemas/regla_tarea.py`

- [ ] **Step 1: Crear `schemas/tarea.py`**

```python
# backend/app/schemas/tarea.py
from datetime import date, datetime
from pydantic import BaseModel, Field, model_validator
from typing import Literal, Optional


ENTIDAD_FKS = ["cliente_id", "empresa_id", "cotizacion_id", "nota_venta_id", "factura_id", "producto_id"]


class TareaIn(BaseModel):
    titulo: str = Field(min_length=1, max_length=255)
    descripcion: str | None = None
    due_date: date
    asignado_id: int
    cliente_id: int | None = None
    empresa_id: int | None = None
    cotizacion_id: int | None = None
    nota_venta_id: int | None = None
    factura_id: int | None = None
    producto_id: int | None = None

    @model_validator(mode="after")
    def max_una_fk(self):
        fks = [getattr(self, f) for f in ENTIDAD_FKS]
        if sum(1 for v in fks if v is not None) > 1:
            raise ValueError("Solo se puede vincular a UNA entidad")
        return self


class TareaPatch(BaseModel):
    titulo: str | None = Field(default=None, min_length=1, max_length=255)
    descripcion: str | None = None
    due_date: date | None = None
    asignado_id: int | None = None


class TareaOut(BaseModel):
    id: int
    titulo: str
    descripcion: str | None
    due_date: date
    estado: Literal["pendiente", "hecha", "descartada"]
    motivo_descarte: str | None
    origen: Literal["manual", "auto"]
    tipo_regla: str | None
    prioridad_derivada: Literal["vencida", "hoy", "futura"]
    asignado_id: int
    asignado_nombre: str
    creado_por_id: int | None
    cliente_id: int | None
    empresa_id: int | None
    cotizacion_id: int | None
    nota_venta_id: int | None
    factura_id: int | None
    producto_id: int | None
    completada_at: datetime | None
    created_at: datetime
    updated_at: datetime

    class Config:
        from_attributes = True


class DescartarIn(BaseModel):
    motivo: str = Field(min_length=1, max_length=255)


class ReasignarIn(BaseModel):
    asignado_id: int


class MisPendientesOut(BaseModel):
    vencidas: int
    hoy: int
    futuras: int
    total: int
    tareas: list[TareaOut]
```

- [ ] **Step 2: Crear `schemas/regla_tarea.py`**

```python
# backend/app/schemas/regla_tarea.py
from pydantic import BaseModel, Field
from typing import Literal


class ReglaTareaOut(BaseModel):
    id: int
    tipo: str
    activa: bool
    offset_dias: int
    asignado_rol: Literal["vendedor", "admin", "owner"]

    class Config:
        from_attributes = True


class ReglaTareaPatch(BaseModel):
    activa: bool | None = None
    offset_dias: int | None = Field(default=None, ge=0, le=365)
    asignado_rol: Literal["vendedor", "admin", "owner"] | None = None
```

- [ ] **Step 3: Commit**

```bash
git add backend/app/schemas/tarea.py backend/app/schemas/regla_tarea.py
git commit -m "feat(tareas): schemas Pydantic"
```

---

## Task 5: API — helpers (prioridad derivada, querying)

**Files:**
- Modify: `backend/app/api/tareas.py` (create stub)

- [ ] **Step 1: Crear router stub con helper de prioridad**

```python
# backend/app/api/tareas.py
from datetime import date
from typing import Literal
from fastapi import APIRouter
from sqlalchemy.orm import Session

from app.models.tarea import Tarea

router = APIRouter(prefix="/tareas", tags=["tareas"])


def prioridad_derivada(t: Tarea) -> Literal["vencida", "hoy", "futura"]:
    today = date.today()
    if t.estado == "pendiente" and t.due_date < today:
        return "vencida"
    if t.due_date == today:
        return "hoy"
    return "futura"


def serialize_tarea(t: Tarea) -> dict:
    return {
        "id": t.id,
        "titulo": t.titulo,
        "descripcion": t.descripcion,
        "due_date": t.due_date,
        "estado": t.estado,
        "motivo_descarte": t.motivo_descarte,
        "origen": t.origen,
        "tipo_regla": t.tipo_regla,
        "prioridad_derivada": prioridad_derivada(t),
        "asignado_id": t.asignado_id,
        "asignado_nombre": t.asignado.name if t.asignado else "",
        "creado_por_id": t.creado_por_id,
        "cliente_id": t.cliente_id,
        "empresa_id": t.empresa_id,
        "cotizacion_id": t.cotizacion_id,
        "nota_venta_id": t.nota_venta_id,
        "factura_id": t.factura_id,
        "producto_id": t.producto_id,
        "completada_at": t.completada_at,
        "created_at": t.created_at,
        "updated_at": t.updated_at,
    }
```

- [ ] **Step 2: Registrar router en `main.py`**

Localizar en `backend/app/main.py` donde se hacen `app.include_router(...)` y añadir:

```python
from app.api import tareas as tareas_api
# ... existentes ...
app.include_router(tareas_api.router, prefix="/api")
```

- [ ] **Step 3: Smoke test del router**

Run: `cd backend && pytest tests/test_smoke.py -v` (debe seguir pasando)
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/tareas.py backend/app/main.py
git commit -m "feat(tareas): router stub + helpers prioridad/serializer"
```

---

## Task 6: API — POST create + GET list

**Files:**
- Modify: `backend/app/api/tareas.py`
- Test: `backend/tests/test_tareas_api.py`

- [ ] **Step 1: Escribir tests**

```python
# backend/tests/test_tareas_api.py
from datetime import date, timedelta
from fastapi.testclient import TestClient


def test_crear_tarea_manual_vendedor_solo_a_si_mismo(client: TestClient, vendedor_token, vendedor_user, otro_vendedor):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Llamar cliente",
            "due_date": str(date.today() + timedelta(days=1)),
            "asignado_id": vendedor_user.id,
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp.status_code == 201
    data = resp.json()
    assert data["origen"] == "manual"
    assert data["asignado_id"] == vendedor_user.id

    # Intentar asignar a otro vendedor → 403
    resp2 = client.post(
        "/api/tareas",
        json={
            "titulo": "Otro",
            "due_date": str(date.today()),
            "asignado_id": otro_vendedor.id,
        },
        headers={"Authorization": f"Bearer {vendedor_token}"},
    )
    assert resp2.status_code == 403


def test_crear_tarea_max_una_fk_valida_body(client: TestClient, admin_token, cliente_demo, empresa_demo):
    resp = client.post(
        "/api/tareas",
        json={
            "titulo": "Bad",
            "due_date": str(date.today()),
            "asignado_id": 1,
            "cliente_id": cliente_demo.id,
            "empresa_id": empresa_demo.id,
        },
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 422


def test_listar_tareas_vendedor_solo_ve_propias(client, vendedor_token, vendedor_user, admin_user, db_session):
    from app.models.tarea import Tarea
    db_session.add(Tarea(titulo="mine", due_date=date.today(), origen="manual", asignado_id=vendedor_user.id))
    db_session.add(Tarea(titulo="other", due_date=date.today(), origen="manual", asignado_id=admin_user.id))
    db_session.commit()

    resp = client.get("/api/tareas", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert all(t["asignado_id"] == vendedor_user.id for t in data["items"])


def test_listar_tareas_admin_ve_todas(client, admin_token, vendedor_user, admin_user, db_session):
    from app.models.tarea import Tarea
    db_session.add(Tarea(titulo="a", due_date=date.today(), origen="manual", asignado_id=vendedor_user.id))
    db_session.add(Tarea(titulo="b", due_date=date.today(), origen="manual", asignado_id=admin_user.id))
    db_session.commit()

    resp = client.get("/api/tareas", headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert len(resp.json()["items"]) >= 2


def test_listar_filtra_por_cliente_id(client, admin_token, cliente_demo, admin_user, db_session):
    from app.models.tarea import Tarea
    db_session.add(Tarea(titulo="con cliente", due_date=date.today(), origen="manual",
                         asignado_id=admin_user.id, cliente_id=cliente_demo.id))
    db_session.add(Tarea(titulo="sin cliente", due_date=date.today(), origen="manual",
                         asignado_id=admin_user.id))
    db_session.commit()

    resp = client.get(f"/api/tareas?cliente_id={cliente_demo.id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    titulos = [t["titulo"] for t in resp.json()["items"]]
    assert "con cliente" in titulos
    assert "sin cliente" not in titulos
```

- [ ] **Step 2: Ejecutar — deben fallar**

Run: `cd backend && pytest tests/test_tareas_api.py -v`
Expected: 404 o método no existe.

- [ ] **Step 3: Implementar POST + GET list**

Añadir a `backend/app/api/tareas.py`:

```python
from fastapi import APIRouter, Depends, HTTPException, Query, status
from sqlalchemy.orm import Session, joinedload
from typing import Optional

from app.api.deps import require_permission
from app.models.user import User
from app.models.tarea import Tarea
from app.schemas.tarea import TareaIn, TareaOut


@router.post("", response_model=TareaOut, status_code=status.HTTP_201_CREATED)
def crear_tarea(
    payload: TareaIn,
    perms: tuple[User, Session] = require_permission("tareas", "create"),
):
    current_user, db = perms

    if current_user.role == "vendedor" and payload.asignado_id != current_user.id:
        raise HTTPException(403, detail="Vendedor solo puede asignarse a sí mismo")

    asignado = db.query(User).filter(User.id == payload.asignado_id, User.is_active.is_(True)).first()
    if asignado is None:
        raise HTTPException(422, detail="Usuario asignado no existe o está inactivo")

    t = Tarea(
        titulo=payload.titulo,
        descripcion=payload.descripcion,
        due_date=payload.due_date,
        origen="manual",
        asignado_id=payload.asignado_id,
        creado_por_id=current_user.id,
        cliente_id=payload.cliente_id,
        empresa_id=payload.empresa_id,
        cotizacion_id=payload.cotizacion_id,
        nota_venta_id=payload.nota_venta_id,
        factura_id=payload.factura_id,
        producto_id=payload.producto_id,
    )
    db.add(t)
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.get("")
def listar_tareas(
    asignado_id: Optional[int] = None,
    estado: str = "pendiente",
    prioridad_derivada_q: Optional[str] = Query(None, alias="prioridad_derivada"),
    cliente_id: Optional[int] = None,
    empresa_id: Optional[int] = None,
    cotizacion_id: Optional[int] = None,
    nota_venta_id: Optional[int] = None,
    factura_id: Optional[int] = None,
    producto_id: Optional[int] = None,
    origen: Optional[str] = None,
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms

    q = db.query(Tarea).options(joinedload(Tarea.asignado))

    # Vendedor sin view_all → filtro forzado a sí mismo
    from app.core.permissions import has_permission
    if not has_permission(db, current_user, "tareas", "view_all"):
        q = q.filter(Tarea.asignado_id == current_user.id)
    elif asignado_id is not None:
        q = q.filter(Tarea.asignado_id == asignado_id)

    q = q.filter(Tarea.estado == estado)

    for col, val in [
        (Tarea.cliente_id, cliente_id),
        (Tarea.empresa_id, empresa_id),
        (Tarea.cotizacion_id, cotizacion_id),
        (Tarea.nota_venta_id, nota_venta_id),
        (Tarea.factura_id, factura_id),
        (Tarea.producto_id, producto_id),
    ]:
        if val is not None:
            q = q.filter(col == val)

    if origen is not None:
        q = q.filter(Tarea.origen == origen)

    from sqlalchemy import case
    q = q.order_by(case((Tarea.estado == "pendiente", 0), else_=1), Tarea.due_date.asc())

    total = q.count()
    items = q.offset((page - 1) * page_size).limit(page_size).all()

    # filtro post-query para prioridad_derivada (depende de today)
    serialized = [serialize_tarea(t) for t in items]
    if prioridad_derivada_q:
        serialized = [s for s in serialized if s["prioridad_derivada"] == prioridad_derivada_q]

    return {"items": serialized, "total": total, "page": page, "page_size": page_size}
```

- [ ] **Step 4: Correr tests**

Run: `cd backend && pytest tests/test_tareas_api.py -v -k "crear_tarea or listar"`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/tareas.py backend/tests/test_tareas_api.py
git commit -m "feat(tareas): endpoints POST crear y GET listar"
```

---

## Task 7: API — GET detail + PATCH + DELETE

**Files:**
- Modify: `backend/app/api/tareas.py`
- Modify: `backend/tests/test_tareas_api.py`

- [ ] **Step 1: Escribir tests**

Añadir a `backend/tests/test_tareas_api.py`:

```python
def test_get_detail_403_si_no_es_dueno_ni_admin(client, vendedor_token, otro_vendedor, db_session):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual", asignado_id=otro_vendedor.id)
    db_session.add(t); db_session.commit()
    resp = client.get(f"/api/tareas/{t.id}", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 403


def test_patch_auto_protege_titulo(client, admin_token, admin_user, db_session):
    from app.models.tarea import Tarea
    t = Tarea(titulo="orig", due_date=date.today(), origen="auto", tipo_regla="cotizacion_vence",
              dedup_key="cotizacion_vence:99", asignado_id=admin_user.id)
    db_session.add(t); db_session.commit()
    resp = client.patch(f"/api/tareas/{t.id}",
                        json={"titulo": "nuevo"},
                        headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 400  # titulo protegido en auto


def test_delete_solo_manual(client, admin_token, admin_user, db_session):
    from app.models.tarea import Tarea
    t_manual = Tarea(titulo="m", due_date=date.today(), origen="manual",
                     asignado_id=admin_user.id, creado_por_id=admin_user.id)
    t_auto = Tarea(titulo="a", due_date=date.today(), origen="auto",
                   tipo_regla="cotizacion_vence", dedup_key="cotizacion_vence:77",
                   asignado_id=admin_user.id)
    db_session.add_all([t_manual, t_auto]); db_session.commit()

    r1 = client.delete(f"/api/tareas/{t_manual.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 204
    r2 = client.delete(f"/api/tareas/{t_auto.id}", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 400
```

- [ ] **Step 2: Correr — deben fallar**

Run: `cd backend && pytest tests/test_tareas_api.py -v -k "detail or patch or delete"`
Expected: 404.

- [ ] **Step 3: Implementar endpoints**

Añadir a `backend/app/api/tareas.py`:

```python
from app.schemas.tarea import TareaPatch


def _get_or_404(db: Session, tarea_id: int) -> Tarea:
    t = db.query(Tarea).options(joinedload(Tarea.asignado)).filter(Tarea.id == tarea_id).first()
    if t is None:
        raise HTTPException(404, detail="Tarea no existe")
    return t


def _require_owner_or_admin(t: Tarea, user: User, db: Session):
    from app.core.permissions import has_permission
    if t.asignado_id == user.id or t.creado_por_id == user.id:
        return
    if has_permission(db, user, "tareas", "view_all"):
        return
    raise HTTPException(403, detail="Sin acceso a esta tarea")


@router.get("/{tarea_id}", response_model=TareaOut)
def get_tarea(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    return serialize_tarea(t)


@router.patch("/{tarea_id}", response_model=TareaOut)
def patch_tarea(
    tarea_id: int,
    payload: TareaPatch,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)

    from app.core.permissions import has_permission
    is_admin = has_permission(db, current_user, "tareas", "admin")

    if t.origen == "auto":
        if payload.titulo is not None or payload.descripcion is not None:
            raise HTTPException(400, detail="Tareas auto no permiten editar título/descripción")
        if not is_admin:
            raise HTTPException(403, detail="Solo admin edita tareas auto")
    else:
        if t.creado_por_id != current_user.id and t.asignado_id != current_user.id and not is_admin:
            raise HTTPException(403, detail="Sin permisos para editar")

    if payload.asignado_id is not None and payload.asignado_id != t.asignado_id:
        if not is_admin:
            raise HTTPException(403, detail="Solo admin reasigna")
        asignado = db.query(User).filter(User.id == payload.asignado_id, User.is_active.is_(True)).first()
        if asignado is None:
            raise HTTPException(422, detail="Usuario asignado inválido")

    for field in ("titulo", "descripcion", "due_date", "asignado_id"):
        val = getattr(payload, field)
        if val is not None:
            setattr(t, field, val)

    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.delete("/{tarea_id}", status_code=204)
def delete_tarea(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    if t.origen != "manual":
        raise HTTPException(400, detail="Solo tareas manuales se pueden eliminar")

    from app.core.permissions import has_permission
    is_admin = has_permission(db, current_user, "tareas", "admin")
    if t.creado_por_id != current_user.id and not is_admin:
        raise HTTPException(403, detail="Solo creador o admin")

    db.delete(t)
    db.commit()
```

- [ ] **Step 4: Correr tests**

Run: `cd backend && pytest tests/test_tareas_api.py -v`
Expected: PASS (nuevos + los de Task 6).

- [ ] **Step 5: Commit**

```bash
git add backend/app/api/tareas.py backend/tests/test_tareas_api.py
git commit -m "feat(tareas): GET detail, PATCH, DELETE con permisos"
```

---

## Task 8: API — Acciones (completar, descartar, reasignar) + mis-pendientes

**Files:**
- Modify: `backend/app/api/tareas.py`
- Modify: `backend/tests/test_tareas_api.py`

- [ ] **Step 1: Escribir tests**

Añadir:

```python
def test_completar(client, admin_token, admin_user, db_session):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual", asignado_id=admin_user.id)
    db_session.add(t); db_session.commit()
    resp = client.post(f"/api/tareas/{t.id}/completar",
                       headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    assert resp.json()["estado"] == "hecha"
    assert resp.json()["completada_at"] is not None


def test_descartar_requiere_motivo(client, admin_token, admin_user, db_session):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual", asignado_id=admin_user.id)
    db_session.add(t); db_session.commit()

    # Sin motivo → 422
    r1 = client.post(f"/api/tareas/{t.id}/descartar", json={},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r1.status_code == 422

    r2 = client.post(f"/api/tareas/{t.id}/descartar", json={"motivo": "ya no aplica"},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["estado"] == "descartada"
    assert r2.json()["motivo_descarte"] == "ya no aplica"


def test_reasignar_solo_admin(client, vendedor_token, admin_token, admin_user, vendedor_user, otro_vendedor, db_session):
    from app.models.tarea import Tarea
    t = Tarea(titulo="x", due_date=date.today(), origen="manual", asignado_id=vendedor_user.id)
    db_session.add(t); db_session.commit()

    # Vendedor no puede reasignar
    r1 = client.post(f"/api/tareas/{t.id}/reasignar", json={"asignado_id": otro_vendedor.id},
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r1.status_code == 403

    # Admin sí
    r2 = client.post(f"/api/tareas/{t.id}/reasignar", json={"asignado_id": otro_vendedor.id},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert r2.json()["asignado_id"] == otro_vendedor.id


def test_mis_pendientes(client, vendedor_token, vendedor_user, db_session):
    from app.models.tarea import Tarea
    db_session.add(Tarea(titulo="ayer", due_date=date.today() - timedelta(days=1),
                         origen="manual", asignado_id=vendedor_user.id))
    db_session.add(Tarea(titulo="hoy", due_date=date.today(), origen="manual",
                         asignado_id=vendedor_user.id))
    db_session.add(Tarea(titulo="manana", due_date=date.today() + timedelta(days=1),
                         origen="manual", asignado_id=vendedor_user.id))
    db_session.commit()

    resp = client.get("/api/tareas/mis-pendientes",
                      headers={"Authorization": f"Bearer {vendedor_token}"})
    assert resp.status_code == 200
    data = resp.json()
    assert data["vencidas"] >= 1
    assert data["hoy"] >= 1
    assert data["futuras"] >= 1
    assert data["total"] == data["vencidas"] + data["hoy"] + data["futuras"]
    assert len(data["tareas"]) <= 5
```

- [ ] **Step 2: Implementar acciones**

Añadir:

```python
from datetime import datetime, timezone
from app.schemas.tarea import DescartarIn, ReasignarIn, MisPendientesOut


@router.post("/{tarea_id}/completar", response_model=TareaOut)
def completar(
    tarea_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    if t.estado == "hecha":
        return serialize_tarea(t)
    t.estado = "hecha"
    t.completada_at = datetime.now(timezone.utc)
    t.completada_por_id = current_user.id
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.post("/{tarea_id}/descartar", response_model=TareaOut)
def descartar(
    tarea_id: int,
    payload: DescartarIn,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    _require_owner_or_admin(t, current_user, db)
    t.estado = "descartada"
    t.motivo_descarte = payload.motivo
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.post("/{tarea_id}/reasignar", response_model=TareaOut)
def reasignar(
    tarea_id: int,
    payload: ReasignarIn,
    perms: tuple[User, Session] = require_permission("tareas", "admin"),
):
    current_user, db = perms
    t = _get_or_404(db, tarea_id)
    asignado = db.query(User).filter(User.id == payload.asignado_id, User.is_active.is_(True)).first()
    if asignado is None:
        raise HTTPException(422, detail="Usuario inválido")
    t.asignado_id = payload.asignado_id
    db.commit()
    db.refresh(t)
    return serialize_tarea(t)


@router.get("/mis-pendientes", response_model=MisPendientesOut)
def mis_pendientes(perms: tuple[User, Session] = require_permission("tareas", "view")):
    current_user, db = perms
    today = date.today()

    q = db.query(Tarea).options(joinedload(Tarea.asignado)).filter(
        Tarea.asignado_id == current_user.id,
        Tarea.estado == "pendiente",
    )

    tareas = q.order_by(Tarea.due_date.asc()).all()
    vencidas = sum(1 for t in tareas if t.due_date < today)
    hoy = sum(1 for t in tareas if t.due_date == today)
    futuras = sum(1 for t in tareas if t.due_date > today)

    return {
        "vencidas": vencidas,
        "hoy": hoy,
        "futuras": futuras,
        "total": len(tareas),
        "tareas": [serialize_tarea(t) for t in tareas[:5]],
    }
```

**Nota:** `/mis-pendientes` debe declararse ANTES de `/{tarea_id}` en el código para que FastAPI no lo interprete como `tarea_id="mis-pendientes"`. Ordenar las definiciones correctamente.

- [ ] **Step 3: Correr tests**

Run: `cd backend && pytest tests/test_tareas_api.py -v`
Expected: todos PASS.

- [ ] **Step 4: Commit**

```bash
git add backend/app/api/tareas.py backend/tests/test_tareas_api.py
git commit -m "feat(tareas): acciones completar/descartar/reasignar + mis-pendientes"
```

---

## Task 9: API — Timeline por entidad

**Files:**
- Modify: `backend/app/api/tareas.py`
- Modify: `backend/tests/test_tareas_api.py`

- [ ] **Step 1: Test**

```python
def test_timeline_tareas_por_entidad(client, admin_token, admin_user, cotizacion_demo, db_session):
    from app.models.tarea import Tarea
    db_session.add(Tarea(titulo="vinculada", due_date=date.today(), origen="manual",
                         asignado_id=admin_user.id, cotizacion_id=cotizacion_demo.id))
    db_session.add(Tarea(titulo="otra", due_date=date.today(), origen="manual",
                         asignado_id=admin_user.id))
    db_session.commit()

    resp = client.get(f"/api/tareas/timeline/cotizacion/{cotizacion_demo.id}",
                      headers={"Authorization": f"Bearer {admin_token}"})
    assert resp.status_code == 200
    titulos = [t["titulo"] for t in resp.json()]
    assert titulos == ["vinculada"]
```

- [ ] **Step 2: Implementar**

Añadir:

```python
ENTIDAD_FK_MAP = {
    "cliente": Tarea.cliente_id,
    "empresa": Tarea.empresa_id,
    "cotizacion": Tarea.cotizacion_id,
    "nota_venta": Tarea.nota_venta_id,
    "factura": Tarea.factura_id,
    "producto": Tarea.producto_id,
}


@router.get("/timeline/{entidad_tipo}/{entidad_id}")
def timeline(
    entidad_tipo: str,
    entidad_id: int,
    perms: tuple[User, Session] = require_permission("tareas", "view"),
):
    _, db = perms
    col = ENTIDAD_FK_MAP.get(entidad_tipo)
    if col is None:
        raise HTTPException(404, detail="Tipo de entidad inválido")

    tareas = (
        db.query(Tarea)
        .options(joinedload(Tarea.asignado))
        .filter(col == entidad_id)
        .order_by(Tarea.due_date.desc())
        .all()
    )
    return [serialize_tarea(t) for t in tareas]
```

**Importante:** declarar `/timeline/...` ANTES de `/{tarea_id}` o después de `mis-pendientes`, pero nunca quedar oculto por el catch-all.

- [ ] **Step 3: Correr tests + commit**

Run: `cd backend && pytest tests/test_tareas_api.py -v -k timeline`
Expected: PASS.

```bash
git add backend/app/api/tareas.py backend/tests/test_tareas_api.py
git commit -m "feat(tareas): timeline endpoint por entidad"
```

---

## Task 10: API — Config de reglas (admin)

**Files:**
- Create: `backend/app/api/reglas_tarea.py`
- Modify: `backend/app/main.py`
- Modify: `backend/tests/test_tareas_api.py` (o crear archivo aparte)

- [ ] **Step 1: Test**

Añadir:

```python
def test_listar_reglas_requiere_admin(client, admin_token, vendedor_token):
    r1 = client.get("/api/tareas/reglas", headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r1.status_code == 403
    r2 = client.get("/api/tareas/reglas", headers={"Authorization": f"Bearer {admin_token}"})
    assert r2.status_code == 200
    assert len(r2.json()) == 6  # 6 reglas seed


def test_patch_regla_offset_dias(client, admin_token):
    r = client.patch("/api/tareas/reglas/cotizacion_vence",
                     json={"offset_dias": 5},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 200
    assert r.json()["offset_dias"] == 5


def test_patch_regla_tipo_invalido_404(client, admin_token):
    r = client.patch("/api/tareas/reglas/inexistente",
                     json={"activa": False},
                     headers={"Authorization": f"Bearer {admin_token}"})
    assert r.status_code == 404
```

- [ ] **Step 2: Implementar**

```python
# backend/app/api/reglas_tarea.py
from fastapi import APIRouter, HTTPException
from sqlalchemy.orm import Session

from app.api.deps import require_permission
from app.models.user import User
from app.models.regla_tarea import ReglaTarea
from app.schemas.regla_tarea import ReglaTareaOut, ReglaTareaPatch

router = APIRouter(prefix="/tareas/reglas", tags=["tareas"])


@router.get("", response_model=list[ReglaTareaOut])
def listar_reglas(perms: tuple[User, Session] = require_permission("tareas", "admin")):
    _, db = perms
    return db.query(ReglaTarea).order_by(ReglaTarea.id).all()


@router.patch("/{tipo}", response_model=ReglaTareaOut)
def patch_regla(
    tipo: str,
    payload: ReglaTareaPatch,
    perms: tuple[User, Session] = require_permission("tareas", "admin"),
):
    _, db = perms
    r = db.query(ReglaTarea).filter(ReglaTarea.tipo == tipo).first()
    if r is None:
        raise HTTPException(404, detail="Regla no existe")
    for f in ("activa", "offset_dias", "asignado_rol"):
        v = getattr(payload, f)
        if v is not None:
            setattr(r, f, v)
    db.commit()
    db.refresh(r)
    return r
```

- [ ] **Step 3: Registrar router**

En `backend/app/main.py`:

```python
from app.api import reglas_tarea as reglas_tarea_api
app.include_router(reglas_tarea_api.router, prefix="/api")
```

- [ ] **Step 4: Tests + commit**

Run: `cd backend && pytest tests/test_tareas_api.py -v -k "regla"`
Expected: PASS.

```bash
git add backend/app/api/reglas_tarea.py backend/app/main.py backend/tests/test_tareas_api.py
git commit -m "feat(tareas): admin endpoints GET/PATCH reglas_tarea"
```

---

## Task 11: Service — resolver de `asignado_rol`

**Files:**
- Create: `backend/app/services/tareas_asignacion.py`
- Test: parte de `test_tareas_auto.py`

- [ ] **Step 1: Implementar resolver**

```python
# backend/app/services/tareas_asignacion.py
from typing import Optional
from sqlalchemy.orm import Session
from app.models.user import User


def _primer_admin_activo(db: Session) -> int:
    u = db.query(User).filter(User.role == "admin", User.is_active.is_(True)).order_by(User.id).first()
    if u is None:
        raise RuntimeError("No hay admins activos para asignar tareas")
    return u.id


def _primer_vendedor_activo(db: Session) -> int:
    u = db.query(User).filter(User.role == "vendedor", User.is_active.is_(True)).order_by(User.id).first()
    return u.id if u else _primer_admin_activo(db)


def resolver_asignado(db: Session, asignado_rol: str, entidad_vendedor_id: Optional[int]) -> int:
    """
    asignado_rol: 'owner' | 'vendedor' | 'admin'
    entidad_vendedor_id: vendedor_id de la entidad origen (para 'owner')
    """
    if asignado_rol == "admin":
        return _primer_admin_activo(db)
    if asignado_rol == "vendedor":
        return _primer_vendedor_activo(db)
    if asignado_rol == "owner":
        if entidad_vendedor_id is not None:
            u = db.query(User).filter(User.id == entidad_vendedor_id, User.is_active.is_(True)).first()
            if u is not None:
                return u.id
        return _primer_admin_activo(db)
    raise ValueError(f"asignado_rol inválido: {asignado_rol}")
```

- [ ] **Step 2: Commit**

```bash
git add backend/app/services/tareas_asignacion.py
git commit -m "feat(tareas): resolver asignado_rol → user_id"
```

---

## Task 12: Celery — job auto-generación (cotizacion_vence + factura_vencida)

**Files:**
- Create: `backend/app/tasks/tareas.py`
- Modify: `backend/app/celery_app.py`
- Create: `backend/tests/test_tareas_auto.py`

- [ ] **Step 1: Tests**

```python
# backend/tests/test_tareas_auto.py
from datetime import date, datetime, timedelta, timezone
from decimal import Decimal
import pytest
from freezegun import freeze_time

from app.models.tarea import Tarea
from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
from app.tasks.tareas import ejecutar_generacion


@freeze_time("2026-05-01")
def test_cotizacion_vence_genera_tarea(db_session, cliente_demo, vendedor_user):
    cot = Cotizacion(
        numero=99001, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28),  # expira 4/28 + 5d = 5/3 → en 2 días
        estado="abierta", validez_dias=5,
    )
    db_session.add(cot); db_session.commit()

    ejecutar_generacion(db_session)

    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1
    assert tareas[0].asignado_id == vendedor_user.id
    assert tareas[0].cotizacion_id == cot.id


@freeze_time("2026-05-01")
def test_cotizacion_vence_idempotente(db_session, cliente_demo, vendedor_user):
    cot = Cotizacion(
        numero=99002, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28), estado="abierta", validez_dias=5,
    )
    db_session.add(cot); db_session.commit()

    ejecutar_generacion(db_session)
    ejecutar_generacion(db_session)

    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1


@freeze_time("2026-05-01")
def test_cotizacion_auto_descarte_al_cerrar(db_session, cliente_demo, vendedor_user):
    cot = Cotizacion(
        numero=99003, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28), estado="abierta", validez_dias=5,
    )
    db_session.add(cot); db_session.commit()
    ejecutar_generacion(db_session)

    cot.estado = "cerrada_fv"
    db_session.commit()
    ejecutar_generacion(db_session)

    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "cotizacion_vence").all()
    assert len(tareas) == 1
    assert tareas[0].estado == "descartada"
    assert tareas[0].motivo_descarte == "evento resuelto"


@freeze_time("2026-05-01")
def test_factura_vencida_genera_tarea(db_session, cliente_demo, empresa_demo, vendedor_user):
    f = Factura(
        numero=1001, cliente_id=cliente_demo.id, empresa_id=empresa_demo.id,
        vendedor_id=vendedor_user.id, fecha=date(2026, 4, 1),
        fecha_vencimiento=date(2026, 4, 29),  # vencida hace 2 días
        estado="emitida", total=Decimal("10000"),
    )
    db_session.add(f); db_session.commit()

    ejecutar_generacion(db_session)

    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "factura_vencida").all()
    assert len(tareas) == 1
    assert tareas[0].factura_id == f.id
```

- [ ] **Step 2: Implementar job (solo 2 primeras reglas por ahora)**

```python
# backend/app/tasks/tareas.py
from __future__ import annotations
from datetime import date, timedelta
import logging
from sqlalchemy.orm import Session

from app.celery_app import celery_app
from app.database import SessionLocal
from app.models.tarea import Tarea
from app.models.regla_tarea import ReglaTarea
from app.models.cotizacion import Cotizacion
from app.models.factura import Factura
from app.services.tareas_asignacion import resolver_asignado

log = logging.getLogger(__name__)

MAX_CANDIDATOS = 500


def _existe_pendiente(db: Session, key: str) -> bool:
    return db.query(Tarea.id).filter(
        Tarea.dedup_key == key, Tarea.estado == "pendiente"
    ).first() is not None


def _crear_tarea(db: Session, *, titulo: str, due_date, regla: ReglaTarea,
                 dedup_key: str, asignado_id: int, **fks):
    t = Tarea(
        titulo=titulo,
        due_date=due_date,
        origen="auto",
        tipo_regla=regla.tipo,
        dedup_key=dedup_key,
        asignado_id=asignado_id,
        **fks,
    )
    db.add(t)


def _descartar_obsoletas(db: Session, regla: ReglaTarea, sigue_aplicando):
    """Descarta tareas pendientes de este tipo cuyo evento ya no aplica."""
    pendientes = db.query(Tarea).filter(
        Tarea.origen == "auto",
        Tarea.tipo_regla == regla.tipo,
        Tarea.estado == "pendiente",
    ).all()
    for t in pendientes:
        if not sigue_aplicando(db, t):
            t.estado = "descartada"
            t.motivo_descarte = "evento resuelto"


# ---------- cotizacion_vence ----------

def _generar_cotizacion_vence(db: Session, regla: ReglaTarea):
    today = date.today()
    # Query Python-side para fecha_expiracion (computed field en Cotizacion)
    abiertas = db.query(Cotizacion).filter(Cotizacion.estado == "abierta").all()
    candidatos = [
        c for c in abiertas
        if (c.fecha + timedelta(days=c.validez_dias) - today).days <= regla.offset_dias
        and (c.fecha + timedelta(days=c.validez_dias)) >= today
    ]
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"cotizacion_vence excede {MAX_CANDIDATOS}, omitido")
        return

    for c in candidatos:
        key = f"cotizacion_vence:{c.id}"
        if _existe_pendiente(db, key):
            continue
        dias_restantes = (c.fecha + timedelta(days=c.validez_dias) - today).days
        asignado = resolver_asignado(db, regla.asignado_rol, c.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"Cotización #{c.numero} vence en {dias_restantes} días",
            due_date=c.fecha + timedelta(days=c.validez_dias),
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            cotizacion_id=c.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.cotizacion_id is None:
            return False
        c = db.query(Cotizacion).filter(Cotizacion.id == t.cotizacion_id).first()
        return c is not None and c.estado == "abierta"
    _descartar_obsoletas(db, regla, _sigue)


# ---------- factura_vencida ----------

def _generar_factura_vencida(db: Session, regla: ReglaTarea):
    today = date.today()
    candidatos = db.query(Factura).filter(
        Factura.estado == "emitida",
        Factura.fecha_vencimiento < today - timedelta(days=regla.offset_dias),
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"factura_vencida excede {MAX_CANDIDATOS}, omitido")
        return

    for f in candidatos:
        key = f"factura_vencida:{f.id}"
        if _existe_pendiente(db, key):
            continue
        dias_vencida = (today - f.fecha_vencimiento).days
        asignado = resolver_asignado(db, regla.asignado_rol, f.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"Factura #{f.numero} vencida hace {dias_vencida} días",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            factura_id=f.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.factura_id is None:
            return False
        f = db.query(Factura).filter(Factura.id == t.factura_id).first()
        return f is not None and f.estado == "emitida"
    _descartar_obsoletas(db, regla, _sigue)


# ---------- dispatcher ----------

GENERADORES = {
    "cotizacion_vence": _generar_cotizacion_vence,
    "factura_vencida": _generar_factura_vencida,
    # Tasks 13, 14 añaden las otras 4 reglas
}


def ejecutar_generacion(db: Session):
    reglas = db.query(ReglaTarea).filter(ReglaTarea.activa.is_(True)).all()
    for r in reglas:
        fn = GENERADORES.get(r.tipo)
        if fn is None:
            continue
        fn(db, r)
    db.commit()


@celery_app.task(name="app.tasks.tareas.generar_tareas_automaticas")
def generar_tareas_automaticas():
    db = SessionLocal()
    try:
        ejecutar_generacion(db)
    finally:
        db.close()
```

- [ ] **Step 3: Registrar en celery_app + schedule**

Editar `backend/app/celery_app.py`:

```python
celery_app = Celery(
    "conico",
    broker=settings.redis_url,
    backend=settings.redis_url,
    include=["app.tasks.dte", "app.tasks.tareas"],  # <-- añadir
)

# ... existing config ...

celery_app.conf.beat_schedule = {
    "poll-dte-status": {
        "task": "app.tasks.dte.poll_dte_status",
        "schedule": 300.0,
    },
    "generar-tareas-automaticas": {
        "task": "app.tasks.tareas.generar_tareas_automaticas",
        "schedule": 3600.0,  # cada hora
    },
}
```

- [ ] **Step 4: Tests + commit**

Run: `cd backend && pytest tests/test_tareas_auto.py -v`
Expected: PASS (solo cotizacion_vence y factura_vencida).

```bash
git add backend/app/tasks/tareas.py backend/app/celery_app.py backend/tests/test_tareas_auto.py
git commit -m "feat(tareas): celery job + reglas cotizacion_vence y factura_vencida"
```

---

## Task 13: Celery — reglas aprobacion_pendiente + nv_despachada_sin_avanzar

**Files:**
- Modify: `backend/app/tasks/tareas.py`
- Modify: `backend/tests/test_tareas_auto.py`

- [ ] **Step 1: Tests**

```python
@freeze_time("2026-05-01")
def test_aprobacion_pendiente_credito(db_session, admin_user, vendedor_user, db_setup_aprobacion):
    from app.models.aprobacion_credito import AprobacionCredito
    a = AprobacionCredito(
        origen="directa", estado="pendiente",
        vendedor_id=vendedor_user.id, payload_json={},
        created_at=datetime(2026, 4, 29, tzinfo=timezone.utc),  # hace 2 días
    )
    db_session.add(a); db_session.commit()

    ejecutar_generacion(db_session)
    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "aprobacion_pendiente").all()
    assert len(tareas) == 1
    assert tareas[0].asignado_id == admin_user.id  # admin_rol → primer admin


@freeze_time("2026-05-01")
def test_nv_despachada_sin_avanzar(db_session, cliente_demo, vendedor_user):
    from app.models.nota_venta import NotaVenta
    nv = NotaVenta(
        numero=5001, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 25), estado="despachada",
        fecha_despacho=date(2026, 4, 26),  # hace 5 días
        total=Decimal("10000"),
    )
    db_session.add(nv); db_session.commit()

    ejecutar_generacion(db_session)
    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "nv_despachada_sin_avanzar").all()
    assert len(tareas) == 1
    assert tareas[0].nota_venta_id == nv.id
```

**Nota:** el fixture `db_setup_aprobacion` puede no existir; en ese caso inline el setup dentro del test.

- [ ] **Step 2: Implementar ambas reglas en `tasks/tareas.py`**

Añadir al dispatcher y funciones:

```python
from app.models.aprobacion_credito import AprobacionCredito
from app.models.aprobacion_margen import AprobacionMargen
from app.models.nota_venta import NotaVenta
from datetime import datetime, timezone


def _generar_aprobacion_pendiente(db, regla):
    today_dt = datetime.now(timezone.utc)
    cutoff = today_dt - timedelta(days=regla.offset_dias)

    for model, tipo_label in [(AprobacionCredito, "credito"), (AprobacionMargen, "margen")]:
        candidatos = db.query(model).filter(
            model.estado == "pendiente",
            model.created_at <= cutoff,
        ).all()
        if len(candidatos) > MAX_CANDIDATOS:
            log.warning(f"aprobacion_{tipo_label} excede {MAX_CANDIDATOS}")
            continue
        for a in candidatos:
            key = f"aprobacion_{tipo_label}:{a.id}"
            if _existe_pendiente(db, key):
                continue
            dias = (today_dt - a.created_at).days
            asignado = resolver_asignado(db, regla.asignado_rol, None)
            _crear_tarea(
                db,
                titulo=f"Aprobación pendiente desde hace {dias} días",
                due_date=date.today(),
                regla=regla,
                dedup_key=key,
                asignado_id=asignado,
            )

    def _sigue(db, t: Tarea) -> bool:
        prefix, sep, rest = (t.dedup_key or "").partition(":")
        if not rest:
            return False
        tipo = prefix.replace("aprobacion_", "")
        model = AprobacionCredito if tipo == "credito" else AprobacionMargen
        a = db.query(model).filter(model.id == int(rest)).first()
        return a is not None and a.estado == "pendiente"
    _descartar_obsoletas(db, regla, _sigue)


def _generar_nv_despachada_sin_avanzar(db, regla):
    today = date.today()
    cutoff = today - timedelta(days=regla.offset_dias)
    candidatos = db.query(NotaVenta).filter(
        NotaVenta.estado == "despachada",
        NotaVenta.fecha_despacho <= cutoff,
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"nv_atascada excede {MAX_CANDIDATOS}")
        return

    for nv in candidatos:
        key = f"nv_atascada:{nv.id}"
        if _existe_pendiente(db, key):
            continue
        dias = (today - nv.fecha_despacho).days
        asignado = resolver_asignado(db, regla.asignado_rol, nv.vendedor_id)
        _crear_tarea(
            db,
            titulo=f"NV #{nv.numero} despachada hace {dias}d sin avanzar",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            nota_venta_id=nv.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.nota_venta_id is None:
            return False
        nv = db.query(NotaVenta).filter(NotaVenta.id == t.nota_venta_id).first()
        return nv is not None and nv.estado == "despachada"
    _descartar_obsoletas(db, regla, _sigue)


GENERADORES.update({
    "aprobacion_pendiente": _generar_aprobacion_pendiente,
    "nv_despachada_sin_avanzar": _generar_nv_despachada_sin_avanzar,
})
```

**Nota:** Verificar los campos reales de `NotaVenta` — si no existe `fecha_despacho` (sino `despachada_at` o similar), adaptar el query. Si no hay timestamp de despacho, usar `updated_at` como proxy o agregar columna en otro PR.

- [ ] **Step 3: Tests + commit**

Run: `cd backend && pytest tests/test_tareas_auto.py -v`
Expected: PASS.

```bash
git add backend/app/tasks/tareas.py backend/tests/test_tareas_auto.py
git commit -m "feat(tareas): reglas aprobacion_pendiente y nv_despachada_sin_avanzar"
```

---

## Task 14: Celery — reglas cliente_sin_actividad + stock_bajo_minimo

**Files:**
- Modify: `backend/app/tasks/tareas.py`
- Modify: `backend/tests/test_tareas_auto.py`

- [ ] **Step 1: Tests**

```python
@freeze_time("2026-05-01")
def test_cliente_sin_actividad(db_session, admin_user, vendedor_user):
    from app.models.cliente import Cliente
    from app.models.cotizacion import Cotizacion
    c = Cliente(nombre="Inactivo SA", rut="11111111-1")
    db_session.add(c); db_session.commit()

    # Cotización vieja (hace 40 días) del vendedor
    cot = Cotizacion(
        numero=9999, cliente_id=c.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 3, 22), estado="cerrada_fv",
    )
    db_session.add(cot); db_session.commit()

    ejecutar_generacion(db_session)
    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "cliente_sin_actividad").all()
    assert len(tareas) == 1
    assert tareas[0].cliente_id == c.id
    assert tareas[0].asignado_id == vendedor_user.id  # último vendedor


@freeze_time("2026-05-01")
def test_stock_bajo_minimo(db_session, admin_user):
    from app.models.producto import Producto
    p = Producto(nombre="Tornillo", sku="SKU-1", stock_actual=2, stock_minimo=10,
                 precio_costo=Decimal("100"), precio_venta=Decimal("150"))
    db_session.add(p); db_session.commit()

    ejecutar_generacion(db_session)
    tareas = db_session.query(Tarea).filter(Tarea.tipo_regla == "stock_bajo_minimo").all()
    assert len(tareas) == 1
    assert tareas[0].producto_id == p.id
    assert tareas[0].asignado_id == admin_user.id
```

- [ ] **Step 2: Implementar ambas**

```python
from app.models.cliente import Cliente
from app.models.producto import Producto
from sqlalchemy import func


def _generar_cliente_sin_actividad(db, regla):
    today = date.today()
    cutoff = today - timedelta(days=regla.offset_dias)

    # Última actividad por cliente: max(fecha) de cotizaciones Y notas_venta
    cots = db.query(
        Cotizacion.cliente_id.label("cid"),
        func.max(Cotizacion.fecha).label("ult"),
        func.max(Cotizacion.vendedor_id).label("vendedor"),
    ).group_by(Cotizacion.cliente_id).subquery()

    # Clientes sin actividad reciente
    rows = db.query(Cliente, cots.c.ult, cots.c.vendedor).outerjoin(cots, cots.c.cid == Cliente.id).all()
    candidatos = [(c, ult, vend) for c, ult, vend in rows
                  if ult is None or ult <= cutoff]

    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"cliente_sin_actividad excede {MAX_CANDIDATOS}")
        return

    for c, ult, vend in candidatos:
        key = f"cliente_inactivo:{c.id}"
        if _existe_pendiente(db, key):
            continue
        dias = (today - ult).days if ult else regla.offset_dias
        asignado = resolver_asignado(db, regla.asignado_rol, vend)
        _crear_tarea(
            db,
            titulo=f"Cliente {c.nombre} sin actividad hace {dias}d",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            cliente_id=c.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.cliente_id is None:
            return False
        last = db.query(func.max(Cotizacion.fecha)).filter(
            Cotizacion.cliente_id == t.cliente_id
        ).scalar()
        return last is None or last <= cutoff
    _descartar_obsoletas(db, regla, _sigue)


def _generar_stock_bajo_minimo(db, regla):
    today = date.today()
    candidatos = db.query(Producto).filter(
        Producto.stock_actual < Producto.stock_minimo
    ).all()
    if len(candidatos) > MAX_CANDIDATOS:
        log.warning(f"stock_bajo excede {MAX_CANDIDATOS}")
        return

    for p in candidatos:
        key = f"stock_bajo:{p.id}"
        if _existe_pendiente(db, key):
            continue
        asignado = resolver_asignado(db, regla.asignado_rol, None)
        _crear_tarea(
            db,
            titulo=f"Stock bajo: {p.nombre} ({p.stock_actual}/{p.stock_minimo})",
            due_date=today,
            regla=regla,
            dedup_key=key,
            asignado_id=asignado,
            producto_id=p.id,
        )

    def _sigue(db, t: Tarea) -> bool:
        if t.producto_id is None:
            return False
        p = db.query(Producto).filter(Producto.id == t.producto_id).first()
        return p is not None and p.stock_actual < p.stock_minimo
    _descartar_obsoletas(db, regla, _sigue)


GENERADORES.update({
    "cliente_sin_actividad": _generar_cliente_sin_actividad,
    "stock_bajo_minimo": _generar_stock_bajo_minimo,
})
```

- [ ] **Step 3: Tests + commit**

Run: `cd backend && pytest tests/test_tareas_auto.py -v`
Expected: PASS (las 6 reglas).

```bash
git add backend/app/tasks/tareas.py backend/tests/test_tareas_auto.py
git commit -m "feat(tareas): reglas cliente_sin_actividad y stock_bajo_minimo"
```

---

## Task 15: Hook al desactivar user — reasignar tareas pendientes

**Files:**
- Modify: `backend/app/api/users.py` (o service correspondiente)
- Modify: `backend/tests/test_users.py` (añadir test)

- [ ] **Step 1: Test**

Añadir a `backend/tests/test_users.py`:

```python
def test_desactivar_user_reasigna_tareas_a_admin(client, admin_token, admin_user, vendedor_user, db_session):
    from datetime import date
    from app.models.tarea import Tarea
    t = Tarea(titulo="huerfana-futura", due_date=date.today(), origen="manual",
              asignado_id=vendedor_user.id)
    db_session.add(t); db_session.commit()
    tarea_id = t.id

    resp = client.patch(
        f"/api/users/{vendedor_user.id}",
        json={"is_active": False},
        headers={"Authorization": f"Bearer {admin_token}"},
    )
    assert resp.status_code == 200

    db_session.expire_all()
    t_reloaded = db_session.query(Tarea).filter(Tarea.id == tarea_id).first()
    assert t_reloaded.asignado_id == admin_user.id
```

- [ ] **Step 2: Implementar hook en `api/users.py`**

Localizar endpoint PATCH `/users/{id}`. Antes de retornar, si pasó de `is_active=True` a `False`:

```python
# dentro del endpoint de PATCH de users, antes de db.commit() final
if payload.is_active is False and user.is_active is True:
    from app.models.tarea import Tarea
    from app.services.tareas_asignacion import _primer_admin_activo
    nuevo_asignado = _primer_admin_activo(db)
    db.query(Tarea).filter(
        Tarea.asignado_id == user.id,
        Tarea.estado == "pendiente",
    ).update({"asignado_id": nuevo_asignado}, synchronize_session=False)
```

- [ ] **Step 3: Tests + commit**

Run: `cd backend && pytest tests/test_users.py -v -k desactivar`
Expected: PASS.

```bash
git add backend/app/api/users.py backend/tests/test_users.py
git commit -m "feat(tareas): reasignar tareas al desactivar usuario"
```

---

## Task 16: Frontend — tipos + API client

**Files:**
- Create: `frontend/src/types/tarea.ts`
- Create: `frontend/src/api/tareas.ts`

- [ ] **Step 1: Crear tipos**

```typescript
// frontend/src/types/tarea.ts
export type TareaEstado = 'pendiente' | 'hecha' | 'descartada';
export type TareaOrigen = 'manual' | 'auto';
export type PrioridadDerivada = 'vencida' | 'hoy' | 'futura';
export type AsignadoRol = 'vendedor' | 'admin' | 'owner';

export interface Tarea {
  id: number;
  titulo: string;
  descripcion: string | null;
  due_date: string;
  estado: TareaEstado;
  motivo_descarte: string | null;
  origen: TareaOrigen;
  tipo_regla: string | null;
  prioridad_derivada: PrioridadDerivada;
  asignado_id: number;
  asignado_nombre: string;
  creado_por_id: number | null;
  cliente_id: number | null;
  empresa_id: number | null;
  cotizacion_id: number | null;
  nota_venta_id: number | null;
  factura_id: number | null;
  producto_id: number | null;
  completada_at: string | null;
  created_at: string;
  updated_at: string;
}

export interface MisPendientes {
  vencidas: number;
  hoy: number;
  futuras: number;
  total: number;
  tareas: Tarea[];
}

export interface ReglaTarea {
  id: number;
  tipo: string;
  activa: boolean;
  offset_dias: number;
  asignado_rol: AsignadoRol;
}

export interface TareaCreateInput {
  titulo: string;
  descripcion?: string;
  due_date: string;
  asignado_id: number;
  cliente_id?: number;
  empresa_id?: number;
  cotizacion_id?: number;
  nota_venta_id?: number;
  factura_id?: number;
  producto_id?: number;
}

export interface TareaFiltros {
  asignado_id?: number;
  estado?: TareaEstado;
  prioridad_derivada?: PrioridadDerivada;
  cliente_id?: number;
  empresa_id?: number;
  cotizacion_id?: number;
  nota_venta_id?: number;
  factura_id?: number;
  producto_id?: number;
  origen?: TareaOrigen;
  page?: number;
  page_size?: number;
}
```

- [ ] **Step 2: Crear API client**

```typescript
// frontend/src/api/tareas.ts
import { api } from './client'; // asume existe el cliente axios/fetch compartido
import type {
  Tarea, MisPendientes, ReglaTarea, TareaCreateInput, TareaFiltros,
} from '../types/tarea';

export async function listarTareas(filtros: TareaFiltros = {}): Promise<{ items: Tarea[]; total: number }> {
  const params = Object.fromEntries(Object.entries(filtros).filter(([_, v]) => v != null));
  const { data } = await api.get('/tareas', { params });
  return data;
}

export async function misPendientes(): Promise<MisPendientes> {
  const { data } = await api.get<MisPendientes>('/tareas/mis-pendientes');
  return data;
}

export async function crearTarea(input: TareaCreateInput): Promise<Tarea> {
  const { data } = await api.post<Tarea>('/tareas', input);
  return data;
}

export async function getTarea(id: number): Promise<Tarea> {
  const { data } = await api.get<Tarea>(`/tareas/${id}`);
  return data;
}

export async function patchTarea(id: number, patch: Partial<TareaCreateInput>): Promise<Tarea> {
  const { data } = await api.patch<Tarea>(`/tareas/${id}`, patch);
  return data;
}

export async function deleteTarea(id: number): Promise<void> {
  await api.delete(`/tareas/${id}`);
}

export async function completarTarea(id: number): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/tareas/${id}/completar`);
  return data;
}

export async function descartarTarea(id: number, motivo: string): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/tareas/${id}/descartar`, { motivo });
  return data;
}

export async function reasignarTarea(id: number, asignado_id: number): Promise<Tarea> {
  const { data } = await api.post<Tarea>(`/tareas/${id}/reasignar`, { asignado_id });
  return data;
}

export async function timelineTareas(
  entidadTipo: 'cliente' | 'empresa' | 'cotizacion' | 'nota_venta' | 'factura' | 'producto',
  entidadId: number,
): Promise<Tarea[]> {
  const { data } = await api.get<Tarea[]>(`/tareas/timeline/${entidadTipo}/${entidadId}`);
  return data;
}

export async function listarReglas(): Promise<ReglaTarea[]> {
  const { data } = await api.get<ReglaTarea[]>('/tareas/reglas');
  return data;
}

export async function patchRegla(tipo: string, patch: Partial<Pick<ReglaTarea, 'activa' | 'offset_dias' | 'asignado_rol'>>): Promise<ReglaTarea> {
  const { data } = await api.patch<ReglaTarea>(`/tareas/reglas/${tipo}`, patch);
  return data;
}
```

**Verificar:** el path real del cliente axios (puede ser `'./client'`, `'@/lib/api'`, etc.) — revisar otro archivo en `frontend/src/api/` para adaptar.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/types/tarea.ts frontend/src/api/tareas.ts
git commit -m "feat(tareas): tipos TS + cliente API"
```

---

## Task 17: Frontend — Página `/tareas`

**Files:**
- Create: `frontend/src/pages/Tareas.tsx`
- Modify: `frontend/src/App.tsx` (añadir ruta)

- [ ] **Step 1: Crear página**

```tsx
// frontend/src/pages/Tareas.tsx
import { useEffect, useState } from 'react';
import { listarTareas, completarTarea, descartarTarea } from '../api/tareas';
import type { Tarea, TareaEstado, TareaFiltros } from '../types/tarea';
import { useAuth } from '../hooks/useAuth'; // asumiendo existe
import TareaModal from '../components/TareaModal';
import TareaDrawer from '../components/TareaDrawer';

const ICONO_PRIORIDAD = { vencida: '🔴', hoy: '🟡', futura: '⚪' };

export default function TareasPage() {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';
  const [tab, setTab] = useState<TareaEstado>('pendiente');
  const [filtros, setFiltros] = useState<TareaFiltros>({ estado: 'pendiente' });
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [total, setTotal] = useState(0);
  const [modalOpen, setModalOpen] = useState(false);
  const [drawerTarea, setDrawerTarea] = useState<Tarea | null>(null);

  async function cargar() {
    const { items, total } = await listarTareas({ ...filtros, estado: tab });
    setTareas(items);
    setTotal(total);
  }

  useEffect(() => { cargar(); }, [tab, JSON.stringify(filtros)]);

  async function handleCompletar(t: Tarea) {
    await completarTarea(t.id);
    cargar();
  }

  async function handleDescartar(t: Tarea) {
    const motivo = prompt('Motivo del descarte:');
    if (!motivo) return;
    await descartarTarea(t.id, motivo);
    cargar();
  }

  function entidadLink(t: Tarea): { label: string; href: string } | null {
    if (t.cotizacion_id) return { label: `Cotización #${t.cotizacion_id}`, href: `/cotizaciones/${t.cotizacion_id}` };
    if (t.nota_venta_id) return { label: `NV #${t.nota_venta_id}`, href: `/notas-venta/${t.nota_venta_id}` };
    if (t.factura_id) return { label: `Factura #${t.factura_id}`, href: `/facturas/${t.factura_id}` };
    if (t.cliente_id) return { label: `Cliente #${t.cliente_id}`, href: `/clientes/${t.cliente_id}` };
    if (t.empresa_id) return { label: `Empresa #${t.empresa_id}`, href: `/empresas/${t.empresa_id}` };
    if (t.producto_id) return { label: `Producto #${t.producto_id}`, href: `/productos/${t.producto_id}` };
    return null;
  }

  return (
    <div className="p-6">
      <div className="flex justify-between items-center mb-4">
        <h1 className="text-2xl font-bold">Tareas</h1>
        <button className="btn-primary" onClick={() => setModalOpen(true)}>+ Nueva tarea</button>
      </div>

      <div className="flex gap-2 mb-4">
        {(['pendiente', 'hecha', 'descartada'] as TareaEstado[]).map(e => (
          <button key={e}
            className={`px-3 py-1 rounded ${tab === e ? 'bg-blue-600 text-white' : 'bg-gray-200'}`}
            onClick={() => setTab(e)}>
            {e} {tab === e && `(${total})`}
          </button>
        ))}
      </div>

      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2">Pri</th>
            <th className="p-2 text-left">Título</th>
            <th className="p-2 text-left">Vinculado</th>
            <th className="p-2">Asignado</th>
            <th className="p-2">Vence</th>
            <th className="p-2">Acciones</th>
          </tr>
        </thead>
        <tbody>
          {tareas.map(t => {
            const link = entidadLink(t);
            return (
              <tr key={t.id} className="border-t hover:bg-gray-50 cursor-pointer"
                  onClick={() => setDrawerTarea(t)}>
                <td className="p-2 text-center">{ICONO_PRIORIDAD[t.prioridad_derivada]}</td>
                <td className="p-2">{t.titulo}</td>
                <td className="p-2">{link ? <a href={link.href} className="text-blue-600 underline">{link.label}</a> : '—'}</td>
                <td className="p-2">{t.asignado_nombre}</td>
                <td className="p-2">{t.due_date}</td>
                <td className="p-2" onClick={e => e.stopPropagation()}>
                  {t.estado === 'pendiente' && (
                    <>
                      <button onClick={() => handleCompletar(t)}>✓</button>
                      {(t.origen === 'auto' || isAdmin) && (
                        <button className="ml-1" onClick={() => handleDescartar(t)}>✕</button>
                      )}
                    </>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {modalOpen && (
        <TareaModal onClose={() => setModalOpen(false)} onSaved={() => { setModalOpen(false); cargar(); }} />
      )}
      {drawerTarea && (
        <TareaDrawer tarea={drawerTarea} onClose={() => setDrawerTarea(null)} onChanged={cargar} />
      )}
    </div>
  );
}
```

- [ ] **Step 2: Añadir ruta en `App.tsx`**

```tsx
// frontend/src/App.tsx — dentro de <Routes>
import TareasPage from './pages/Tareas';
// ...
<Route path="/tareas" element={<TareasPage />} />
```

- [ ] **Step 3: Arrancar dev server + verificar**

Run: `cd frontend && npm run dev`
Abrir `http://localhost:5173/tareas`.
Expected: página carga, tabla vacía al inicio, botón "+ Nueva tarea" visible.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/Tareas.tsx frontend/src/App.tsx
git commit -m "feat(tareas): página /tareas con tabla y tabs"
```

---

## Task 18: Frontend — Modal nueva tarea + Drawer detalle

**Files:**
- Create: `frontend/src/components/TareaModal.tsx`
- Create: `frontend/src/components/TareaDrawer.tsx`

- [ ] **Step 1: `TareaModal.tsx`**

```tsx
// frontend/src/components/TareaModal.tsx
import { useState } from 'react';
import { crearTarea } from '../api/tareas';
import { useAuth } from '../hooks/useAuth';

interface Props {
  onClose: () => void;
  onSaved: () => void;
  vincularA?: {
    tipo: 'cliente' | 'empresa' | 'cotizacion' | 'nota_venta' | 'factura' | 'producto';
    id: number;
  };
}

export default function TareaModal({ onClose, onSaved, vincularA }: Props) {
  const { user } = useAuth();
  const [titulo, setTitulo] = useState('');
  const [descripcion, setDescripcion] = useState('');
  const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
  const [dueDate, setDueDate] = useState(tomorrow);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    const vinculo = vincularA ? { [`${vincularA.tipo}_id`]: vincularA.id } : {};
    await crearTarea({
      titulo,
      descripcion: descripcion || undefined,
      due_date: dueDate,
      asignado_id: user!.id,
      ...vinculo,
    });
    onSaved();
  }

  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <form onSubmit={handleSubmit} className="bg-white p-6 rounded-lg w-[480px]">
        <h2 className="text-xl font-bold mb-4">Nueva tarea</h2>

        <label className="block mb-2">
          Título *
          <input className="w-full border rounded p-2" required maxLength={255}
            value={titulo} onChange={e => setTitulo(e.target.value)} />
        </label>

        <label className="block mb-2">
          Descripción
          <textarea className="w-full border rounded p-2" rows={3}
            value={descripcion} onChange={e => setDescripcion(e.target.value)} />
        </label>

        <label className="block mb-2">
          Fecha vencimiento *
          <input type="date" className="w-full border rounded p-2" required
            value={dueDate} onChange={e => setDueDate(e.target.value)} />
        </label>

        {vincularA && (
          <div className="text-sm text-gray-600 mb-2">
            Vinculada a {vincularA.tipo} #{vincularA.id}
          </div>
        )}

        <div className="flex justify-end gap-2 mt-4">
          <button type="button" onClick={onClose} className="px-4 py-2">Cancelar</button>
          <button type="submit" className="btn-primary">Crear</button>
        </div>
      </form>
    </div>
  );
}
```

- [ ] **Step 2: `TareaDrawer.tsx`**

```tsx
// frontend/src/components/TareaDrawer.tsx
import type { Tarea } from '../types/tarea';
import { completarTarea, descartarTarea, deleteTarea } from '../api/tareas';
import { useAuth } from '../hooks/useAuth';

interface Props {
  tarea: Tarea;
  onClose: () => void;
  onChanged: () => void;
}

export default function TareaDrawer({ tarea, onClose, onChanged }: Props) {
  const { user } = useAuth();
  const isAdmin = user?.role === 'admin';

  async function handleCompletar() {
    await completarTarea(tarea.id);
    onChanged(); onClose();
  }

  async function handleDescartar() {
    const motivo = prompt('Motivo:');
    if (!motivo) return;
    await descartarTarea(tarea.id, motivo);
    onChanged(); onClose();
  }

  async function handleDelete() {
    if (!confirm('¿Eliminar esta tarea?')) return;
    await deleteTarea(tarea.id);
    onChanged(); onClose();
  }

  return (
    <div className="fixed inset-y-0 right-0 w-[420px] bg-white shadow-xl border-l z-40 p-6 overflow-auto">
      <div className="flex justify-between items-start mb-4">
        <h2 className="text-xl font-bold">{tarea.titulo}</h2>
        <button onClick={onClose}>✕</button>
      </div>

      <dl className="space-y-2 text-sm">
        <div><dt className="font-semibold">Estado</dt><dd>{tarea.estado}</dd></div>
        <div><dt className="font-semibold">Origen</dt><dd>{tarea.origen}</dd></div>
        <div><dt className="font-semibold">Vence</dt><dd>{tarea.due_date}</dd></div>
        <div><dt className="font-semibold">Asignada a</dt><dd>{tarea.asignado_nombre}</dd></div>
        {tarea.descripcion && (
          <div><dt className="font-semibold">Descripción</dt><dd>{tarea.descripcion}</dd></div>
        )}
        {tarea.motivo_descarte && (
          <div><dt className="font-semibold">Motivo descarte</dt><dd>{tarea.motivo_descarte}</dd></div>
        )}
      </dl>

      {tarea.estado === 'pendiente' && (
        <div className="mt-6 flex flex-col gap-2">
          <button className="btn-primary" onClick={handleCompletar}>✓ Completar</button>
          {(tarea.origen === 'auto' || isAdmin) && (
            <button className="btn-secondary" onClick={handleDescartar}>✕ Descartar</button>
          )}
          {tarea.origen === 'manual' && isAdmin && (
            <button className="btn-danger" onClick={handleDelete}>Eliminar</button>
          )}
        </div>
      )}
    </div>
  );
}
```

- [ ] **Step 3: Verificar en dev server**

Abrir `/tareas`, click "+ Nueva tarea", crear una, clickear en fila → drawer aparece.
Expected: modal + drawer funcionan, la lista refresca después de completar.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TareaModal.tsx frontend/src/components/TareaDrawer.tsx
git commit -m "feat(tareas): TareaModal y TareaDrawer"
```

---

## Task 19: Frontend — Widget sidebar "Mis pendientes"

**Files:**
- Create: `frontend/src/components/MisPendientesWidget.tsx`
- Modify: `frontend/src/components/Sidebar.tsx`

- [ ] **Step 1: Crear widget**

```tsx
// frontend/src/components/MisPendientesWidget.tsx
import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { misPendientes } from '../api/tareas';
import type { MisPendientes } from '../types/tarea';

export default function MisPendientesWidget() {
  const [data, setData] = useState<MisPendientes | null>(null);

  async function refresh() {
    try {
      const d = await misPendientes();
      setData(d);
    } catch { /* ignore */ }
  }

  useEffect(() => {
    refresh();
    const id = setInterval(refresh, 5 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  if (!data || data.total === 0) return null;

  return (
    <div className="border rounded p-3 m-2 text-sm">
      <div className="font-semibold mb-1">Mis pendientes</div>
      {data.vencidas > 0 && <div>🔴 {data.vencidas} vencidas</div>}
      {data.hoy > 0 && <div>🟡 {data.hoy} hoy</div>}
      {data.futuras > 0 && <div>⚪ {data.futuras} próximas</div>}
      <Link to="/tareas" className="text-blue-600 underline text-xs block mt-1">
        Ver todas →
      </Link>
    </div>
  );
}
```

- [ ] **Step 2: Embedder en `Sidebar.tsx`**

Localizar el componente Sidebar y añadir, debajo del nav principal:

```tsx
import MisPendientesWidget from './MisPendientesWidget';
// ... dentro del return del Sidebar, después del <nav>:
<MisPendientesWidget />
```

- [ ] **Step 3: Verificar en dev server**

Expected: widget aparece en sidebar cuando el user tiene tareas pendientes. Click "Ver todas →" lleva a `/tareas`.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/MisPendientesWidget.tsx frontend/src/components/Sidebar.tsx
git commit -m "feat(tareas): widget 'Mis pendientes' en sidebar"
```

---

## Task 20: Frontend — Sección "Tareas relacionadas" en fichas

**Files:**
- Create: `frontend/src/components/TareasRelacionadas.tsx`
- Modify: `CotizacionDetalle.tsx`, `NotaVentaDetalle.tsx`, `FacturaDetalle.tsx`, y fichas de Cliente/Empresa/Producto si existen

- [ ] **Step 1: Componente reutilizable**

```tsx
// frontend/src/components/TareasRelacionadas.tsx
import { useEffect, useState } from 'react';
import { timelineTareas } from '../api/tareas';
import type { Tarea } from '../types/tarea';
import TareaModal from './TareaModal';

type EntidadTipo = 'cliente' | 'empresa' | 'cotizacion' | 'nota_venta' | 'factura' | 'producto';

interface Props {
  tipo: EntidadTipo;
  id: number;
}

export default function TareasRelacionadas({ tipo, id }: Props) {
  const [tareas, setTareas] = useState<Tarea[]>([]);
  const [expanded, setExpanded] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);

  async function refresh() {
    const data = await timelineTareas(tipo, id);
    setTareas(data);
  }

  useEffect(() => { refresh(); }, [tipo, id]);

  return (
    <section className="border rounded p-4 my-4">
      <div className="flex justify-between items-center">
        <button onClick={() => setExpanded(!expanded)} className="font-semibold">
          {expanded ? '▼' : '▶'} Tareas relacionadas ({tareas.length})
        </button>
        <button className="btn-secondary text-sm" onClick={() => setModalOpen(true)}>
          + Crear tarea
        </button>
      </div>

      {expanded && (
        <ul className="mt-2 space-y-1">
          {tareas.map(t => (
            <li key={t.id} className="text-sm flex justify-between">
              <span>
                {t.estado === 'hecha' && '✓ '}
                {t.estado === 'descartada' && '✕ '}
                {t.titulo}
              </span>
              <span className="text-gray-500">{t.due_date}</span>
            </li>
          ))}
          {tareas.length === 0 && <li className="text-gray-500 text-sm">Sin tareas</li>}
        </ul>
      )}

      {modalOpen && (
        <TareaModal
          vincularA={{ tipo, id }}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); refresh(); }}
        />
      )}
    </section>
  );
}
```

- [ ] **Step 2: Embedder en 3 fichas (mínimo viable)**

En `frontend/src/pages/CotizacionDetalle.tsx`, añadir al final del layout:

```tsx
import TareasRelacionadas from '../components/TareasRelacionadas';
// ... dentro del return:
<TareasRelacionadas tipo="cotizacion" id={cotizacion.id} />
```

Repetir en `NotaVentaDetalle.tsx` (`tipo="nota_venta"`) y `FacturaDetalle.tsx` (`tipo="factura"`).

Si existen `ClienteDetalle.tsx`, `EmpresaDetalle.tsx`, `ProductoDetalle.tsx` — añadir en cada una con el `tipo` correspondiente. Si no existen, saltar (fichas de esas entidades pueden no estar implementadas; no es bloqueante).

- [ ] **Step 3: Verificar en dev server**

Abrir una cotización, scroll hasta la sección. Click "+ Crear tarea" → modal con vínculo fijo. Crear → aparece en la lista.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/components/TareasRelacionadas.tsx frontend/src/pages/CotizacionDetalle.tsx frontend/src/pages/NotaVentaDetalle.tsx frontend/src/pages/FacturaDetalle.tsx
git commit -m "feat(tareas): sección 'Tareas relacionadas' en fichas"
```

---

## Task 21: Frontend — Página config reglas `/admin/tareas/config`

**Files:**
- Create: `frontend/src/pages/TareasConfig.tsx`
- Modify: `frontend/src/App.tsx`

- [ ] **Step 1: Página**

```tsx
// frontend/src/pages/TareasConfig.tsx
import { useEffect, useState } from 'react';
import { listarReglas, patchRegla } from '../api/tareas';
import type { ReglaTarea, AsignadoRol } from '../types/tarea';

const TIPO_LABEL: Record<string, string> = {
  cotizacion_vence: 'Cotización vence',
  factura_vencida: 'Factura vencida',
  aprobacion_pendiente: 'Aprobación pendiente',
  nv_despachada_sin_avanzar: 'NV despachada sin avanzar',
  cliente_sin_actividad: 'Cliente sin actividad',
  stock_bajo_minimo: 'Stock bajo mínimo',
};

const ROL_OPTIONS: AsignadoRol[] = ['vendedor', 'admin', 'owner'];

export default function TareasConfigPage() {
  const [reglas, setReglas] = useState<ReglaTarea[]>([]);
  const [dirty, setDirty] = useState<Record<string, Partial<ReglaTarea>>>({});
  const [saving, setSaving] = useState(false);

  useEffect(() => { listarReglas().then(setReglas); }, []);

  function update(tipo: string, patch: Partial<ReglaTarea>) {
    setDirty(d => ({ ...d, [tipo]: { ...d[tipo], ...patch } }));
  }

  async function handleSave() {
    setSaving(true);
    for (const [tipo, patch] of Object.entries(dirty)) {
      await patchRegla(tipo, patch);
    }
    const fresh = await listarReglas();
    setReglas(fresh);
    setDirty({});
    setSaving(false);
  }

  function getVal<K extends keyof ReglaTarea>(r: ReglaTarea, key: K): ReglaTarea[K] {
    return (dirty[r.tipo]?.[key] as ReglaTarea[K]) ?? r[key];
  }

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-4">Configuración de reglas de tareas</h1>
      <table className="w-full border">
        <thead>
          <tr className="bg-gray-100">
            <th className="p-2 text-left">Regla</th>
            <th className="p-2">Activa</th>
            <th className="p-2">Días offset</th>
            <th className="p-2">Asignar a</th>
          </tr>
        </thead>
        <tbody>
          {reglas.map(r => (
            <tr key={r.tipo} className="border-t">
              <td className="p-2">{TIPO_LABEL[r.tipo] ?? r.tipo}</td>
              <td className="p-2 text-center">
                <input type="checkbox" checked={getVal(r, 'activa')}
                  onChange={e => update(r.tipo, { activa: e.target.checked })} />
              </td>
              <td className="p-2 text-center">
                <input type="number" min={0} max={365} className="w-20 border rounded p-1"
                  value={getVal(r, 'offset_dias')}
                  onChange={e => update(r.tipo, { offset_dias: Number(e.target.value) })} />
              </td>
              <td className="p-2 text-center">
                <select value={getVal(r, 'asignado_rol')}
                  onChange={e => update(r.tipo, { asignado_rol: e.target.value as AsignadoRol })}
                  className="border rounded p-1">
                  {ROL_OPTIONS.map(o => <option key={o} value={o}>{o}</option>)}
                </select>
              </td>
            </tr>
          ))}
        </tbody>
      </table>

      <button className="btn-primary mt-4" disabled={saving || Object.keys(dirty).length === 0}
        onClick={handleSave}>
        {saving ? 'Guardando...' : 'Guardar cambios'}
      </button>
    </div>
  );
}
```

- [ ] **Step 2: Añadir ruta**

```tsx
// App.tsx
import TareasConfigPage from './pages/TareasConfig';
// ...
<Route path="/admin/tareas/config" element={<TareasConfigPage />} />
```

Ajustar si hay guard por rol (ej. wrapper `<AdminOnly>`).

- [ ] **Step 3: Verificar**

Abrir `/admin/tareas/config` como admin. Cambiar valores → "Guardar" → refrescar → valores persistidos.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/pages/TareasConfig.tsx frontend/src/App.tsx
git commit -m "feat(tareas): admin config page /admin/tareas/config"
```

---

## Task 22: Integration test end-to-end

**Files:**
- Create: `backend/tests/test_tareas_integration.py`

- [ ] **Step 1: Test e2e**

```python
# backend/tests/test_tareas_integration.py
from datetime import date, timedelta
from decimal import Decimal
from freezegun import freeze_time


@freeze_time("2026-05-01")
def test_flujo_completo_cotizacion_vence(client, admin_token, vendedor_token, vendedor_user, cliente_demo, db_session):
    from app.models.cotizacion import Cotizacion
    cot = Cotizacion(
        numero=77777, cliente_id=cliente_demo.id, vendedor_id=vendedor_user.id,
        fecha=date(2026, 4, 28), estado="abierta", validez_dias=5,
    )
    db_session.add(cot); db_session.commit()

    # 1. Correr job
    from app.tasks.tareas import ejecutar_generacion
    ejecutar_generacion(db_session)

    # 2. Vendedor ve tarea en /mis-pendientes
    r = client.get("/api/tareas/mis-pendientes",
                   headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r.status_code == 200
    data = r.json()
    assert data["total"] >= 1
    tarea_id = next(t["id"] for t in data["tareas"] if "77777" in t["titulo"])

    # 3. Timeline en cotización muestra la tarea
    r2 = client.get(f"/api/tareas/timeline/cotizacion/{cot.id}",
                    headers={"Authorization": f"Bearer {vendedor_token}"})
    assert any(t["id"] == tarea_id for t in r2.json())

    # 4. Vendedor completa
    r3 = client.post(f"/api/tareas/{tarea_id}/completar",
                     headers={"Authorization": f"Bearer {vendedor_token}"})
    assert r3.status_code == 200
    assert r3.json()["estado"] == "hecha"

    # 5. Correr job de nuevo → nueva tarea si sigue abierta (dedup libera al completar)
    ejecutar_generacion(db_session)
    r4 = client.get("/api/tareas?origen=auto",
                    headers={"Authorization": f"Bearer {admin_token}"})
    pendientes_cot = [t for t in r4.json()["items"]
                      if t["cotizacion_id"] == cot.id and t["estado"] == "pendiente"]
    assert len(pendientes_cot) == 1  # recreada porque la anterior ya no está 'pendiente'

    # 6. Cerrar cotización → job → tarea se descarta
    cot.estado = "cerrada_fv"
    db_session.commit()
    ejecutar_generacion(db_session)
    pendientes = db_session.query(
        __import__('app.models.tarea', fromlist=['Tarea']).Tarea
    ).filter_by(cotizacion_id=cot.id, estado="pendiente").all()
    assert len(pendientes) == 0
```

- [ ] **Step 2: Correr**

Run: `cd backend && pytest tests/test_tareas_integration.py -v`
Expected: PASS.

- [ ] **Step 3: Correr TODA la suite**

Run: `cd backend && pytest --ignore=tests/test_smoke.py -q`
Expected: todos PASS (no romper otros tests).

- [ ] **Step 4: Commit**

```bash
git add backend/tests/test_tareas_integration.py
git commit -m "test(tareas): integración e2e cotizacion_vence"
```

---

## Task 23: Update PROGRESS.md

**Files:**
- Modify: `PROGRESS.md`

- [ ] **Step 1: Añadir entrada en PROGRESS.md**

Añadir después de la última fase marcada en `PROGRESS.md`:

```markdown
- [x] **Tier A #5 — Tareas y Recordatorios**
  - Modelo `Tarea` con 6 FKs nullables (CHECK: máx 1 entidad vinculada) + `ReglaTarea` con seed 6 reglas
  - API CRUD + acciones (completar/descartar/reasignar) + `/mis-pendientes` + `/timeline/{tipo}/{id}`
  - Permisos `tareas:view/view_all/create/admin` con defaults por rol
  - Job Celery horario: 6 reglas auto-generadoras con idempotencia vía `dedup_key` y auto-descarte
  - UI: página `/tareas`, widget sidebar, sección "Tareas relacionadas" en fichas, config admin `/admin/tareas/config`
  - Hook reasignación al desactivar usuario
  - Tests: model, API, auto-gen por regla, integration e2e
```

- [ ] **Step 2: Commit + push**

```bash
git add PROGRESS.md
git commit -m "docs: mark Tier A #5 Tareas y Recordatorios as complete"
git push origin master
```

---

## Self-Review

**Spec coverage:**
- Modelo `Tarea` + `ReglaTarea` → Task 1 ✓
- CHECK constraint máx 1 FK → Task 1 + migración Task 2 ✓
- Índice parcial `dedup_key` → Task 1 + Task 2 ✓
- Prioridad derivada → Task 5 ✓
- Seed 6 reglas → Task 2 ✓
- Permisos `tareas:*` + defaults → Task 3 ✓
- Schemas Pydantic con validación max-1-FK → Task 4 ✓
- POST + GET list + filtros → Task 6 ✓
- GET detail + PATCH (con read-only titulo en auto) + DELETE (solo manual) → Task 7 ✓
- completar/descartar/reasignar → Task 8 ✓
- `/mis-pendientes` → Task 8 ✓
- `/timeline/{tipo}/{id}` → Task 9 ✓
- Config reglas admin → Task 10 ✓
- Resolver asignado_rol → Task 11 ✓
- 6 reglas auto-gen + auto-descarte → Tasks 12, 13, 14 ✓
- Safeguard >500 candidatos → Tasks 12–14 ✓
- Hook reasignar al desactivar → Task 15 ✓
- UI: página /tareas → Task 17 ✓
- Modal + drawer → Task 18 ✓
- Widget sidebar → Task 19 ✓
- Tareas relacionadas en fichas → Task 20 ✓
- Config UI → Task 21 ✓
- Tests model/API/auto/integration → Tasks 1, 6–9, 10, 12–14, 22 ✓
- Migración Alembic → Task 2 ✓
- Celery schedule horario → Task 12 ✓

**Consistencia:**
- `tipo_regla` + `dedup_key` usan mismo formato `{tipo}:{id}` en migración seed, modelo, y tasks. ✓
- `asignado_rol` enum (`vendedor`/`admin`/`owner`) consistente en schema, servicio resolver, config UI. ✓
- Estados `pendiente`/`hecha`/`descartada` consistentes en modelo, API response, UI tabs. ✓

**Gaps identificados y notas:**
- Task 15: El mecanismo exacto de seed de permisos depende de cómo está implementado el catálogo. Si no existe migration-based seed, Task 3 debe adaptarse (nota incluida).
- Task 13: `NotaVenta.fecha_despacho` asumido — verificar nombre exacto al implementar; si no existe, usar `updated_at` como proxy con TODO para columna dedicada.
- Task 20: No todas las fichas de entidades pueden existir; skipear las que no estén sin bloquear el plan.

---

## Execution Handoff

**Plan complete and saved to `docs/superpowers/plans/2026-04-24-tareas-recordatorios.md`.**

Two execution options:

**1. Subagent-Driven (recommended por CLAUDE.md del proyecto)** — dispatch fresh subagent per task, review between tasks, fast iteration.

**2. Inline Execution** — execute tasks in this session using executing-plans, batch execution with checkpoints.

¿Cuál preferís?
