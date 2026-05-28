import "server-only";

import { drizzleAdapter } from "better-auth/adapters/drizzle";
import { betterAuth } from "better-auth/minimal";
import { cookies, headers } from "next/headers";

import { env } from "~/env";
import { db } from "~/server/db";
import * as schema from "~/server/db/schema";

const isSkippingEnvValidation = !!process.env.SKIP_ENV_VALIDATION;
const buildTimeAuthBaseUrl = "http://localhost:3000";
const buildTimeAuthSecret = "clipse-build-time-secret-not-for-runtime-2026";
export const localAnonymousModeCookieName = "clipse-local-anonymous-mode";
export const localAnonymousModeCookieValue = "enabled";
export const persistentSessionMaxAge = 60 * 60 * 24 * 365;

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
		expiresIn: persistentSessionMaxAge,
		updateAge: 60 * 60 * 24,
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

function getCookieValue(
	cookieHeader: string | null,
	name: string,
): string | null {
	if (!cookieHeader) {
		return null;
	}

	for (const cookie of cookieHeader.split(";")) {
		const [rawName, ...rawValueParts] = cookie.trim().split("=");
		if (rawName === name) {
			return decodeURIComponent(rawValueParts.join("="));
		}
	}

	return null;
}

export async function isLocalAnonymousAccessAllowed(
	requestHeaders?: Headers,
): Promise<boolean> {
	if (await hasExistingUser()) {
		return false;
	}

	if (requestHeaders) {
		return (
			getCookieValue(
				requestHeaders.get("cookie"),
				localAnonymousModeCookieName,
			) === localAnonymousModeCookieValue
		);
	}

	const cookieStore = await cookies();
	return (
		cookieStore.get(localAnonymousModeCookieName)?.value ===
		localAnonymousModeCookieValue
	);
}

export async function getSessionFromHeaders(
	requestHeaders: Headers,
): Promise<AuthSession> {
	return auth.api.getSession({
		headers: requestHeaders,
	});
}

export async function requireSession(): Promise<AuthSession> {
	const session = await getSession();
	if (session?.session || (await isLocalAnonymousAccessAllowed())) {
		return session;
	}

	throw new Error("Authentication required");
}
