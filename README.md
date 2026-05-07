# ContentClip

Server-side AI clip production for long-form video.

ContentClip lets you upload large source videos to S3-compatible storage, transcribe them with Whisper, score self-contained clip candidates with an OpenAI-compatible model, review and trim segments, and render final exports with FFmpeg.

## License

ContentClip is licensed under AGPL-3.0-only.

## Core Flow

1. Create a local account.
2. Create a channel and video draft.
3. Upload a source asset or add a video URL.
4. Run server-side Whisper transcription.
5. Analyze the transcript for clip candidates.
6. Review thumbnails, waveform, and frame-accurate in/out points.
7. Queue render jobs and download finished clips.

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

The default Docker Compose file uses GHCR images so users do not need to build ContentClip locally.

```bash
cp .env.example .env
docker compose up -d
```

Open:

```text
http://localhost:3000
```

On first launch, create a local account from the sign-up page. Set these values in `.env` before using analysis:

- `OPENAI_API_KEY`
- `OPENAI_BASE_URL`, when using a non-default OpenAI-compatible provider
- `OPENAI_MODEL`

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

- `ghcr.io/fixtse/contentclip-app`
- `ghcr.io/fixtse/contentclip-whisper`
- `ghcr.io/fixtse/contentclip-garage-init`

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

## Whisper GPU Notes

- The Whisper container is configured for NVIDIA GPU inference by default.
- Default model: `medium`.
- Default device: `cuda` with `float16`.
- The model is loaded only for an active transcription request and released after the request finishes.
- Docker host prerequisites still apply: NVIDIA drivers plus Docker GPU support.

## Architecture

- `apps/web/src/app` - Next.js App Router pages and route handlers
- `apps/web/src/modules/content-videos` - upload drafts, dashboard, analysis settings
- `apps/web/src/modules/content-transcriptions` - transcript persistence
- `apps/web/src/modules/content-clips` - clip suggestions and render state
- `apps/web/src/modules/content-jobs` - background job queue state
- `apps/web/src/server/actions` - mutation-oriented server actions
- `apps/web/src/server/api/routers` - query-oriented tRPC endpoints
- `apps/worker/src/contentclip-worker.ts` - transcription, analysis, and render worker
- `services/whisper` - Whisper API container
- `services/postgres/migrations` - Drizzle migrations
- `services/garage` - Garage object storage config and init image
