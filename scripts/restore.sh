#!/usr/bin/env bash
# ---------------------------------------------------------------------------
# Conico — Postgres restore helper (W1-02)
#
# Restores a pg_dump (custom-format .sql.gz produced by
# prodrigestivill/postgres-backup-local) into a target database.
#
# Usage:
#   scripts/restore.sh --list
#   scripts/restore.sh <backup-filename> [--target-db NAME] [--yes] [--dry-run]
#
# Examples:
#   scripts/restore.sh --list
#   scripts/restore.sh daily/conico-20260423.sql.gz
#   scripts/restore.sh daily/conico-20260423.sql.gz --target-db conico_restore --yes
#
# Notes:
#   - Reads backups from the `pgbackups` Docker volume by default. Override
#     BACKUP_DIR to point at a host-mounted path (e.g. after rclone download).
#   - DROPS and RECREATES the target schema. Will not run without --yes
#     unless interactive confirmation is given.
#   - Idempotent: safe to re-run on a target DB; the recreate step wipes
#     prior state.
# ---------------------------------------------------------------------------
set -euo pipefail

# Defaults — override via env or flags.
COMPOSE_FILE="${COMPOSE_FILE:-docker-compose.prod.yml}"
DB_SERVICE="${DB_SERVICE:-db}"
BACKUPS_SERVICE="${BACKUPS_SERVICE:-backups}"
POSTGRES_USER="${POSTGRES_USER:-conico}"
POSTGRES_DB="${POSTGRES_DB:-conico}"
TARGET_DB=""
BACKUP_FILE=""
ASSUME_YES="0"
DRY_RUN="0"
LIST_ONLY="0"

usage() {
  sed -n '2,25p' "$0"
  exit "${1:-0}"
}

log()  { printf '\033[1;34m[restore]\033[0m %s\n' "$*" >&2; }
warn() { printf '\033[1;33m[restore]\033[0m %s\n' "$*" >&2; }
die()  { printf '\033[1;31m[restore]\033[0m %s\n' "$*" >&2; exit 1; }

# ---- arg parsing ----
while [ "$#" -gt 0 ]; do
  case "$1" in
    --list)        LIST_ONLY="1"; shift ;;
    --target-db)   TARGET_DB="$2"; shift 2 ;;
    --yes|-y)      ASSUME_YES="1"; shift ;;
    --dry-run)     DRY_RUN="1"; shift ;;
    -h|--help)     usage 0 ;;
    --*)           die "Unknown flag: $1" ;;
    *)             [ -z "$BACKUP_FILE" ] && BACKUP_FILE="$1" || die "Extra arg: $1"; shift ;;
  esac
done

TARGET_DB="${TARGET_DB:-$POSTGRES_DB}"

# ---- locate compose file ----
if [ ! -f "$COMPOSE_FILE" ]; then
  die "Compose file not found: $COMPOSE_FILE (set COMPOSE_FILE to override)"
fi

compose() { docker compose -f "$COMPOSE_FILE" "$@"; }

# ---- list mode ----
list_backups() {
  log "Listing backups inside $BACKUPS_SERVICE volume:"
  compose run --rm --no-deps -T "$BACKUPS_SERVICE" \
    sh -c 'find /backups -maxdepth 3 -type f \( -name "*.sql.gz" -o -name "*.dump" \) | sort'
}

if [ "$LIST_ONLY" = "1" ]; then
  list_backups
  exit 0
fi

[ -n "$BACKUP_FILE" ] || { warn "No backup filename given."; usage 1; }

# Allow either /backups/foo.sql.gz or relative foo.sql.gz; normalize.
case "$BACKUP_FILE" in
  /backups/*) IN_CONTAINER_PATH="$BACKUP_FILE" ;;
  /*)         IN_CONTAINER_PATH="$BACKUP_FILE" ;;
  *)          IN_CONTAINER_PATH="/backups/$BACKUP_FILE" ;;
esac

log "Compose file:    $COMPOSE_FILE"
log "DB service:      $DB_SERVICE"
log "Target DB:       $TARGET_DB"
log "Backup path:     $IN_CONTAINER_PATH"
log "Dry-run:         $DRY_RUN"

# ---- verify backup exists ----
if ! compose run --rm --no-deps -T "$BACKUPS_SERVICE" \
    sh -c "test -f '$IN_CONTAINER_PATH'"; then
  die "Backup file not found in volume: $IN_CONTAINER_PATH (try --list)"
fi

# ---- confirmation ----
if [ "$ASSUME_YES" != "1" ] && [ "$DRY_RUN" != "1" ]; then
  cat <<EOF >&2

  WARNING: this will DROP and RECREATE schema in database '$TARGET_DB'.
  All current data in '$TARGET_DB' will be lost.

EOF
  printf "Type the target DB name to confirm (%s): " "$TARGET_DB" >&2
  read -r CONFIRM
  [ "$CONFIRM" = "$TARGET_DB" ] || die "Confirmation mismatch — aborting."
fi

# ---- ensure target DB exists (create if missing, separate from POSTGRES_DB) ----
ensure_db() {
  log "Ensuring database '$TARGET_DB' exists..."
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) skip CREATE DATABASE check"
    return
  fi
  compose exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d postgres -tAc \
      "SELECT 1 FROM pg_database WHERE datname='$TARGET_DB'" \
    | grep -q 1 \
    || compose exec -T "$DB_SERVICE" \
        psql -U "$POSTGRES_USER" -d postgres -c \
          "CREATE DATABASE \"$TARGET_DB\" OWNER \"$POSTGRES_USER\";"
}

# ---- drop + recreate public schema ----
reset_schema() {
  log "Dropping & recreating schema 'public' in '$TARGET_DB'..."
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) skip DROP SCHEMA"
    return
  fi
  compose exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -c \
      "DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public AUTHORIZATION \"$POSTGRES_USER\"; GRANT ALL ON SCHEMA public TO public;"
}

# ---- restore ----
do_restore() {
  log "Restoring from $IN_CONTAINER_PATH ..."
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) skip pg_restore/psql"
    return
  fi
  # Pipe gzip-compressed SQL from the backups volume into psql in the db
  # container. We resolve the volume name from compose to avoid hard-coding.
  VOL_NAME="$(compose config --volumes | grep -E '^pgbackups$' || true)"
  [ -n "$VOL_NAME" ] || die "pgbackups volume not declared in $COMPOSE_FILE"

  # We use a one-shot helper container that mounts pgbackups read-only and
  # streams the dump to the db service via docker exec.
  compose run --rm --no-deps -T "$BACKUPS_SERVICE" \
      sh -c "gunzip -c '$IN_CONTAINER_PATH'" \
    | compose exec -T "$DB_SERVICE" \
        psql -U "$POSTGRES_USER" -d "$TARGET_DB" -v ON_ERROR_STOP=1 -q
}

# ---- smoke check ----
smoke() {
  log "Smoke check: counting tables and rows in 'public'..."
  if [ "$DRY_RUN" = "1" ]; then
    log "(dry-run) skip smoke"
    return
  fi
  compose exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$TARGET_DB" -c \
      "SELECT count(*) AS tablas FROM information_schema.tables WHERE table_schema='public';"
  compose exec -T "$DB_SERVICE" \
    psql -U "$POSTGRES_USER" -d "$TARGET_DB" -c \
      "SELECT 'usuarios' AS t, count(*) FROM information_schema.tables WHERE table_schema='public' AND table_name='users';"
}

ensure_db
reset_schema
do_restore
smoke

log "Restore complete: $IN_CONTAINER_PATH -> $TARGET_DB"
