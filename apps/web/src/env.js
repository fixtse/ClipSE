import { createEnv } from "@t3-oss/env-nextjs";
import { z } from "zod";

export const env = createEnv({
	/**
	 * Specify your server-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars.
	 */
	server: {
		BETTER_AUTH_SECRET: z
			.string()
			.default("clipse-local-development-secret-change-me"),
		BETTER_AUTH_BASE_URL: z.string().url().default("http://localhost:3000"),
		DATABASE_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		WHISPER_SERVICE_URL: z.string().url().default("http://whisper:8000"),
		CLIPSE_FOCUS_PROVIDER: z
			.enum(["auto", "local", "hailo-vlm", "hailo-vision"])
			.default("auto"),
		CLIPSE_HAILO_SERVICE_URL: z.string().url().default("http://whisper:8000"),
		CLIPSE_S3_ENDPOINT: z.string().url().default("http://garage:3900"),
		CLIPSE_S3_PUBLIC_ENDPOINT: z
			.string()
			.url()
			.default("http://localhost:3900"),
		CLIPSE_S3_REGION: z.string().default("garage"),
		CLIPSE_S3_BUCKET: z.string().default("clipse"),
		CLIPSE_S3_ACCESS_KEY_ID: z.string().default("GK000000000000000000000000"),
		CLIPSE_S3_SECRET_ACCESS_KEY: z
			.string()
			.default(
				"0000000000000000000000000000000000000000000000000000000000000000",
			),
		CLIPSE_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
		CLIPSE_MAX_CLIPS_PER_VIDEO: z.coerce
			.number()
			.int()
			.min(1)
			.max(20)
			.default(8),
		CLIPSE_MAX_SHORTS_PER_VIDEO: z.coerce
			.number()
			.int()
			.min(1)
			.max(40)
			.default(16),
		CLIPSE_CODEX_COMMAND: z.string().default("codex"),
		CLIPSE_CODEX_HOME: z.string().optional(),
		CLIPSE_CODEX_CWD: z.string().default("/app"),
		CLIPSE_CODEX_TIMEOUT_MS: z.coerce.number().int().min(1000).default(300000),
		CLIPSE_DISABLE_AUTH: z.enum(["true", "false"]).default("false"),
	},

	/**
	 * Specify your client-side environment variables schema here. This way you can ensure the app
	 * isn't built with invalid env vars. To expose them to the client, prefix them with
	 * `NEXT_PUBLIC_`.
	 */
	client: {},

	/**
	 * You can't destruct `process.env` as a regular object in the Next.js edge runtimes (e.g.
	 * middlewares) or client-side so we need to destruct manually.
	 */
	runtimeEnv: {
		BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET,
		BETTER_AUTH_BASE_URL: process.env.BETTER_AUTH_BASE_URL,
		DATABASE_URL: process.env.DATABASE_URL,
		NODE_ENV: process.env.NODE_ENV,
		WHISPER_SERVICE_URL: process.env.WHISPER_SERVICE_URL,
		CLIPSE_FOCUS_PROVIDER: process.env.CLIPSE_FOCUS_PROVIDER,
		CLIPSE_HAILO_SERVICE_URL: process.env.CLIPSE_HAILO_SERVICE_URL,
		CLIPSE_S3_ENDPOINT: process.env.CLIPSE_S3_ENDPOINT,
		CLIPSE_S3_PUBLIC_ENDPOINT: process.env.CLIPSE_S3_PUBLIC_ENDPOINT,
		CLIPSE_S3_REGION: process.env.CLIPSE_S3_REGION,
		CLIPSE_S3_BUCKET: process.env.CLIPSE_S3_BUCKET,
		CLIPSE_S3_ACCESS_KEY_ID: process.env.CLIPSE_S3_ACCESS_KEY_ID,
		CLIPSE_S3_SECRET_ACCESS_KEY: process.env.CLIPSE_S3_SECRET_ACCESS_KEY,
		CLIPSE_S3_FORCE_PATH_STYLE: process.env.CLIPSE_S3_FORCE_PATH_STYLE,
		CLIPSE_MAX_CLIPS_PER_VIDEO: process.env.CLIPSE_MAX_CLIPS_PER_VIDEO,
		CLIPSE_MAX_SHORTS_PER_VIDEO: process.env.CLIPSE_MAX_SHORTS_PER_VIDEO,
		CLIPSE_CODEX_COMMAND: process.env.CLIPSE_CODEX_COMMAND,
		CLIPSE_CODEX_HOME: process.env.CLIPSE_CODEX_HOME,
		CLIPSE_CODEX_CWD: process.env.CLIPSE_CODEX_CWD,
		CLIPSE_CODEX_TIMEOUT_MS: process.env.CLIPSE_CODEX_TIMEOUT_MS,
		CLIPSE_DISABLE_AUTH: process.env.CLIPSE_DISABLE_AUTH,
	},
	/**
	 * Run `build` or `dev` with `SKIP_ENV_VALIDATION` to skip env validation. This is especially
	 * useful for Docker builds.
	 */
	skipValidation: !!process.env.SKIP_ENV_VALIDATION,
	/**
	 * Makes it so that empty strings are treated as undefined. `SOME_VAR: z.string()` and
	 * `SOME_VAR=''` will throw an error.
	 */
	emptyStringAsUndefined: true,
});
