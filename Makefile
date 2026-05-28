SHELL := /bin/sh

HAILO_DRIVER_ZIP ?=
HAILO_SAMPLE_AUDIO ?= sample.wav

.PHONY: dev dev-hailo dev-down worker-base-dev prod prod-hailo prod-down logs app-logs worker-logs whisper-logs hailo-logs hailo-build hailo-driver-install hailo-health hailo-benchmark db-generate db-migrate typecheck test

dev: worker-base-dev
	docker compose -f docker-compose.dev.yml up --build

dev-hailo: worker-base-dev
	CLIPSE_FOCUS_PROVIDER=hailo-vision WHISPER_PROVIDER=hailo docker compose -f docker-compose.dev.yml -f docker-compose.hailo.yml up --build

worker-base-dev:
	docker build -f apps/worker/Dockerfile.base.dev -t clipse-worker-base:dev .

dev-down:
	docker compose -f docker-compose.dev.yml down

prod:
	docker compose up --build -d

prod-hailo:
	CLIPSE_FOCUS_PROVIDER=hailo-vision WHISPER_PROVIDER=hailo docker compose -f docker-compose.yml -f docker-compose.hailo.yml up -d

prod-down:
	docker compose down

logs:
	docker compose -f docker-compose.dev.yml logs -f

app-logs:
	docker compose -f docker-compose.dev.yml logs -f app

worker-logs:
	docker compose -f docker-compose.dev.yml logs -f worker

whisper-logs:
	docker compose -f docker-compose.dev.yml logs -f whisper

hailo-logs:
	docker compose -f docker-compose.yml -f docker-compose.hailo.yml logs -f whisper

hailo-build:
	docker compose -f docker-compose.yml -f docker-compose.hailo.yml build whisper

hailo-driver-install:
	test -n "$(HAILO_DRIVER_ZIP)" || (echo "Set HAILO_DRIVER_ZIP=/path/to/UGen300_M2_5.3.0_driver_Linux_amd64.zip" >&2; exit 2)
	./scripts/install-hailo-ugen300-driver.sh "$(HAILO_DRIVER_ZIP)"

hailo-health:
	curl -fsS http://localhost:8000/health

hailo-benchmark:
	test -f "$(HAILO_SAMPLE_AUDIO)" || (echo "Set HAILO_SAMPLE_AUDIO=/path/to/sample.wav" >&2; exit 2)
	curl -fsS -F file=@"$(HAILO_SAMPLE_AUDIO)" "http://localhost:8000/benchmark?providers=faster-whisper&providers=hailo"

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

typecheck:
	pnpm typecheck

test:
	pnpm test:unit
