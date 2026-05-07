FROM node:24-bookworm-slim

RUN apt-get update \
	&& apt-get install -y --no-install-recommends ffmpeg ca-certificates openssl yt-dlp python3-pip python3-opencv \
	&& python3 -m pip install --break-system-packages --no-cache-dir --upgrade typing-extensions \
	&& python3 -m pip install --break-system-packages --no-cache-dir torch==2.7.1+cu128 torchvision==0.22.1+cu128 --index-url https://download.pytorch.org/whl/cu128 \
	&& python3 -m pip install --break-system-packages --no-cache-dir --upgrade yt-dlp ultralytics \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

CMD ["pnpm", "worker"]
