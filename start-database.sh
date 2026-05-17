#!/usr/bin/env bash
# Use this script to start a docker container for a local development database

# TO RUN ON WINDOWS:
# 1. Install WSL (Windows Subsystem for Linux) - https://learn.microsoft.com/en-us/windows/wsl/install
# 2. Install Docker Desktop or Podman Deskop
# - Docker Desktop for Windows - https://docs.docker.com/docker-for-windows/install/
# - Podman Desktop - https://podman.io/getting-started/installation
# 3. Open WSL - `wsl`
# 4. Run this script - `./start-database.sh`

# On Linux and macOS you can run this script directly - `./start-database.sh`

set -euo pipefail

error() {
  echo "Error: $*" >&2
}

if [ ! -f .env ]; then
  error ".env was not found. Create it first with: cp .env.example .env"
  exit 1
fi

# import env variables from .env
set -a
# shellcheck disable=SC1091
source .env
set +a

if [ -z "${DATABASE_URL:-}" ]; then
  error "DATABASE_URL is missing from .env"
  exit 1
fi

if [[ ! "$DATABASE_URL" =~ ^postgres(ql)?://([^:/@]+)(:([^@]*))?@([^:/?#]+)(:([0-9]+))?/([^?]+) ]]; then
  error "DATABASE_URL must look like postgresql://user:password@host:port/database"
  exit 1
fi

DB_PASSWORD="${BASH_REMATCH[4]:-}"
DB_PORT="${BASH_REMATCH[7]:-5432}"
DB_NAME="${BASH_REMATCH[8]}"
DB_CONTAINER_NAME="$DB_NAME-postgres"

if [ -z "$DB_PASSWORD" ]; then
  error "DATABASE_URL must include a database password"
  exit 1
fi

if [[ ! "$DB_PORT" =~ ^[0-9]+$ ]]; then
  error "DATABASE_URL contains an invalid port: $DB_PORT"
  exit 1
fi

if ! [ -x "$(command -v docker)" ] && ! [ -x "$(command -v podman)" ]; then
  error "Docker or Podman is not installed.
Docker install guide: https://docs.docker.com/engine/install/
Podman install guide: https://podman.io/getting-started/installation"
  exit 1
fi

# determine which docker command to use
if [ -x "$(command -v docker)" ]; then
  DOCKER_CMD="docker"
elif [ -x "$(command -v podman)" ]; then
  DOCKER_CMD="podman"
fi

if ! $DOCKER_CMD info > /dev/null 2>&1; then
  error "$DOCKER_CMD daemon is not running. Start it and try again."
  exit 1
fi

if [ "$($DOCKER_CMD ps -q -f "name=^/${DB_CONTAINER_NAME}$")" ]; then
  echo "Database container '$DB_CONTAINER_NAME' is already running on port $DB_PORT."
  exit 0
fi

if [ "$($DOCKER_CMD ps -q -a -f "name=^/${DB_CONTAINER_NAME}$")" ]; then
  $DOCKER_CMD start "$DB_CONTAINER_NAME" >/dev/null
  echo "Existing database container '$DB_CONTAINER_NAME' started on port $DB_PORT."
  exit 0
fi

if [ "$DB_PORT" -lt 1 ] || [ "$DB_PORT" -gt 65535 ]; then
  error "DATABASE_URL contains an out-of-range port: $DB_PORT"
  exit 1
fi

if command -v nc >/dev/null 2>&1; then
  if nc -z localhost "$DB_PORT" 2>/dev/null; then
    error "Port $DB_PORT is already in use. Update DATABASE_URL in .env or stop the process using that port."
    exit 1
  fi
else
  echo "Warning: Unable to check if port $DB_PORT is already in use (netcat not installed)"
  read -p "Do you want to continue anyway? [y/N]: " -r REPLY
  if ! [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborting."
    exit 1
  fi
fi

if [ "$DB_PASSWORD" = "password" ]; then
  echo "You are using the default database password"
  read -p "Should we generate a random password for you? [y/N]: " -r REPLY
  if ! [[ $REPLY =~ ^[Yy]$ ]]; then
    echo "Please change the default password in the .env file and try again"
    exit 1
  fi
  # Generate a random URL-safe password
  if ! command -v openssl >/dev/null 2>&1; then
    error "openssl is required to generate a random password. Install openssl or change DATABASE_URL manually."
    exit 1
  fi
  DB_PASSWORD=$(openssl rand -base64 12 | tr '+/' '-_')
  if [[ "$(uname)" == "Darwin" ]]; then
    # macOS requires an empty string to be passed with the `i` flag
    sed -i '' "s#:password@#:$DB_PASSWORD@#" .env
  else
    sed -i "s#:password@#:$DB_PASSWORD@#" .env
  fi
fi

if container_id="$($DOCKER_CMD run -d \
  --name "$DB_CONTAINER_NAME" \
  -e POSTGRES_USER="postgres" \
  -e POSTGRES_PASSWORD="$DB_PASSWORD" \
  -e POSTGRES_DB="$DB_NAME" \
  -p "$DB_PORT":5432 \
  docker.io/pgvector/pgvector:pg17)"; then
  echo "Database container '$DB_CONTAINER_NAME' was successfully created on port $DB_PORT."
  echo "Container id: $container_id"
else
  error "Failed to create database container '$DB_CONTAINER_NAME'."
  echo "Try: $DOCKER_CMD logs $DB_CONTAINER_NAME" >&2
  exit 1
fi
