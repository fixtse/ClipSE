# syntax=docker/dockerfile:1.7

ARG CONTENTCLIP_WORKER_BASE_IMAGE=ghcr.io/fixtse/contentclip-worker-base:latest
FROM ${CONTENTCLIP_WORKER_BASE_IMAGE}

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "worker:docker"]
