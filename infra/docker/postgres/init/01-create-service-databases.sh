#!/usr/bin/env bash
# Database per service: each service gets its own login role and its own database,
# and no other role may connect to it. Runs once, on the first start of an empty volume.
set -euo pipefail

create_service_database() {
  local name="$1"
  local password="$2"

  # Quoted heredoc: the shell doesn't expand anything; psql fills :"name" (identifier)
  # and :'password' (literal) with proper quoting.
  psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname postgres \
    --set=name="$name" --set=password="$password" <<'SQL'
CREATE ROLE :"name" LOGIN PASSWORD :'password';
CREATE DATABASE :"name" OWNER :"name";
REVOKE ALL ON DATABASE :"name" FROM PUBLIC;
SQL
}

create_service_database asset "$ASSET_DB_PASSWORD"
create_service_database worker "$WORKER_DB_PASSWORD"
create_service_database ml "$ML_DB_PASSWORD"

# Extensions need superuser rights, so they are created here rather than by the service's migrations.
psql -v ON_ERROR_STOP=1 --username "$POSTGRES_USER" --dbname ml \
  -c 'CREATE EXTENSION IF NOT EXISTS vector;'
