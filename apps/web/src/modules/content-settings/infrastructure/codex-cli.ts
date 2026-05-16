import { spawn } from "node:child_process";
import type { ContentAiModelOption } from "../domain/content-ai-models";

interface CodexAppServerModelListResponse {
	readonly data?: Array<{
		readonly displayName?: string;
		readonly hidden?: boolean;
		readonly id?: string;
		readonly model?: string;
	}>;
}

function codexEnvironment(): NodeJS.ProcessEnv {
	const codexHome = process.env.CLIPSE_CODEX_HOME;
	return {
		...process.env,
		...(codexHome ? { CODEX_HOME: codexHome } : {}),
	};
}

function codexCommand(): string {
	return process.env.CLIPSE_CODEX_COMMAND || "codex";
}

function codexCwd(): string {
	return process.env.CLIPSE_CODEX_CWD || process.cwd();
}

function codexTimeoutMs(): number {
	const value = Number(process.env.CLIPSE_CODEX_TIMEOUT_MS);
	return Number.isFinite(value) && value > 0 ? value : 300000;
}

function runCodex(input: {
	readonly args: readonly string[];
	readonly stdin?: string;
	readonly timeoutMs?: number;
}): Promise<{ readonly stdout: string; readonly stderr: string }> {
	return new Promise((resolve, reject) => {
		const child = spawn(codexCommand(), [...input.args], {
			cwd: codexCwd(),
			env: codexEnvironment(),
			stdio: ["pipe", "pipe", "pipe"],
		});
		const stdout: Buffer[] = [];
		const stderr: Buffer[] = [];
		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error("Codex CLI timed out."));
		}, input.timeoutMs ?? codexTimeoutMs());

		child.stdout.on("data", (chunk: Buffer) => stdout.push(chunk));
		child.stderr.on("data", (chunk: Buffer) => stderr.push(chunk));
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
			const output = Buffer.concat(stdout).toString("utf8");
			const errors = Buffer.concat(stderr).toString("utf8");
			if (code === 0) {
				resolve({ stdout: output, stderr: errors });
				return;
			}
			reject(
				new Error(
					`Codex CLI exited with code ${code ?? "unknown"}: ${errors || output}`,
				),
			);
		});
		child.stdin.end(input.stdin ?? "");
	});
}

async function requestCodexAppServer<T>(
	method: string,
	params: Record<string, unknown>,
): Promise<T> {
	return new Promise((resolve, reject) => {
		const child = spawn(codexCommand(), ["app-server"], {
			cwd: codexCwd(),
			env: codexEnvironment(),
			stdio: ["pipe", "pipe", "pipe"],
		});
		let stdout = "";
		let stderr = "";
		const timeout = setTimeout(() => {
			child.kill("SIGTERM");
			reject(new Error("Codex app-server timed out."));
		}, 30000);
		const finish = (callback: () => void) => {
			clearTimeout(timeout);
			child.kill("SIGTERM");
			callback();
		};

		child.stdout.on("data", (chunk: Buffer) => {
			stdout += chunk.toString("utf8");
			const responseLine = stdout.split(/\r?\n/).find((line) => {
				const trimmed = line.trim();
				if (!trimmed.startsWith("{")) {
					return false;
				}
				try {
					const message = JSON.parse(trimmed) as { readonly id?: unknown };
					return message.id === 2;
				} catch {
					return false;
				}
			});
			if (!responseLine) {
				return;
			}
			finish(() => {
				const response = JSON.parse(responseLine) as {
					readonly result?: T;
					readonly error?: { readonly message?: string };
				};
				if (response.error) {
					reject(
						new Error(
							response.error.message ?? "Codex app-server request failed.",
						),
					);
					return;
				}
				if (!response.result) {
					reject(new Error("Codex app-server returned an empty result."));
					return;
				}
				resolve(response.result);
			});
		});
		child.stderr.on("data", (chunk: Buffer) => {
			stderr += chunk.toString("utf8");
		});
		child.on("error", (error) => {
			clearTimeout(timeout);
			reject(error);
		});
		child.on("close", (code) => {
			clearTimeout(timeout);
			if (!stdout.trim() && code !== 0) {
				reject(
					new Error(
						`Codex app-server exited with code ${code ?? "unknown"}: ${stderr}`,
					),
				);
			}
		});
		child.stdin.write(
			`${JSON.stringify({
				id: 1,
				method: "initialize",
				params: {
					clientInfo: {
						name: "clipse",
						title: "ClipSE",
						version: "0.0.0",
					},
					capabilities: {
						experimentalApi: true,
						optOutNotificationMethods: null,
					},
				},
			})}\n`,
		);
		child.stdin.write(`${JSON.stringify({ method: "initialized" })}\n`);
		child.stdin.write(`${JSON.stringify({ id: 2, method, params })}\n`);
	});
}

export async function listCodexModels(): Promise<ContentAiModelOption[]> {
	const response = await requestCodexAppServer<CodexAppServerModelListResponse>(
		"model/list",
		{ includeHidden: false },
	);

	return (response.data ?? [])
		.filter((model) => model.hidden !== true)
		.map((model) => {
			const value = model.model ?? model.id ?? "";
			return {
				value,
				label: model.displayName || value,
			};
		})
		.filter((model) => model.value.length > 0)
		.sort((left, right) => left.label.localeCompare(right.label));
}

export async function generateCodexText(input: {
	readonly model: string;
	readonly prompt: string;
}): Promise<string> {
	const { stdout } = await runCodex({
		args: [
			"exec",
			"--skip-git-repo-check",
			"--sandbox",
			"read-only",
			"--model",
			input.model,
			"-",
		],
		stdin: input.prompt,
	});

	return stdout.trim();
}
