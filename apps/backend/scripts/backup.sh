#!/usr/bin/env bash
# BookScanner — server backup script
# Backs up: PostgreSQL database, SSL certificates
# Storage: Yandex Cloud S3
# Retention: 7 days

set -euo pipefail

# ─── Config ──────────────────────────────────────────────────────────────────

ENV_FILE="$(dirname "$0")/../.env"
if [[ -f "$ENV_FILE" ]]; then
  # shellcheck disable=SC1090
  set -a; source "$ENV_FILE"; set +a
fi

BACKUP_BUCKET="${BACKUP_S3_BUCKET:-}"
AWS_ENDPOINT="${AWS_ENDPOINT:-https://storage.yandexcloud.net}"
TIMESTAMP="$(date -u +%Y%m%dT%H%M%SZ)"
TMP_DIR="$(mktemp -d)"
RETENTION_DAYS=7

# ─── Validation ──────────────────────────────────────────────────────────────

if [[ -z "$BACKUP_BUCKET" ]]; then
  echo "ERROR: BACKUP_S3_BUCKET is not set in .env" >&2
  exit 1
fi

for var in AWS_ACCESS_KEY_ID AWS_SECRET_ACCESS_KEY DB_USER DB_NAME; do
  if [[ -z "${!var:-}" ]]; then
    echo "ERROR: $var is not set" >&2
    exit 1
  fi
done

cleanup() {
  rm -rf "$TMP_DIR"
}
trap cleanup EXIT

s3_upload() {
  local file="$1"
  local key="$2"
  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  aws s3 cp "$file" "s3://${BACKUP_BUCKET}/${key}" \
    --endpoint-url "$AWS_ENDPOINT" \
    --quiet
}

s3_delete_old() {
  local prefix="$1"
  local cutoff
  cutoff="$(date -u -d "${RETENTION_DAYS} days ago" +%Y-%m-%dT%H:%M:%SZ 2>/dev/null \
    || date -u -v-"${RETENTION_DAYS}"d +%Y-%m-%dT%H:%M:%SZ)"  # macOS fallback

  AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
  AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
  aws s3api list-objects-v2 \
    --bucket "$BACKUP_BUCKET" \
    --prefix "$prefix" \
    --endpoint-url "$AWS_ENDPOINT" \
    --query "Contents[?LastModified<='${cutoff}'].Key" \
    --output text \
  | tr '\t' '\n' \
  | grep -v '^None$' \
  | while read -r key; do
      [[ -z "$key" ]] && continue
      AWS_ACCESS_KEY_ID="$AWS_ACCESS_KEY_ID" \
      AWS_SECRET_ACCESS_KEY="$AWS_SECRET_ACCESS_KEY" \
      aws s3api delete-object \
        --bucket "$BACKUP_BUCKET" \
        --key "$key" \
        --endpoint-url "$AWS_ENDPOINT" \
        --quiet && echo "  deleted: $key"
    done
}

# ─── PostgreSQL backup ───────────────────────────────────────────────────────

echo "[1/3] Dumping PostgreSQL..."

DB_DUMP="$TMP_DIR/db_${TIMESTAMP}.sql.gz"

docker exec bookscanner-db \
  pg_dump -U "$DB_USER" "$DB_NAME" \
  | gzip > "$DB_DUMP"

s3_upload "$DB_DUMP" "backups/db/db_${TIMESTAMP}.sql.gz"
echo "  uploaded: backups/db/db_${TIMESTAMP}.sql.gz ($(du -sh "$DB_DUMP" | cut -f1))"

# ─── SSL certificates backup ─────────────────────────────────────────────────

echo "[2/3] Backing up SSL certificates..."

CERT_ARCHIVE="$TMP_DIR/certs_${TIMESTAMP}.tar.gz"

# Copy certbot volume data via temporary container
if docker volume inspect bookscanner_certbot-conf &>/dev/null; then
  docker run --rm \
    -v bookscanner_certbot-conf:/certs:ro \
    -v "$TMP_DIR":/backup \
    alpine \
    tar czf "/backup/certs_${TIMESTAMP}.tar.gz" -C /certs .

  s3_upload "$CERT_ARCHIVE" "backups/certs/certs_${TIMESTAMP}.tar.gz"
  echo "  uploaded: backups/certs/certs_${TIMESTAMP}.tar.gz"
else
  echo "  skipped: certbot volume not found"
fi

# ─── Cleanup old backups ─────────────────────────────────────────────────────

echo "[3/3] Removing backups older than ${RETENTION_DAYS} days..."
s3_delete_old "backups/db/"
s3_delete_old "backups/certs/"

echo ""
echo "Backup completed: $TIMESTAMP"
