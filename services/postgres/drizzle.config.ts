import type { Config } from "drizzle-kit";

const getRequiredEnv = (key: string): string => {
	const value = process.env[key];
	if (!value) {
		throw new Error(`${key} is required`);
	}
	return value;
};

export default {
	schema: "./apps/web/src/server/db/schema.ts",
	out: "./services/postgres/migrations",
	dialect: "postgresql",
	dbCredentials: {
		url: getRequiredEnv("DATABASE_URL"),
	},
} satisfies Config;
