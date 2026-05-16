import { createReadStream } from "node:fs";
import { copyFile, mkdir, stat, unlink } from "node:fs/promises";
import { dirname, join } from "node:path";

const mediaCacheRoot =
	process.env.CLIPSE_MEDIA_CACHE_DIR ?? ".clipse-media-cache";

function getSafeCachePath(storageKey: string): string {
	const parts = storageKey
		.split("/")
		.map((part) => part.replace(/[^a-zA-Z0-9._-]/g, "_"))
		.filter(Boolean);

	return join(
		/*turbopackIgnore: true*/ process.cwd(),
		mediaCacheRoot,
		...parts,
	);
}

export async function cacheLocalMediaFile(input: {
	storageKey: string;
	filePath: string;
}): Promise<void> {
	const cachePath = getSafeCachePath(input.storageKey);
	await mkdir(dirname(cachePath), { recursive: true });
	await copyFile(input.filePath, cachePath);
}

export async function findCachedMediaFile(storageKey: string): Promise<{
	filePath: string;
	sizeBytes: number;
} | null> {
	const filePath = getSafeCachePath(storageKey);

	try {
		const fileStat = await stat(filePath);
		if (!fileStat.isFile()) {
			return null;
		}

		return {
			filePath,
			sizeBytes: fileStat.size,
		};
	} catch {
		return null;
	}
}

export async function deleteCachedMediaFile(storageKey: string): Promise<void> {
	await unlink(getSafeCachePath(storageKey)).catch((error: unknown) => {
		if (
			typeof error === "object" &&
			error !== null &&
			"code" in error &&
			error.code === "ENOENT"
		) {
			return;
		}

		throw error;
	});
}

function parseRangeHeader(
	rangeHeader: string | null,
	sizeBytes: number,
): { start: number; end: number } | null {
	if (!rangeHeader) {
		return null;
	}

	const match = rangeHeader.match(/^bytes=(\d*)-(\d*)$/);
	if (!match) {
		return null;
	}

	const startText = match[1] ?? "";
	const endText = match[2] ?? "";
	if (!startText && !endText) {
		return null;
	}

	if (!startText) {
		const suffixLength = Number(endText);
		if (!Number.isFinite(suffixLength) || suffixLength <= 0) {
			return null;
		}

		return {
			start: Math.max(0, sizeBytes - suffixLength),
			end: sizeBytes - 1,
		};
	}

	const start = Number(startText);
	const end = endText ? Number(endText) : sizeBytes - 1;
	if (
		!Number.isFinite(start) ||
		!Number.isFinite(end) ||
		start < 0 ||
		end < start ||
		start >= sizeBytes
	) {
		return null;
	}

	return {
		start,
		end: Math.min(end, sizeBytes - 1),
	};
}

export function buildLocalMediaHeaders(input: {
	contentType: string;
	sizeBytes: number;
	range?: { start: number; end: number } | null;
}): Headers {
	const headers = new Headers({
		"Accept-Ranges": "bytes",
		"Cache-Control": "private, max-age=300",
		"Content-Type": input.contentType,
	});

	if (input.range) {
		headers.set(
			"Content-Range",
			`bytes ${input.range.start}-${input.range.end}/${input.sizeBytes}`,
		);
		headers.set(
			"Content-Length",
			(input.range.end - input.range.start + 1).toString(),
		);
		return headers;
	}

	headers.set("Content-Length", input.sizeBytes.toString());
	return headers;
}

export function createLocalMediaResponse(input: {
	filePath: string;
	sizeBytes: number;
	contentType: string;
	request: Request;
}): Response {
	const range = parseRangeHeader(
		input.request.headers.get("range"),
		input.sizeBytes,
	);
	const headers = buildLocalMediaHeaders({
		contentType: input.contentType,
		sizeBytes: input.sizeBytes,
		range,
	});
	const stream = createReadStream(input.filePath, {
		start: range?.start,
		end: range?.end,
	});

	return new Response(stream as unknown as BodyInit, {
		status: range ? 206 : 200,
		headers,
	});
}
