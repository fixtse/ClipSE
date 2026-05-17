# Docker Guide

## Run ClipSE

The default compose file pulls prebuilt images from GitHub Container Registry.

```bash
cp .env.example .env
docker compose up -d
```

The app runs at `http://localhost:3000`.

## Services

- `app` - Next.js web app
- `worker` - background transcription, analysis, and rendering worker
- `whisper` - Whisper API service
- `postgres` - PostgreSQL with pgvector
- `garage` - S3-compatible object storage
- `garage-init` - local Garage bucket/key initialization

## Images

- `ghcr.io/fixtse/clipse-app`
- `ghcr.io/fixtse/clipse-worker`
- `ghcr.io/fixtse/clipse-migrate`
- `ghcr.io/fixtse/clipse-whisper`
- `ghcr.io/fixtse/clipse-garage-init`

Override images with:

```bash
CLIPSE_APP_IMAGE=ghcr.io/example/clipse-app:sha-...
CLIPSE_WORKER_IMAGE=ghcr.io/example/clipse-worker:sha-...
CLIPSE_MIGRATE_IMAGE=ghcr.io/example/clipse-migrate:sha-...
CLIPSE_WHISPER_IMAGE=ghcr.io/example/clipse-whisper:sha-...
CLIPSE_GARAGE_INIT_IMAGE=ghcr.io/example/clipse-garage-init:sha-...
docker compose up -d
```

## Build Locally

Use the build override when testing Dockerfile changes:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

## Logs

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f whisper
```

## Startup Checks

Compose starts the app and worker only after:

- PostgreSQL passes `pg_isready`
- database migrations finish successfully
- Garage bucket/key initialization exits successfully
- Whisper answers `GET /health`

If `app` or `worker` is missing from `docker compose ps`, inspect the dependency that did not finish:

```bash
docker compose ps -a
docker compose logs db-migrate
docker compose logs garage-init
docker compose logs whisper
```

## Troubleshooting

### Whisper is unhealthy or does not start

The default Whisper service requires NVIDIA Docker support. Check the service logs and GPU runtime:

```bash
docker compose logs whisper
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi
```

Typical causes are missing NVIDIA drivers, missing NVIDIA Container Toolkit, or running Docker from an environment without GPU access.

### Garage initialization fails

`garage-init` now logs each setup step. Inspect its output:

```bash
docker compose logs garage-init
```

If the volume contains a broken local layout, reset only Garage data:

```bash
docker compose down
docker volume rm clipse_garage_data
docker compose up -d
```

### Migrations fail

The app and worker wait for `db-migrate` to complete. Check migration logs first:

```bash
docker compose logs db-migrate
```

When schema changes are intentional, generate migration files before rebuilding images:

```bash
PATH="/home/fixt/.nvm/versions/node/v24.13.1/bin:$PATH" pnpm db:generate
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

### Port conflicts

The default published ports are:

- `3000` for the web app
- `8000` for Whisper
- `3900` and `3903` for Garage

If one is already in use, stop the conflicting process or change the port mapping in `docker-compose.yml`.

## Stop

```bash
docker compose down
```

Remove persistent database and object-storage data:

```bash
docker compose down -v
```

## Environment

Copy `.env.example` to `.env` and set:

- `BETTER_AUTH_SECRET` for local authentication cookies
- `BETTER_AUTH_BASE_URL`, usually `http://localhost:3000` for local Docker

Configure the AI provider, analysis model, and Whisper transcription model in the app settings after sign-in.

The compose file supplies internal container URLs for PostgreSQL, Garage, and Whisper.

## Codex CLI Provider

To use the Codex provider, authenticate Codex on the host first:

```bash
codex login
```

Docker mounts `${HOST_CODEX_HOME:-${HOME}/.codex}` into the app and worker containers at `/root/.codex`, and the images include the Codex CLI. If your Codex home is elsewhere, set `HOST_CODEX_HOME` in `.env`.

When running Compose from Windows PowerShell, use the Windows path:

```bash
HOST_CODEX_HOME="C:/Users/<you>/.codex"
```

When running Compose from a real WSL distro, use the WSL path to your Windows Codex home:

```bash
HOST_CODEX_HOME="/mnt/c/Users/<you>/.codex"
```

## GPU Notes

The default Whisper service uses NVIDIA CUDA:

- `WHISPER_DEVICE=cuda`
- `WHISPER_COMPUTE_TYPE=float16`
- `NVIDIA_VISIBLE_DEVICES=all`

Install NVIDIA drivers and Docker GPU support on the host before running GPU Whisper.
