SHELL := /bin/sh

.PHONY: dev dev-down prod prod-down logs app-logs worker-logs whisper-logs db-generate db-migrate typecheck test

dev:
	docker compose -f docker-compose.dev.yml up --build

dev-down:
	docker compose -f docker-compose.dev.yml down

prod:
	docker compose up --build -d

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

db-generate:
	pnpm db:generate

db-migrate:
	pnpm db:migrate

typecheck:
	pnpm typecheck

test:
	pnpm test:unit
