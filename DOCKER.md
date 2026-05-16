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
- `ghcr.io/fixtse/clipse-whisper`
- `ghcr.io/fixtse/clipse-garage-init`

Override images with:

```bash
CLIPSE_APP_IMAGE=ghcr.io/example/clipse-app:sha-...
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

## GPU Notes

The default Whisper service uses NVIDIA CUDA:

- `WHISPER_DEVICE=cuda`
- `WHISPER_COMPUTE_TYPE=float16`
- `NVIDIA_VISIBLE_DEVICES=all`

Install NVIDIA drivers and Docker GPU support on the host before running GPU Whisper.
