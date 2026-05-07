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
			.default("contentclip-local-development-secret-change-me"),
		BETTER_AUTH_BASE_URL: z.string().url().default("http://localhost:3000"),
		DATABASE_URL: z.string().url(),
		NODE_ENV: z
			.enum(["development", "test", "production"])
			.default("development"),
		OPENAI_API_KEY: z.string().default(""),
		OPENAI_BASE_URL: z.string().default(""),
		OPENAI_MODEL: z.string().default("gpt-4o-mini"),
		WHISPER_SERVICE_URL: z.string().url().default("http://whisper:8000"),
		WHISPER_MODEL: z.string().default("medium"),
		CONTENTCLIP_S3_ENDPOINT: z.string().url().default("http://garage:3900"),
		CONTENTCLIP_S3_PUBLIC_ENDPOINT: z
			.string()
			.url()
			.default("http://localhost:3900"),
		CONTENTCLIP_S3_REGION: z.string().default("garage"),
		CONTENTCLIP_S3_BUCKET: z.string().default("contentclip"),
		CONTENTCLIP_S3_ACCESS_KEY_ID: z
			.string()
			.default("GK000000000000000000000000"),
		CONTENTCLIP_S3_SECRET_ACCESS_KEY: z
			.string()
			.default(
				"0000000000000000000000000000000000000000000000000000000000000000",
			),
		CONTENTCLIP_S3_FORCE_PATH_STYLE: z.enum(["true", "false"]).default("true"),
		CONTENTCLIP_MAX_CLIPS_PER_VIDEO: z.coerce
			.number()
			.int()
			.min(1)
			.max(20)
			.default(8),
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
		OPENAI_API_KEY: process.env.OPENAI_API_KEY,
		OPENAI_BASE_URL: process.env.OPENAI_BASE_URL,
		OPENAI_MODEL: process.env.OPENAI_MODEL,
		WHISPER_SERVICE_URL: process.env.WHISPER_SERVICE_URL,
		WHISPER_MODEL: process.env.WHISPER_MODEL,
		CONTENTCLIP_S3_ENDPOINT: process.env.CONTENTCLIP_S3_ENDPOINT,
		CONTENTCLIP_S3_PUBLIC_ENDPOINT: process.env.CONTENTCLIP_S3_PUBLIC_ENDPOINT,
		CONTENTCLIP_S3_REGION: process.env.CONTENTCLIP_S3_REGION,
		CONTENTCLIP_S3_BUCKET: process.env.CONTENTCLIP_S3_BUCKET,
		CONTENTCLIP_S3_ACCESS_KEY_ID: process.env.CONTENTCLIP_S3_ACCESS_KEY_ID,
		CONTENTCLIP_S3_SECRET_ACCESS_KEY:
			process.env.CONTENTCLIP_S3_SECRET_ACCESS_KEY,
		CONTENTCLIP_S3_FORCE_PATH_STYLE:
			process.env.CONTENTCLIP_S3_FORCE_PATH_STYLE,
		CONTENTCLIP_MAX_CLIPS_PER_VIDEO:
			process.env.CONTENTCLIP_MAX_CLIPS_PER_VIDEO,
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
