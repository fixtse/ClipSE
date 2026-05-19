# ClipSE

[![CI](https://github.com/fixtse/ClipSE/actions/workflows/ci.yml/badge.svg)](https://github.com/fixtse/ClipSE/actions/workflows/ci.yml)
[![Docker Images](https://github.com/fixtse/ClipSE/actions/workflows/docker.yml/badge.svg)](https://github.com/fixtse/ClipSE/actions/workflows/docker.yml)
[![License: AGPL-3.0-only](https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg)](LICENSE)
[![TypeScript](https://img.shields.io/badge/TypeScript-6.x-3178c6.svg)](https://www.typescriptlang.org/)
[![pnpm](https://img.shields.io/badge/pnpm-11.1.2-f69220.svg)](https://pnpm.io/)

Turn long videos into short, reviewable clips with a self-hosted workflow.

ClipSE helps creators and teams find usable short-form moments inside long recordings. Upload a video or add a video URL, let ClipSE transcribe and analyze it, then review suggested clips in a browser before exporting the final cuts.

Everything runs through Docker Compose: the web app, background worker, transcription service, database, and local object storage. You keep control of the app, data, models, and storage while still getting an end-to-end clip production flow.

## License

ClipSE is licensed under AGPL-3.0-only.

## Core Flow

1. Create a local account.
2. Create a channel and video draft.
3. Upload a video file or paste a video URL.
4. Transcribe the video.
5. Ask the AI analyzer to find promising clip moments.
6. Review each suggestion with thumbnails, waveform, and precise in/out points.
7. Render and download the clips you want to keep.

## Stack

- Next.js App Router + TypeScript
- Better Auth local email/password authentication
- tRPC + TanStack Query
- Drizzle ORM + PostgreSQL
- S3-compatible object storage
- FFmpeg and yt-dlp
- Whisper service container
- OpenAI-compatible clip analysis provider
- Tailwind CSS + shadcn/ui + Framer Motion

## Run With Prebuilt Images

The default Docker Compose file uses published GHCR images, so you can run ClipSE without building the app from source.

## Quick Start

Start ClipSE with Docker Compose without cloning the repository:

```bash
mkdir clipse && cd clipse
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/.env.example
cp .env.example .env
docker compose up -d
```

Open `http://localhost:3000`, create a local account, then choose your AI provider and transcription model in the app settings.

To stop ClipSE:

```bash
docker compose down
```

To remove persistent database and object-storage data:

```bash
docker compose down -v
```

## Full Repository Setup

The same prebuilt images work from a local checkout:

```bash
cp .env.example .env
docker compose up -d
```

Open:

```text
http://localhost:3000
```

On first launch, create a local account from the sign-up page. Configure the AI provider, analysis model, and Whisper transcription model in the app settings.

For production, replace `BETTER_AUTH_SECRET` with a strong random value:

```bash
openssl rand -base64 32
```

## Local Image Builds

Maintainers can build the images from source with the build override:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

The published image names are:

- `ghcr.io/fixtse/clipse-app`
- `ghcr.io/fixtse/clipse-worker`
- `ghcr.io/fixtse/clipse-migrate`
- `ghcr.io/fixtse/clipse-whisper`
- `ghcr.io/fixtse/clipse-garage-init`

The Docker workflow publishes `latest` for `main`, branch tags, semver tags, and `sha-*` tags.

## Development

```bash
pnpm install
cp .env.example .env
docker compose -f docker-compose.dev.yml up --build
```

Useful commands:

```bash
pnpm check
pnpm typecheck
pnpm test:unit
pnpm db:generate
pnpm db:migrate
```

Use `pnpm db:generate` after changing the Drizzle schema in `apps/web/src/server/db/schema.ts`.

## Contributing and Security

- Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request.
- Read [SECURITY.md](SECURITY.md) for supported security reporting.
- Read [DOCKER.md](DOCKER.md) for image overrides, logs, startup checks, and troubleshooting.

## Whisper GPU Notes

- The Whisper container is configured for NVIDIA GPU inference by default.
- Default model: `medium`.
- Default device: `cuda` with `float16`.
- The model is loaded only for an active transcription request and released after the request finishes.
- Docker host prerequisites still apply: NVIDIA drivers plus Docker GPU support.
- Hailo-10H is available as an optional Whisper provider through `docker-compose.hailo.yml`.
  Install the host PCIe driver from the ASUS amd64 zip and make HailoRT/PyHailoRT available to the container, then run:

```bash
./scripts/install-hailo-ugen300-driver.sh ~/Downloads/UGen300_M2_5.3.0_driver_Linux_amd64.zip
WHISPER_PROVIDER=hailo docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d
curl http://localhost:8000/health
```

Set `CLIPSE_FOCUS_PROVIDER=hailo-vlm` to use the UGen300 M2 VLM backend for vertical short face/person focus detection before falling back to the existing local detector.

## Architecture

- `apps/web/src/app` - Next.js App Router pages and route handlers
- `apps/web/src/modules/content-videos` - upload drafts, dashboard, analysis settings
- `apps/web/src/modules/content-transcriptions` - transcript persistence
- `apps/web/src/modules/content-clips` - clip suggestions and render state
- `apps/web/src/modules/content-jobs` - background job queue state
- `apps/web/src/server/actions` - mutation-oriented server actions
- `apps/web/src/server/api/routers` - query-oriented tRPC endpoints
- `apps/worker/src/clipse-worker.ts` - transcription, analysis, and render worker
- `services/whisper` - Whisper API container
- `services/postgres/migrations` - Drizzle migrations
- `services/garage` - Garage object storage config and init image
