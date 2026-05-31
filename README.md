<div align="center">
  <img src="apps/web/public/logo.webp" alt="ClipSE logo" width="160" />

  <h1>ClipSE</h1>

  <p>Self-hosted AI clip production for long-form video.</p>

  <p>
    <a href="https://github.com/fixtse/ClipSE/actions/workflows/ci.yml"><img src="https://github.com/fixtse/ClipSE/actions/workflows/ci.yml/badge.svg" alt="CI" /></a>
    <a href="https://github.com/fixtse/ClipSE/actions/workflows/docker.yml"><img src="https://github.com/fixtse/ClipSE/actions/workflows/docker.yml/badge.svg" alt="Docker Images" /></a>
    <a href="LICENSE"><img src="https://img.shields.io/badge/License-AGPL--3.0--only-blue.svg" alt="License: AGPL-3.0-only" /></a>
    <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-6.x-3178c6.svg" alt="TypeScript" /></a>
    <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-11.4.0-f69220.svg" alt="pnpm" /></a>
  </p>
</div>

ClipSE turns long videos into short, reviewable clips. Upload a video or add a video URL, transcribe it, ask an AI model to find promising short-form moments, review the suggestions in the browser, then render and download the clips you want to keep.

The default deployment is Docker Compose and includes the web app, worker, PostgreSQL, local S3-compatible storage, and a Whisper transcription service. You control the app, data, model choices, storage, and runtime.

## Features

- Local account sign-up with Better Auth.
- Video upload and URL intake through yt-dlp.
- Whisper transcription through `faster-whisper` or optional Hailo-10H.
- AI clip analysis through OpenAI, Gemini, OpenRouter, or Codex CLI.
- Browser review flow with transcript context, clip timing, and render controls.
- Vertical-short focus detection with local detectors or optional Hailo-10H vision/VLM backends.
- S3-compatible media storage using Garage by default.
- Published GHCR images plus local build overrides.

## Quick Start

Run ClipSE with published images:

```bash
mkdir clipse
cd clipse
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/docker-compose.yml
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/docker-compose.cpu.yml
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/docker-compose.intel.yml
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/docker-compose.hailo.yml
curl -fsSLO https://raw.githubusercontent.com/fixtse/ClipSE/main/.env.example
mkdir -p services/garage
curl -fsSLo services/garage/garage.toml https://raw.githubusercontent.com/fixtse/ClipSE/main/services/garage/garage.toml
cp .env.example .env
mkdir -p models
docker compose up -d
```

Open `http://localhost:3000`, create a local account, then open the workspace settings to choose your AI provider, analysis model, transcription backend, and transcription model.

Stop the stack:

```bash
docker compose down
```

Remove persistent database and object-storage data:

```bash
docker compose down -v
```

## Repository Setup

From a cloned checkout:

```bash
cp .env.example .env
docker compose up -d
```

For any non-local deployment, replace the default auth secret before starting:

```bash
openssl rand -base64 32
```

Set the generated value as `BETTER_AUTH_SECRET` in `.env`, and set `BETTER_AUTH_BASE_URL` to the public app URL.

## How To Use ClipSE

1. Sign in or create the first local account.
2. Open settings and configure an AI provider.
3. Choose the transcription provider and model.
4. Create a channel.
5. Add a video by uploading a file or pasting a video URL.
6. Start transcription.
7. Run AI analysis to generate clip suggestions.
8. Review the suggested clips and adjust timing as needed.
9. Render clips with the selected aspect and subtitle options.
10. Download the finished clips.

## App Options

### AI Analysis Providers

Configure these inside the app settings after sign-in.

| Provider | Required settings | Notes |
| --- | --- | --- |
| `openai` | OpenAI API key, model | Uses the official OpenAI-compatible API. Optional base URL can point at another OpenAI-compatible service. |
| `gemini` | Gemini API key, model | Loads available Gemini models from Google when an API key is present. |
| `openrouter` | OpenRouter API key, model | Loads models from OpenRouter. |
| `codex` | Codex model | Uses the Codex CLI mounted into the app and worker containers. Run `codex login` on the host first. |

### Transcription Providers

| Provider | Models | Notes |
| --- | --- | --- |
| `faster-whisper` | `medium`, `large-v3-turbo` | Default provider. The default AI Docker service uses CUDA. |
| `hailo` | `whisper-tiny`, `whisper-base`, `whisper-small` | Optional Hailo-10H provider through `docker-compose.hailo.yml`. |

Transcription chunking can be enabled in settings. The chunk length accepts `1` to `120` minutes and defaults to `20` minutes when enabled.

### Render Options

Render controls are selected per clip in the review flow.

| Option | Use |
| --- | --- |
| Aspect mode | Choose the output framing for the rendered clip, including short-form vertical output. |
| Burn subtitles | Render transcript captions into the video. |
| Intro/outro bumper | Add configured bumper media before or after rendered clips when available. |

## Environment Options

Copy `.env.example` to `.env` and change values for your environment. Docker Compose supplies internal service URLs for containers, so most local installs only need `BETTER_AUTH_SECRET`, `BETTER_AUTH_BASE_URL`, and provider credentials configured in the app.

### Core

| Variable | Default | Description |
| --- | --- | --- |
| `DATABASE_URL` | `postgresql://postgres:postgres@localhost:5433/clipse` | PostgreSQL connection string for local tooling. Compose overrides this inside containers. |
| `BETTER_AUTH_SECRET` | local development secret | Cookie/session signing secret. Replace for any shared or public deployment. |
| `BETTER_AUTH_BASE_URL` | `http://localhost:3000` | Browser-facing app URL. |
| `CLIPSE_DISABLE_AUTH` | `false` | Set to `true` to bypass sign-in and allow local anonymous access. Use only in trusted local deployments. |

### Limits

| Variable | Default | Description |
| --- | --- | --- |
| `CLIPSE_MAX_CLIPS_PER_VIDEO` | `8` | Maximum regular clip suggestions per analysis. Valid range: `1` to `20`. |
| `CLIPSE_MAX_SHORTS_PER_VIDEO` | `16` | Maximum short-form candidates per analysis. Valid range: `1` to `40`. |

### Storage

| Variable | Default | Description |
| --- | --- | --- |
| `CLIPSE_S3_ENDPOINT` | `http://localhost:3900` | Internal S3-compatible endpoint. Compose sets this to Garage inside containers. |
| `CLIPSE_S3_PUBLIC_ENDPOINT` | `http://localhost:3900` | Browser-reachable S3-compatible endpoint for signed media URLs. |
| `CLIPSE_S3_REGION` | `garage` | S3 region value. |
| `CLIPSE_S3_BUCKET` | `clipse` | Bucket for uploads, thumbnails, transcripts, and renders. |
| `CLIPSE_S3_ACCESS_KEY_ID` | local Garage key | S3 access key. |
| `CLIPSE_S3_SECRET_ACCESS_KEY` | local Garage secret | S3 secret key. |
| `CLIPSE_S3_FORCE_PATH_STYLE` | `true` | Use path-style S3 URLs. Keep `true` for Garage and MinIO. |

### Whisper

| Variable | Default | Description |
| --- | --- | --- |
| `WHISPER_SERVICE_URL` | `http://localhost:8000` | AI service transcription API URL for local tooling. Compose sets this to `http://ai:8000` inside containers. |
| `WHISPER_PROVIDER` | `faster-whisper` | AI service default transcription provider. Use `hailo` with the Hailo override. |
| `WHISPER_DEVICE` | `cuda` | `faster-whisper` device. Use `cpu` only with a compatible compute type and enough patience. |
| `WHISPER_COMPUTE_TYPE` | `float16` | `faster-whisper` compute type. |
| `WHISPER_CPU_FALLBACK` | `false` | AI container CPU fallback toggle for faster-whisper. |
| `NVIDIA_VISIBLE_DEVICES` | `all` | GPU devices exposed to CUDA containers. |
| `NVIDIA_DRIVER_CAPABILITIES` | `compute,utility,video` | NVIDIA container capabilities. |
| `WHISPER_CACHE_DIR` | `./.clipse-ai-cache` in dev compose | Host cache path for downloaded Whisper models in development. Production Docker stores model files under `./models`. |

### Hailo-10H

| Variable | Default | Description |
| --- | --- | --- |
| `CLIPSE_AI_HAILO_IMAGE` | `ghcr.io/fixtse/clipse-ai-hailo:latest` | Hailo AI image. Override this for a private/local Hailo image. |
| `HAILO_DEVICE` | `/dev/h1x-0` | Hailo accelerator device passed into the container. |
| `HAILO_WHISPER_MODEL` | `whisper-base` | Hailo transcription model. |
| `HAILO_WHISPER_HEF_PATH` | empty | Optional explicit Whisper HEF path. Usually not needed when the matching `.hef` is under `./models`. |
| `HAILO_WHISPER_TIMEOUT_MS` | `60000` | Hailo Whisper generation timeout in milliseconds. Increase for long audio. |
| `HAILO_VLM_MODEL` | `qwen2-vl-2b` | Hailo VLM focus-detection model. Supported aliases include `qwen2-vl-2b`, `qwen2.5-vl-3b`, and `qwen3-vl-2b-instruct`. |
| `HAILO_VLM_HEF_PATH` | empty | Optional explicit VLM HEF path. Usually not needed when the matching `.hef` is under `./models`. |
| `HAILO_VLM_FOCUS_SAMPLE_INTERVAL_SECONDS` | `1.0` | Frame sampling interval for Hailo VLM focus detection. |
| `HAILO_VLM_FOCUS_MAX_SAMPLES` | `8` | Maximum sampled frames per focus-detection request. |
| `HAILO_VLM_OPTIMIZE_MEMORY_ON_DEVICE` | `true` | Hailo VLM memory optimization toggle. |
| `HAILO_VISION_MODEL` | `yolov8n` | Hailo YOLO-family model for mode-aware shorts focus detection. |
| `HAILO_VISION_HEF_PATH` | empty | Optional explicit Hailo vision HEF path. Usually not needed when the matching `.hef` is under `./models`. |
| `HAILO_SCREEN_OCR_HEF_PATH` | empty | Optional OCR/text-detection HEF path for screen-heavy shorts. Usually not needed when the matching `.hef` is under `./models`. |
| `HAILO_OBJECT_LABELS` | empty | Optional comma-separated COCO class ids or names for general object focus mode. Examples: `67,73` or `cell phone,book`. |
| `HAILO_VISION_SAMPLE_INTERVAL_SECONDS` | `0.35` | Frame sampling interval for Hailo vision focus detection. |
| `HAILO_VISION_MAX_SAMPLES` | `0` | Maximum sampled frames per Hailo vision request. Use `0` to sample until the clip end. |
| `HAILO_VISION_COMMAND` | runner command | Override for the Hailo vision helper command. |
| `HAILO_VISION_FRAME_COMMAND` | empty | Optional per-frame command returning JSON detections when using a custom Hailo detector wrapper. |
| `HAILO_FOCUS_DEBUG` | `WHISPER_DEBUG` value in Docker | Enables Hailo focus command logs in the AI service. |
| `CLIPSE_FOCUS_DEBUG` | `WHISPER_DEBUG` value in Docker | Enables web/worker logs showing Hailo focus use and local detector fallback. |
| `HAILO_COMMAND_TIMEOUT_SECONDS` | `900` | Timeout for Hailo helper commands. |
| `HAILO_APPS_REF` | `main` | Hailo Apps git ref used when building the Hailo image. |
| `HAILORT_WHEEL_DIR` | `./services/whisper/hailo-packages` | Local Hailo image build option: directory containing one `hailort-*.whl` or `pyhailort-*.whl`. If the directory also contains `hailort_*.deb`, it is installed into the local image for `libhailort`. |
| `HAILO_HOST_LIB_DIR` | `/usr/lib/hailo` | Host HailoRT library mount path. |
| `HAILO_HOST_BIN_DIR` | `/usr/bin` | Host binary mount path for `hailortcli`. |

### Focus Detection

| Variable | Default | Description |
| --- | --- | --- |
| `CLIPSE_FOCUS_PROVIDER` | `auto` | `auto`, `local`, `hailo-vlm`, or `hailo-vision`. |
| `CLIPSE_HAILO_SERVICE_URL` | `http://localhost:8000` | Hailo focus API URL. Compose sets this to `http://ai:8000` inside containers. |
| `CLIPSE_YOLO_MODEL` | `yolo11n.pt` | Local person/face focus model used by the worker. |
| `CLIPSE_LOCAL_DETECTOR_DEVICE` | `auto` | Local YOLO/RT-DETR device preference. Use `intel:gpu` for OpenVINO on Intel GPU, `cuda` for PyTorch CUDA, or `cpu`. The Intel compose override sets `intel:gpu`. |

Focus provider modes:

| Provider | Use case |
| --- | --- |
| `auto` | Default local detector flow with automatic local fallbacks. |
| `local` | Force local YOLO/RT-DETR/OpenCV detection. |
| `hailo-vision` | Recommended Hailo Docker mode for people, product, screen, and object focus detection. |
| `hailo-vlm` | Legacy Hailo VLM prompt path for face/person focus detection. |

### Video URL Intake

| Variable | Default | Description |
| --- | --- | --- |
| `CLIPSE_YTDLP_COOKIES_FILE` | empty | Optional cookies file path for yt-dlp when a source requires browser cookies. Mount the file into the worker container. |
| `CLIPSE_YTDLP_USER_AGENT` | empty | Optional yt-dlp user agent override. |

### Codex Provider

| Variable | Default | Description |
| --- | --- | --- |
| `HOST_CODEX_HOME` | `${HOME}/.codex` | Host Codex config directory mounted into containers. |
| `CLIPSE_CODEX_COMMAND` | `codex` | Command used by the app and worker. |
| `CLIPSE_CODEX_HOME` | `/root/.codex` | Container Codex config directory. |
| `CLIPSE_CODEX_CWD` | `/app` | Working directory for Codex CLI calls. |
| `CLIPSE_CODEX_TIMEOUT_MS` | `300000` | Codex request timeout in milliseconds. |

Authenticate on the host before selecting the Codex provider:

```bash
codex login
```

For Windows PowerShell:

```bash
HOST_CODEX_HOME="C:/Users/<you>/.codex"
```

For WSL:

```bash
HOST_CODEX_HOME="/mnt/c/Users/<you>/.codex"
```

### Image Overrides

| Variable | Default |
| --- | --- |
| `CLIPSE_APP_IMAGE` | `ghcr.io/fixtse/clipse-app:latest` |
| `CLIPSE_WORKER_IMAGE` | `ghcr.io/fixtse/clipse-worker:latest` |
| `CLIPSE_MIGRATE_IMAGE` | `ghcr.io/fixtse/clipse-migrate:latest` |
| `CLIPSE_AI_IMAGE` | `ghcr.io/fixtse/clipse-ai:latest` |
| `CLIPSE_AI_HAILO_IMAGE` | `ghcr.io/fixtse/clipse-ai-hailo:latest` |
| `CLIPSE_GARAGE_INIT_IMAGE` | `ghcr.io/fixtse/clipse-garage-init:latest` |

The legacy `CLIPSE_WHISPER_IMAGE` and `CLIPSE_WHISPER_HAILO_IMAGE` variables are still accepted as fallbacks, but new deployments should use the `CLIPSE_AI_*` names.

## Docker Options

Run with published images:

```bash
mkdir -p models
docker compose up -d
```

The default stack expects an NVIDIA GPU for CUDA Whisper and local focus detection. Verify the host runtime with:

```bash
docker run --rm --gpus all nvidia/cuda:12.6.0-base-ubuntu24.04 nvidia-smi
```

Run without an NVIDIA GPU:

```bash
mkdir -p models
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

Run with Intel GPU ffmpeg acceleration and CPU Whisper:

```bash
sudo apt install -y vainfo intel-media-va-driver libva-drm2 libva2
ls -l /dev/dri/renderD128
mkdir -p models
docker compose -f docker-compose.yml -f docker-compose.intel.yml up -d
```

This Intel example targets Ubuntu 26.06. The host needs VAAPI/QSV userspace packages (`vainfo`, `intel-media-va-driver`, `libva-drm2`, and `libva2`) installed so the Intel media driver (`iHD`) is available. The compose override passes `/dev/dri/renderD128` into the app and worker containers for Intel QSV encoding and requests OpenVINO Intel GPU inference for local YOLO/RT-DETR focus detection. The host must expose that render device, and the Docker user must be able to access it. If your host uses different device group IDs, set `CLIPSE_RENDER_GID="$(getent group render | cut -d: -f3)"` and `CLIPSE_VIDEO_GID="$(getent group video | cut -d: -f3)"` before starting Compose.

Check Intel driver access inside the worker with:

```bash
docker compose -f docker-compose.yml -f docker-compose.intel.yml exec worker sh -lc \
  'vainfo --display drm --device /dev/dri/renderD128 && ffmpeg -hide_banner -v error -init_hw_device qsv=hw:/dev/dri/renderD128 -f lavfi -i nullsrc=s=16x16:d=0.1 -frames:v 1 -f null -'
```

Run with Intel GPU ffmpeg acceleration and Hailo-10H Whisper/focus:

```bash
sudo apt install -y vainfo intel-media-va-driver libva-drm2 libva2
ls -l /dev/dri/renderD128
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.intel.yml -f docker-compose.hailo.yml up -d
```

Use this setup on Intel hosts where `/dev/dri/renderD128` handles ffmpeg QSV rendering and local OpenVINO YOLO/RT-DETR fallback, while `/dev/h1x-0` handles Hailo transcription or focus detection. Keep `docker-compose.hailo.yml` last so its Whisper provider settings override the CPU Whisper defaults from the Intel file.

Build app images locally:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

Model files live under `./models`, which is mounted into the AI and worker containers as `/models`:

```bash
mkdir -p models/whisper models/yolo models/hailo
# faster-whisper downloads/cache: ./models/whisper
# local YOLO/RT-DETR files: ./models/yolo/yolo11n.pt or ./models/yolo/rtdetr-l.pt
# Hailo HEFs: ./models/hailo/whisper-base.hef, ./models/hailo/yolov8n.hef, etc.
```

The default Hailo compose override pulls `ghcr.io/fixtse/clipse-ai-hailo:latest`, which targets HailoRT 5.3. The host PCIe driver must be the same HailoRT version as the runtime in the image. If you need a newer HailoRT release, build a local Hailo image with matching `hailort_*.deb` and `hailort-*.whl` packages, then install the matching PCIe driver on the host. Put licensed HEFs under `./models/hailo`.

Optional: build the Hailo image locally with a wheel directory outside the repo:

```bash
# Install the host PCIe driver package that matches the HailoRT version in your image.
./scripts/install-hailo-ugen300-driver.sh ~/Downloads/UGen300_M2_5.3.0_driver_Linux_amd64.zip
sudo reboot
ls -l /dev/h1x-*
hailortcli scan
mkdir -p models/hailo
# Put licensed .hef files in ./models/hailo.
CLIPSE_AI_HAILO_IMAGE=clipse-ai-hailo:local \
HAILORT_WHEEL_DIR="$HOME/Downloads/hailort" \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml -f docker-compose.hailo-build.yml build ai
```

When running that local image, keep `CLIPSE_AI_HAILO_IMAGE=clipse-ai-hailo:local` in the environment for the `up` command.

Run Hailo-10H without an NVIDIA GPU:

```bash
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
docker compose -f docker-compose.yml -f docker-compose.cpu.yml -f docker-compose.hailo.yml up -d
curl http://localhost:8000/health
```

Run Hailo-10H with Intel GPU ffmpeg acceleration:

```bash
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.intel.yml -f docker-compose.hailo.yml up -d
curl http://localhost:8000/health
```

Run Hailo-10H on a host that also has an NVIDIA GPU:

```bash
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d
```

Hailo HEFs are auto-discovered under `./models` by filename, so `HAILO_WHISPER_MODEL=whisper-base` can use a file such as `./models/hailo/whisper-base.hef` without setting `HAILO_WHISPER_HEF_PATH`. See [DOCKER.md](DOCKER.md#hailo-10h-whisper-provider) for advanced Hailo licensing, private image builds, WSL notes, and custom HEF path overrides.

Check logs:

```bash
docker compose ps
docker compose logs -f app
docker compose logs -f worker
docker compose logs -f ai
```

See [DOCKER.md](DOCKER.md) for startup checks, troubleshooting, Hailo licensing notes, Garage reset steps, and private Hailo image builds.

## Development

Use pnpm for local commands:

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

Generate migrations after changing the Drizzle schema:

```bash
pnpm db:generate
```

## Architecture

- `apps/web/src/app` - Next.js App Router pages and route handlers.
- `apps/web/src/components/clipse` - workspace UI.
- `apps/web/src/modules/content-videos` - upload drafts, dashboard, and video state.
- `apps/web/src/modules/content-transcriptions` - transcript persistence.
- `apps/web/src/modules/content-clips` - clip suggestions and render state.
- `apps/web/src/modules/content-jobs` - background job queue state.
- `apps/web/src/modules/content-settings` - AI and transcription settings.
- `apps/web/src/server/actions` - mutation-oriented server actions.
- `apps/web/src/server/api/routers` - query-oriented tRPC endpoints.
- `apps/worker/src/clipse-worker.ts` - transcription, analysis, and render worker.
- `services/whisper` - AI API container source for faster-whisper transcription and Hailo helpers.
- `services/postgres/migrations` - Drizzle migrations.
- `services/garage` - Garage object storage config and init image.

## Tech Stack

- Next.js App Router, React, and TypeScript.
- Better Auth local email/password authentication.
- tRPC and TanStack Query.
- Drizzle ORM and PostgreSQL.
- S3-compatible object storage.
- FFmpeg and yt-dlp.
- Whisper, faster-whisper, optional Hailo-10H.
- OpenAI-compatible AI SDK providers, Gemini, OpenRouter, and Codex CLI.
- Tailwind CSS, shadcn/ui, and Framer Motion.

## Contributing

Read [CONTRIBUTING.md](CONTRIBUTING.md) before opening a pull request. Keep changes focused, update tests for behavior changes, and run the local checks before submitting.

Security issues should be reported privately. See [SECURITY.md](SECURITY.md).

## License

ClipSE is licensed under [AGPL-3.0-only](LICENSE).
