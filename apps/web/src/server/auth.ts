import "server-only";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { headers } from "next/headers";

import { env } from "~/env";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";

const isSkippingEnvValidation = !!process.env.SKIP_ENV_VALIDATION;
const buildTimeAuthBaseUrl = "http://localhost:3000";
const buildTimeAuthSecret =
	"contentclip-build-time-secret-not-for-runtime-2026";

export const auth = betterAuth({
	baseURL: isSkippingEnvValidation
		? (process.env.BETTER_AUTH_BASE_URL ?? buildTimeAuthBaseUrl)
		: env.BETTER_AUTH_BASE_URL,
	secret: isSkippingEnvValidation
		? (process.env.BETTER_AUTH_SECRET ?? buildTimeAuthSecret)
		: env.BETTER_AUTH_SECRET,
	database: drizzleAdapter(db, {
		provider: "pg",
		schema,
	}),
	emailAndPassword: {
		enabled: true,
		minPasswordLength: 8,
	},
	user: {
		modelName: "user",
	},
	session: {
		modelName: "session",
	},
	account: {
		modelName: "account",
	},
	verification: {
		modelName: "verification",
	},
	databaseHooks: {
		user: {
			create: {
				async before() {
					const [existingUser] = await db
						.select({ id: schema.user.id })
						.from(schema.user)
						.limit(1);

					if (existingUser) {
						return false;
					}
				},
			},
		},
	},
});

export type AuthSession = Awaited<ReturnType<typeof auth.api.getSession>>;

export async function getSession(): Promise<AuthSession> {
	return auth.api.getSession({
		headers: await headers(),
	});
}

export async function hasExistingUser(): Promise<boolean> {
	const [existingUser] = await db
		.select({ id: schema.user.id })
		.from(schema.user)
		.limit(1);

	return !!existingUser;
}

export async function getSessionFromHeaders(
	requestHeaders: Headers,
): Promise<AuthSession> {
	return auth.api.getSession({
		headers: requestHeaders,
	});
}

export async function requireSession(): Promise<NonNullable<AuthSession>> {
	const session = await getSession();
	if (!session?.session) {
		throw new Error("Authentication required");
	}

	return session;
}
