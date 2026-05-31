# Docker Guide

## Run ClipSE

The default compose file pulls prebuilt images from GitHub Container Registry.

```bash
cp .env.example .env
mkdir -p models
docker compose up -d
```

The app runs at `http://localhost:3000`.

The default stack expects an NVIDIA GPU. On a machine without NVIDIA Docker support, use the CPU override:

```bash
cp .env.example .env
mkdir -p models
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

On a machine with an Intel GPU, use the Intel override for ffmpeg QSV acceleration:

```bash
cp .env.example .env
sudo apt install -y vainfo intel-media-va-driver libva-drm2 libva2
mkdir -p models
ls -l /dev/dri/renderD128
docker compose -f docker-compose.yml -f docker-compose.intel.yml up -d
```

This Intel example targets Ubuntu 26.06. The host needs those VAAPI/QSV userspace packages so the Intel media driver (`iHD`) is available to containers using `/dev/dri/renderD128`.

For Intel QSV rendering plus Hailo-10H transcription or focus detection, run with the Intel override before the Hailo override:

```bash
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.intel.yml -f docker-compose.hailo.yml up -d
```

## Services

- `app` - Next.js web app
- `worker` - background transcription, analysis, and rendering worker
- `whisper` - Whisper API service
- `postgres` - PostgreSQL
- `garage` - S3-compatible object storage
- `garage-init` - local Garage bucket/key initialization

## Images

- `ghcr.io/fixtse/clipse-app`
- `ghcr.io/fixtse/clipse-worker`
- `ghcr.io/fixtse/clipse-migrate`
- `ghcr.io/fixtse/clipse-whisper`
- `ghcr.io/fixtse/clipse-whisper-hailo`
- `ghcr.io/fixtse/clipse-garage-init`

Override images with:

```bash
CLIPSE_APP_IMAGE=ghcr.io/example/clipse-app:sha-...
CLIPSE_WORKER_IMAGE=ghcr.io/example/clipse-worker:sha-...
CLIPSE_MIGRATE_IMAGE=ghcr.io/example/clipse-migrate:sha-...
CLIPSE_WHISPER_IMAGE=ghcr.io/example/clipse-whisper:sha-...
CLIPSE_WHISPER_HAILO_IMAGE=ghcr.io/example/clipse-whisper-hailo:sha-...
CLIPSE_GARAGE_INIT_IMAGE=ghcr.io/example/clipse-garage-init:sha-...
docker compose up -d
```

## Build Locally

Use the build override when testing Dockerfile changes:

```bash
docker compose -f docker-compose.yml -f docker-compose.build.yml up --build
```

## Model Files

Docker mounts `./models` into the Whisper and worker containers as `/models`.

Use this layout:

```bash
mkdir -p models/whisper models/yolo models/hailo
```

| Host path | Container path | Used for |
| --- | --- | --- |
| `./models/whisper` | `/models/whisper` | Faster Whisper downloads/cache. |
| `./models/yolo` | `/models/yolo` | Local YOLO/RT-DETR files such as `yolo11n.pt` or `rtdetr-l.pt`. |
| `./models/hailo` | `/models/hailo` | Hailo `.hef` files for Whisper, YOLO-family vision, OCR, or VLM models. |

For local focus detection, either keep the default `CLIPSE_YOLO_MODEL=yolo11n.pt` and place the file at `./models/yolo/yolo11n.pt`, or set `CLIPSE_YOLO_MODEL` to another filename under `./models/yolo`.

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

If the host has no NVIDIA GPU, use:

```bash
docker compose -f docker-compose.yml -f docker-compose.cpu.yml up -d
```

If the host has an Intel GPU and exposes the render node, use the Intel override for ffmpeg QSV acceleration:

```bash
sudo apt install -y vainfo intel-media-va-driver libva-drm2 libva2
ls -l /dev/dri/renderD128
docker compose -f docker-compose.yml -f docker-compose.intel.yml up -d
```

The Intel override targets Ubuntu 26.06 and passes `/dev/dri/renderD128` to the app and worker containers, adds the host video/render group IDs, uses the Intel media driver (`iHD`) for QSV, disables the inherited NVIDIA runtime, runs Whisper on CPU, and sets `CLIPSE_LOCAL_DETECTOR_DEVICE=intel:gpu` so local YOLO/RT-DETR focus detection uses OpenVINO on Intel GPU when available. If your host group IDs differ from the defaults, set:

```bash
export CLIPSE_VIDEO_GID="$(getent group video | cut -d: -f3)"
export CLIPSE_RENDER_GID="$(getent group render | cut -d: -f3)"
```

To diagnose Intel driver access from the worker container:

```bash
docker compose -f docker-compose.yml -f docker-compose.intel.yml exec worker sh -lc '
id
ls -l /dev/dri
vainfo --display drm --device /dev/dri/renderD128
ffmpeg -hide_banner -hwaccels
ffmpeg -hide_banner -encoders | grep -E "qsv|vaapi"
ffmpeg -hide_banner -v error -init_hw_device qsv=hw:/dev/dri/renderD128 -f lavfi -i nullsrc=s=16x16:d=0.1 -frames:v 1 -f null -
'
```


### Hailo-10H Whisper provider

Hailo support is opt-in because the host must expose HailoRT and the accelerator device to the Whisper container.

License notes:

- HailoRT's public repository states that `libhailort`, `pyhailort`, and `hailortcli` are MIT licensed, while `hailonet` is LGPL 2.1.
- The public PCIe driver repository is GPLv2.
- The Hailo-10H firmware license is separate and allows binary redistribution only under its stated product/use restrictions.
- The ASUS support package `UGen300_M2_5.3.0_driver_Linux_amd64.zip` should be treated as a vendor package that users download from ASUS support, not something ClipSE redistributes.

The default Hailo compose override pulls `ghcr.io/fixtse/clipse-whisper-hailo:latest`, which targets HailoRT 5.3. The host PCIe driver must be the same HailoRT version as the runtime in the image. If you need a newer HailoRT release, build a local/private Hailo image with matching `hailort_*.deb` and `hailort-*.whl` packages, then install the matching PCIe driver on the host.

ClipSE does not redistribute the ASUS driver zip, Hailo-10H firmware, or proprietary HEFs. If your Hailo/ASUS license permits keeping licensed packages in your own registry, put these files in `services/whisper/hailo-packages/` and build a local/private image with `INSTALL_LOCAL_HAILORT=true`:

- `hailort_<version>_<arch>.deb`
- `hailort-<version>-cp311-cp311-linux_<arch>.whl`

The recommended path is to keep the PyHailoRT wheel outside the repository and pass the containing directory as a build context. Put exactly one `hailort-*.whl` or `pyhailort-*.whl` in that directory:

```bash
mkdir -p "$HOME/Downloads/hailort"
# Put hailort-5.3.0-cp311-cp311-linux_x86_64.whl in $HOME/Downloads/hailort.
CLIPSE_WHISPER_HAILO_IMAGE=clipse-whisper-hailo:local \
HAILORT_WHEEL_DIR="$HOME/Downloads/hailort" \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml -f docker-compose.hailo-build.yml build whisper
```

When running that local image, keep `CLIPSE_WHISPER_HAILO_IMAGE=clipse-whisper-hailo:local` in the environment for the `up` command.

The PCIe driver package is always installed on the host, not inside the container. PyHailoRT is installed into the Hailo Docker image during the private build.

Put Hailo HEFs under `./models/hailo`. The runners search `/models` recursively before Hailo resource directories, so these examples do not require explicit `HAILO_*_HEF_PATH` values:

```bash
mkdir -p models/hailo
# Examples:
# models/hailo/whisper-base.hef
# models/hailo/yolov8n.hef
# models/hailo/text_detection.hef
```

Pure Linux host setup:

```bash
# Install the HailoRT PCIe driver package that matches the HailoRT version in your image.
./scripts/install-hailo-ugen300-driver.sh ~/Downloads/UGen300_M2_5.3.0_driver_Linux_amd64.zip
sudo reboot

ls -l /dev/h1x-*
hailortcli scan

WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.cpu.yml -f docker-compose.hailo.yml up -d
```

WSL setup:

```bash
# Run Docker from the WSL distro where the device is visible.
ls -l /dev/h1x-*
hailortcli scan

WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.cpu.yml -f docker-compose.hailo.yml up -d
```

If `/dev/h1x-0` is not visible inside WSL, Docker cannot pass the accelerator through. Install the vendor Windows/WSL driver stack or run ClipSE on pure Linux.

On a host that also has an NVIDIA GPU, omit the CPU override:

```bash
WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d
```

On an Intel GPU host, use the Intel override instead of the CPU override so ffmpeg can use QSV while Hailo handles transcription or focus detection:

```bash
sudo apt install -y vainfo intel-media-va-driver libva-drm2 libva2
ls -l /dev/dri/renderD128
ls -l /dev/h1x-*
hailortcli scan

WHISPER_PROVIDER=hailo \
CLIPSE_FOCUS_PROVIDER=hailo-vision \
HAILO_DEVICE=/dev/h1x-0 \
docker compose -f docker-compose.yml -f docker-compose.intel.yml -f docker-compose.hailo.yml up -d
```

Keep `docker-compose.hailo.yml` last in that command. The Intel file passes `/dev/dri/renderD128` to app/worker, requests OpenVINO Intel GPU inference for local YOLO/RT-DETR fallback, and sets CPU Whisper defaults, while the Hailo file must override Whisper back to the Hailo provider.

ClipSE's Hailo image runs `services/whisper/hailo_whisper_runner.py` automatically. It converts incoming audio to mono 16 kHz little-endian float32 and calls PyHailoRT `Speech2Text.generate_all_segments`. Set `HAILO_HOST_LIB_DIR` or `HAILO_HOST_BIN_DIR` only if your host HailoRT install uses different library or `hailortcli` paths. For ASUS' amd64 zip, the kernel driver is compiled on the host by the script above; PyHailoRT should be installed into the Docker image through a licensed private build.

Alternative private image build with licensed packages copied into the checkout:

```bash
CLIPSE_WHISPER_HAILO_IMAGE=clipse-whisper-hailo:local \
INSTALL_LOCAL_HAILORT=true \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml -f docker-compose.hailo-build.yml build whisper
```

Private image build with a wheel directory outside the repo:

```bash
CLIPSE_WHISPER_HAILO_IMAGE=clipse-whisper-hailo:local \
HAILORT_WHEEL_DIR="$HOME/Downloads/hailort" \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml -f docker-compose.hailo-build.yml build whisper
```

Health and benchmark checks:

```bash
curl http://localhost:8000/health
curl -F file=@sample.wav "http://localhost:8000/benchmark?providers=faster-whisper&providers=hailo"
```

Enable Whisper debug logs when diagnosing audio extraction or empty transcription issues:

```bash
WHISPER_DEBUG=true \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d whisper

docker compose -f docker-compose.yml -f docker-compose.hailo.yml logs -f whisper
```

Enable focus debug logs when checking whether focus detection used Hailo or fell back to the local detector:

```bash
CLIPSE_FOCUS_DEBUG=true \
HAILO_FOCUS_DEBUG=true \
docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d web worker whisper

docker compose -f docker-compose.yml -f docker-compose.hailo.yml logs -f web worker whisper
```

After the service is healthy, open ClipSE AI Settings and select `Hailo-10H` as the transcription backend. The settings dialog shows the same backend detection state from `/health`.

To use Hailo vision detection for vertical short focus detection, set:

```bash
CLIPSE_FOCUS_PROVIDER=hailo-vision
```

The worker will call the Hailo service `POST /focus-detections` before the local YOLO/RT-DETR/OpenCV detector. It passes the active short detection mode (`people`, `people_strict`, `product`, `screen`, or `object`) so the Hailo runner can use YOLO-family object detections for people/products/general objects and screen-like object or OCR/text cues for screen focus. If Hailo is unavailable or returns no detections, ClipSE falls back to the existing local detector.

The Hailo image still does not redistribute vendor drivers, firmware, or proprietary HEFs. Store HEFs under `./models/hailo` and name them so they include the configured model name, such as `whisper-base.hef` for `HAILO_WHISPER_MODEL=whisper-base`, `yolov8n.hef` for `HAILO_VISION_MODEL=yolov8n`, or `Qwen3-VL-2B-Instruct.hef` for `HAILO_VLM_MODEL=qwen3-vl-2b-instruct`. Use `HAILO_VISION_HEF_PATH`, `HAILO_SCREEN_OCR_HEF_PATH`, `HAILO_VLM_HEF_PATH`, or `HAILO_WHISPER_HEF_PATH` only when auto-discovery is not enough. `CLIPSE_FOCUS_PROVIDER=hailo-vlm` remains available for the older face/person VLM prompt path.

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
pnpm db:generate
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
- `CLIPSE_DISABLE_AUTH=true` only when you want to bypass sign-in in a trusted local deployment

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
