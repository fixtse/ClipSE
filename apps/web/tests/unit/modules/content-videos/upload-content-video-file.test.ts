import { describe, expect, it, vi } from "vitest";
import { uploadContentVideoFile } from "~/modules/content-videos/application/upload-content-video-file";

class SuccessfulXMLHttpRequest {
	status = 200;
	upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;

	open = vi.fn();
	setRequestHeader = vi.fn();
	getResponseHeader = vi.fn((): string | null => "etag-1");
	send = vi.fn(() => {
		this.upload.onprogress?.({
			lengthComputable: true,
			loaded: 5,
		} as ProgressEvent);
		this.onload?.();
	});
}

class FailingXMLHttpRequest {
	status = 0;
	upload = { onprogress: null as ((event: ProgressEvent) => void) | null };
	onerror: (() => void) | null = null;
	onload: (() => void) | null = null;

	open = vi.fn();
	setRequestHeader = vi.fn();
	getResponseHeader = vi.fn(() => null);
	send = vi.fn(() => {
		this.onerror?.();
	});
}

const translate = (
	key: string,
	values?: Record<string, string | number>,
): string => (values ? `${key}:${values.part}` : key);

describe("uploadContentVideoFile", () => {
	it("uploads multipart files and completes with uploaded part etags", async () => {
		vi.stubGlobal("XMLHttpRequest", SuccessfulXMLHttpRequest);
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/start")) {
				return {
					ok: true,
					json: async () => ({
						success: true,
						data: {
							storageKey: "videos/source.mp4",
							uploadId: "upload-id",
							partSizeBytes: 5,
							parts: [{ partNumber: 1, url: "https://upload/part-1" }],
						},
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({ success: true }),
			};
		}) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);
		const onProgress = vi.fn();

		await uploadContentVideoFile(
			"11111111-1111-4111-8111-111111111111",
			new File(["1234567890"], "source.mp4", { type: "video/mp4" }),
			onProgress,
			translate,
		);

		expect(onProgress).toHaveBeenCalledWith(50);
		expect(fetchMock).toHaveBeenLastCalledWith(
			"/api/content/videos/11111111-1111-4111-8111-111111111111/multipart/complete",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					uploadId: "upload-id",
					storageKey: "videos/source.mp4",
					parts: [{ partNumber: 1, etag: "etag-1" }],
				}),
			}),
		);
	});

	it("throws translated errors when multipart initialization fails", async () => {
		vi.stubGlobal(
			"fetch",
			vi.fn(async () => ({
				ok: false,
				json: async () => ({}),
			})),
		);

		await expect(
			uploadContentVideoFile(
				"11111111-1111-4111-8111-111111111111",
				new File(["123"], "source.mp4"),
				vi.fn(),
				translate,
			),
		).rejects.toThrow("workspace.toasts.uploadInitializeFailed");
	});

	it("throws the server-provided start error before uploading parts", async () => {
		const fetchMock = vi.fn(async () => ({
			ok: true,
			json: async () => ({
				success: false,
				error: "Quota exceeded",
			}),
		})) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);
		vi.stubGlobal("XMLHttpRequest", SuccessfulXMLHttpRequest);

		await expect(
			uploadContentVideoFile(
				"11111111-1111-4111-8111-111111111111",
				new File(["123"], "source.mp4"),
				vi.fn(),
				translate,
			),
		).rejects.toThrow("Quota exceeded");
		expect(fetchMock).toHaveBeenCalledTimes(1);
	});

	it("aborts when a direct upload response is missing an etag", async () => {
		class MissingEtagXMLHttpRequest extends SuccessfulXMLHttpRequest {
			getResponseHeader = vi.fn(() => null);
		}
		vi.stubGlobal("XMLHttpRequest", MissingEtagXMLHttpRequest);
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/start")) {
				return {
					ok: true,
					json: async () => ({
						success: true,
						data: {
							storageKey: "videos/source.mp4",
							uploadId: "upload-id",
							partSizeBytes: 5,
							parts: [{ partNumber: 1, url: "https://upload/part-1" }],
						},
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({ success: true }),
			};
		}) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);

		await expect(
			uploadContentVideoFile(
				"11111111-1111-4111-8111-111111111111",
				new File(["1234567890"], "source.mp4", { type: "video/mp4" }),
				vi.fn(),
				translate,
			),
		).rejects.toThrow("workspace.toasts.uploadMissingEtag:1");
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/content/videos/11111111-1111-4111-8111-111111111111/multipart/abort",
			expect.objectContaining({
				method: "POST",
			}),
		);
	});

	it("falls back through the app proxy and aborts when completion fails", async () => {
		vi.stubGlobal("XMLHttpRequest", FailingXMLHttpRequest);
		const fetchMock = vi.fn(async (url: string) => {
			if (url.endsWith("/start")) {
				return {
					ok: true,
					json: async () => ({
						success: true,
						data: {
							storageKey: "videos/source.mp4",
							uploadId: "upload-id",
							partSizeBytes: 5,
							parts: [{ partNumber: 1, url: "https://upload/part-1" }],
						},
					}),
				};
			}
			if (url.endsWith("/part")) {
				return {
					ok: true,
					json: async () => ({
						success: true,
						data: { etag: "proxy-etag-1" },
					}),
				};
			}
			if (url.endsWith("/complete")) {
				return {
					ok: false,
					json: async () => ({
						success: false,
						error: "Finalize failed",
					}),
				};
			}
			return {
				ok: true,
				json: async () => ({ success: true }),
			};
		}) as unknown as typeof fetch;
		vi.stubGlobal("fetch", fetchMock);
		const consoleWarnSpy = vi
			.spyOn(console, "warn")
			.mockImplementation(() => {});

		await expect(
			uploadContentVideoFile(
				"11111111-1111-4111-8111-111111111111",
				new File(["1234567890"], "source.mp4", { type: "video/mp4" }),
				vi.fn(),
				translate,
			),
		).rejects.toThrow("Finalize failed");

		expect(fetchMock).toHaveBeenCalledWith(
			"/api/content/videos/11111111-1111-4111-8111-111111111111/multipart/part",
			expect.objectContaining({
				method: "POST",
				headers: expect.objectContaining({
					"x-part-number": "1",
					"x-storage-key": "videos/source.mp4",
					"x-upload-id": "upload-id",
				}),
			}),
		);
		expect(fetchMock).toHaveBeenCalledWith(
			"/api/content/videos/11111111-1111-4111-8111-111111111111/multipart/abort",
			expect.objectContaining({
				method: "POST",
				body: JSON.stringify({
					uploadId: "upload-id",
					storageKey: "videos/source.mp4",
				}),
			}),
		);
		expect(consoleWarnSpy).toHaveBeenCalledWith(
			"Direct multipart upload failed, retrying through app proxy.",
			{
				partNumber: 1,
				target: "https://upload/part-1",
			},
		);
	});
});
