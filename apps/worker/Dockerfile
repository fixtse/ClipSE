# syntax=docker/dockerfile:1.7

ARG CLIPSE_WORKER_BASE_IMAGE=ghcr.io/fixtse/clipse-worker-base:latest
FROM ${CLIPSE_WORKER_BASE_IMAGE}

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@11.1.2 --activate \
	&& npm install -g @openai/codex

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "worker:docker"]
