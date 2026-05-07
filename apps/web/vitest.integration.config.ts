import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ROOT_DIR = fileURLToPath(new URL(".", import.meta.url));

export default defineConfig({
	root: ROOT_DIR,
	resolve: {
		alias: {
			"~": path.resolve(ROOT_DIR, "src"),
		},
	},
	test: {
		environment: "node",
		globals: true,
		include: ["tests/integration/**/*.test.ts"],
		setupFiles: ["./tests/setup/integration-test.setup.ts"],
	},
});
