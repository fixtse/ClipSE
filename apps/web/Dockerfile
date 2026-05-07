FROM node:24-bookworm-slim

RUN apt-get update \
	&& apt-get install -y ffmpeg ca-certificates openssl yt-dlp python3-pip \
	&& python3 -m pip install --break-system-packages --no-cache-dir --upgrade yt-dlp \
	&& rm -rf /var/lib/apt/lists/*

WORKDIR /app

ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV NEXT_TELEMETRY_DISABLED=1

RUN corepack enable && corepack prepare pnpm@10.28.1 --activate

COPY package.json pnpm-lock.yaml ./
RUN pnpm install --frozen-lockfile

COPY . .

RUN SKIP_ENV_VALIDATION=1 pnpm build

EXPOSE 3000

CMD ["pnpm", "start"]
