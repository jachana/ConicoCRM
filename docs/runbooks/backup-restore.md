# Backup & Restore — Postgres (Conico)

> Owner: infra. Last updated: 2026-04-24. Tarea: W1-02.

Este runbook documenta cómo opera el respaldo automático de Postgres en producción y cómo restaurar la base de datos desde un dump local o desde el copy offsite (S3 / B2 / Wasabi).

---

## Cuándo usar

- **Disaster recovery:** la base de producción se corrompió, el VPS murió o el volumen `pgdata` se perdió.
- **Borrado accidental:** alguien hizo `DELETE FROM facturas WHERE 1=1` y necesitas el estado de ayer.
- **Clonar un entorno:** levantar staging con datos reales del último respaldo.
- **Auditoría puntual:** restaurar un dump antiguo en una DB paralela (`conico_audit_2026_03`) sin tocar prod.

---

## Cómo funciona el respaldo

### Servicio `backups` (cron interno)

Definido en `docker-compose.prod.yml`. Usa `prodrigestivill/postgres-backup-local:15` que internamente corre `pg_dump -Fc` en el horario `SCHEDULE` y rota archivos en tres niveles:

```
/backups/
  daily/    conico-YYYYMMDD-HHMMSS.sql.gz   (últimos N días)
  weekly/   conico-YYYYMMDD.sql.gz          (últimas N semanas)
  monthly/  conico-YYYYMM.sql.gz            (últimos N meses)
  last/     conico-latest.sql.gz            (symlink)
```

Retención por defecto: **7 daily, 4 weekly, 6 monthly**. Configurable vía:

```env
BACKUP_SCHEDULE=@daily          # cron expression o @daily/@hourly
BACKUP_KEEP_DAYS=7
BACKUP_KEEP_WEEKS=4
BACKUP_KEEP_MONTHS=6
```

Volume Docker: `pgbackups` (named volume; persistente entre redeploys).

### Servicio `backups-offsite` (copy a S3)

Imagen `rclone/rclone:1.65`. **No corre en bucle** — está pensado para invocarse desde cron de host o manualmente. Si `S3_BUCKET` está vacío, sale 0 sin error (offsite opcional).

Variables relevantes (ver `.env.prod.example`):

```env
S3_BUCKET=conico-prod-backups
S3_PREFIX=hostname-prod
S3_ENDPOINT=https://s3.us-west-002.backblazeb2.com   # B2 ejemplo; vacío para AWS S3 nativo
S3_REGION=us-west-002
S3_PROVIDER=Other      # AWS / Wasabi / Other
S3_KEY=AKIA...
S3_SECRET=...
```

Trigger sugerido (host crontab):

```
15 3 * * *  cd /opt/conico && docker compose -f docker-compose.prod.yml run --rm backups-offsite >> /var/log/conico-offsite.log 2>&1
```

15 minutos después del dump diario (que corre a las 03:00 por defecto).

---

## Pre-requisitos

Para restaurar:

- Acceso SSH al host de producción (o estar parado en `docker-compose.prod.yml`).
- Permiso para correr `docker compose` (grupo `docker`).
- Variables `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_DB` cargadas (mismas que la DB original — están en `.env.prod`).
- Para descargar de S3: credenciales `S3_KEY` / `S3_SECRET` con permiso `s3:GetObject` y `s3:ListBucket`.

> **Nota Windows:** el script `scripts/restore.sh` está pensado para correr en bash dentro del host Linux. Si estás en Windows desarrollando, ejecuta desde WSL o desde el contenedor mismo.

---

## Restore desde respaldo local

Asumiendo que el host tiene el volumen `pgbackups` con dumps recientes.

### 1. Listar respaldos disponibles

```bash
cd /opt/conico   # ruta donde vive docker-compose.prod.yml
./scripts/restore.sh --list
```

Salida esperada:

```
/backups/daily/conico-20260424-030000.sql.gz
/backups/daily/conico-20260423-030000.sql.gz
/backups/weekly/conico-20260420.sql.gz
/backups/monthly/conico-202604.sql.gz
/backups/last/conico-latest.sql.gz
```

### 2. Restaurar (sobreescribiendo `conico`)

```bash
./scripts/restore.sh daily/conico-20260424-030000.sql.gz
```

Pedirá confirmación tipeando el nombre de la DB destino. Para script no-interactivo:

```bash
./scripts/restore.sh daily/conico-20260424-030000.sql.gz --yes
```

### 3. Restaurar a una DB paralela (no toca producción)

```bash
./scripts/restore.sh daily/conico-20260423-030000.sql.gz \
  --target-db conico_audit_2026_04_23 --yes
```

El script crea la DB si no existe, hace `DROP SCHEMA public CASCADE; CREATE SCHEMA public` y aplica el dump. Idempotente.

### 4. Modo dry-run

Para inspeccionar qué pasaría sin tocar nada:

```bash
./scripts/restore.sh daily/conico-20260424-030000.sql.gz --dry-run
```

---

## Restore desde S3 (offsite)

Cuando el VPS murió y `pgbackups` no existe en este host.

### 1. Levantar Postgres y backups vacíos

```bash
docker compose -f docker-compose.prod.yml up -d db backups
```

### 2. Bajar el dump deseado desde S3 al volumen

```bash
docker compose -f docker-compose.prod.yml run --rm \
  --entrypoint /bin/sh backups-offsite -c '
    rclone --config /tmp/rclone.conf copy \
      "remote:${S3_BUCKET}/${S3_PREFIX}/daily/conico-20260424-030000.sql.gz" \
      /backups/daily/
  '
```

Tip: para listar lo que hay en S3 antes:

```bash
docker compose -f docker-compose.prod.yml run --rm \
  --entrypoint /bin/sh backups-offsite -c '
    rclone --config /tmp/rclone.conf ls "remote:${S3_BUCKET}/${S3_PREFIX}" | head -50
  '
```

### 3. Restaurar normalmente

```bash
./scripts/restore.sh daily/conico-20260424-030000.sql.gz --yes
```

### 4. Levantar el backend

```bash
docker compose -f docker-compose.prod.yml up -d backend frontend
```

Backend correrá `alembic upgrade head` automáticamente — si el dump ya tiene el head reciente, no aplicará nada.

---

## Verificación post-restore

Después de restaurar, validar a mano antes de declarar éxito:

```bash
# Conteo de tablas
docker compose -f docker-compose.prod.yml exec db \
  psql -U conico -d conico -c \
  "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"

# Smoke queries: usuarios, cotizaciones, facturas
docker compose -f docker-compose.prod.yml exec db \
  psql -U conico -d conico -c "
    SELECT 'users'         AS tabla, count(*) FROM users
    UNION ALL SELECT 'cotizaciones',  count(*) FROM cotizaciones
    UNION ALL SELECT 'notas_venta',   count(*) FROM notas_venta
    UNION ALL SELECT 'facturas',      count(*) FROM facturas
    UNION ALL SELECT 'productos',     count(*) FROM productos;
  "

# Última factura emitida (sanity check de fecha)
docker compose -f docker-compose.prod.yml exec db \
  psql -U conico -d conico -c \
  "SELECT id, numero, fecha_emision FROM facturas ORDER BY id DESC LIMIT 5;"
```

Cifras esperadas: comparables a las que hay en logs / monitoring del día anterior. Si los conteos están en cero o cualquier consulta lanza "relation does not exist", el restore falló — ver Rollback.

Probar también desde la UI:
- Login con un usuario conocido.
- Listar cotizaciones recientes.
- Abrir una factura emitida y verificar que carga PDF y líneas.

---

## Rollback

Si el restore corrompió la DB activa y aún no destruimos nada más:

1. **Antes de tocar nada,** asegurarse de tener al menos un dump intacto:

   ```bash
   ./scripts/restore.sh --list
   ```

2. Si la DB destino era `conico` (producción) y quedó inconsistente, restaurar otra vez desde un dump anterior:

   ```bash
   ./scripts/restore.sh weekly/conico-20260420.sql.gz --yes
   ```

3. Si todos los dumps locales están dañados o no hay copia local, descargar uno desde S3 (ver "Restore desde S3" arriba) y repetir.

4. Si hasta los dumps S3 están corruptos (improbable salvo ataque): la única opción es la última copia que el usuario tenga fuera del sistema. Documentar el incidente en `docs/dudas-cliente.md` y comunicar al cliente.

> Regla: **nunca borrar el volumen `pgbackups` ni los archivos en S3** mientras un restore esté en curso o haya dudas sobre el resultado. La rotación automática del servicio de backups respeta la retención configurada — no la fuerces a mano.

---

## Smoke test del propio sistema de backups

Tarea recomendada mensual:

1. Forzar un dump fuera de schedule:

   ```bash
   docker compose -f docker-compose.prod.yml exec backups /backup.sh
   ```

2. Confirmar que apareció en `/backups/last/conico-latest.sql.gz`.

3. Restaurar a `conico_smoke`:

   ```bash
   ./scripts/restore.sh last/conico-latest.sql.gz \
     --target-db conico_smoke --yes
   ```

4. Correr la sección "Verificación" sobre `conico_smoke`.

5. Limpiar:

   ```bash
   docker compose -f docker-compose.prod.yml exec db \
     psql -U conico -d postgres -c 'DROP DATABASE conico_smoke;'
   ```

Documentar en bitácora: fecha, tamaño dump, conteos de tablas. Si algo cambió drásticamente entre dos meses, investigar antes de necesitar el restore en serio.

---

## Troubleshooting

| Síntoma | Causa probable | Acción |
|---|---|---|
| `pgbackups volume not declared` | corriendo restore con compose file equivocado | exportar `COMPOSE_FILE=docker-compose.prod.yml` |
| `psql: error: connection to server` | servicio `db` no está arriba | `docker compose ... up -d db`, esperar healthcheck |
| `permission denied for schema public` | restore corrió como user distinto al original | verificar `POSTGRES_USER` en env (debe coincidir con el del dump) |
| `[offsite] S3_BUCKET not set — skipping` | env vars S3 no cargadas | revisar `.env.prod`, confirmar `docker compose config` |
| rclone `403 Forbidden` | credenciales sin permiso `s3:ListBucket` | agregar permiso o usar `--s3-no-check-bucket` (ya activo en sync) |

---

## Referencias

- Imagen backup: <https://github.com/prodrigestivill/docker-postgres-backup-local>
- rclone S3 backend: <https://rclone.org/s3/>
- Postgres docs `pg_restore`: <https://www.postgresql.org/docs/15/app-pgrestore.html>
- Tarea original: `docs/backlog.md` W1-02.
