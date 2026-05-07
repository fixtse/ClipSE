#!/usr/bin/env node
import postgres from "postgres";
import { env } from "../../apps/web/src/env.js";

const sql = postgres(env.DATABASE_URL);

try {
	console.log("Enabling pgvector extension...");
	await sql`CREATE EXTENSION IF NOT EXISTS vector`;
	console.log("✓ pgvector extension enabled successfully");
} catch (error) {
	if (error instanceof Error) {
		console.error("Failed to enable pgvector extension:", error.message);
	} else {
		console.error("Failed to enable pgvector extension:", String(error));
	}
	process.exit(1);
} finally {
	await sql.end();
}
