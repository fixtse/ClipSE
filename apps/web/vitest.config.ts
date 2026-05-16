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
		coverage: {
			exclude: [
				"src/app/**",
				"src/modules/**/infrastructure/**",
				"src/modules/**/*.repository.interface.ts",
				"src/**/*.d.ts",
				"tests/**",
			],
			include: [
				"src/modules/**/*.ts",
				"src/components/ui/{badge,button,card,input,progress,skeleton,textarea}.tsx",
				"src/components/clipse/**",
			],
			provider: "v8",
			reporter: ["text", "html", "lcov", "json-summary"],
			reportsDirectory: "coverage/unit",
		},
		environment: "node",
		globals: true,
		include: ["tests/unit/**/*.test.{ts,tsx}"],
		setupFiles: ["./tests/setup/unit-test.setup.ts"],
	},
});
