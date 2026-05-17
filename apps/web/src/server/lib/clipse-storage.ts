import { createReadStream, createWriteStream } from "node:fs";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import {
	AbortMultipartUploadCommand,
	CompleteMultipartUploadCommand,
	CreateMultipartUploadCommand,
	DeleteObjectCommand,
	GetObjectCommand,
	HeadObjectCommand,
	PutObjectCommand,
	S3Client,
	UploadPartCommand,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import { env } from "~/env";

const s3Client = new S3Client({
	region: env.CLIPSE_S3_REGION,
	endpoint: env.CLIPSE_S3_ENDPOINT,
	forcePathStyle: env.CLIPSE_S3_FORCE_PATH_STYLE === "true",
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
	credentials: {
		accessKeyId: env.CLIPSE_S3_ACCESS_KEY_ID,
		secretAccessKey: env.CLIPSE_S3_SECRET_ACCESS_KEY,
	},
});

const publicS3Client = new S3Client({
	region: env.CLIPSE_S3_REGION,
	endpoint: env.CLIPSE_S3_PUBLIC_ENDPOINT,
	forcePathStyle: env.CLIPSE_S3_FORCE_PATH_STYLE === "true",
	requestChecksumCalculation: "WHEN_REQUIRED",
	responseChecksumValidation: "WHEN_REQUIRED",
	credentials: {
		accessKeyId: env.CLIPSE_S3_ACCESS_KEY_ID,
		secretAccessKey: env.CLIPSE_S3_SECRET_ACCESS_KEY,
	},
});

const bucketName = env.CLIPSE_S3_BUCKET;
export const MULTIPART_UPLOAD_PART_SIZE_BYTES = 24 * 1024 * 1024;

export function isStorageObjectMissingError(error: unknown): boolean {
	if (!(error instanceof Error)) {
		return false;
	}

	const metadata = (
		error as Error & {
			readonly $metadata?: { readonly httpStatusCode?: number };
			readonly Code?: string;
			readonly code?: string;
			readonly name?: string;
		}
	).$metadata;
	const errorCode =
		(error as Error & { readonly Code?: string; readonly code?: string })
			.Code ??
		(error as Error & { readonly code?: string }).code ??
		error.name;

	return (
		metadata?.httpStatusCode === 404 ||
		errorCode === "NoSuchKey" ||
		errorCode === "NotFound"
	);
}

export function buildClipStorageKey(videoId: string, clipId: string): string {
	return `clips/${videoId}/${clipId}.mp4`;
}

export function buildClipFilename(title: string, clipId: string): string {
	const sanitizedTitle = title
		.toLowerCase()
		.replace(/[^a-z0-9._-]+/g, "-")
		.replace(/-+/g, "-")
		.replace(/^-|-$/g, "")
		.slice(0, 80);

	return `${sanitizedTitle || clipId}.mp4`;
}

export async function deleteStorageObject(key: string): Promise<void> {
	await s3Client.send(
		new DeleteObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
	);
}

export async function uploadWebFileToStorage(input: {
	key: string;
	file: File;
	contentType: string;
}): Promise<void> {
	const upload = new Upload({
		client: s3Client,
		params: {
			Bucket: bucketName,
			Key: input.key,
			Body: Readable.fromWeb(input.file.stream() as never),
			ContentType: input.contentType,
		},
	});

	await upload.done();
}

export async function uploadLocalFileToStorage(input: {
	key: string;
	filePath: string;
	contentType: string;
}): Promise<void> {
	const upload = new Upload({
		client: s3Client,
		params: {
			Bucket: bucketName,
			Key: input.key,
			Body: createReadStream(input.filePath),
			ContentType: input.contentType,
		},
	});

	await upload.done();
}

export async function downloadStorageObjectToFile(input: {
	key: string;
	filePath: string;
}): Promise<void> {
	const response = await s3Client.send(
		new GetObjectCommand({
			Bucket: bucketName,
			Key: input.key,
		}),
	);

	if (!response.Body) {
		throw new Error(`Storage object ${input.key} is empty`);
	}

	const body =
		"transformToWebStream" in response.Body
			? Readable.fromWeb(response.Body.transformToWebStream() as never)
			: (response.Body as NodeJS.ReadableStream);

	await pipeline(body, createWriteStream(input.filePath));
}

export async function assertStorageObjectExists(key: string): Promise<void> {
	await s3Client.send(
		new HeadObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
	);
}

export async function getStorageObjectMetadata(key: string): Promise<{
	contentLength?: number;
	contentType: string;
	etag?: string;
	lastModified?: Date;
}> {
	const response = await s3Client.send(
		new HeadObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
	);

	return {
		contentLength: response.ContentLength ?? undefined,
		contentType: response.ContentType ?? "application/octet-stream",
		etag: response.ETag ?? undefined,
		lastModified: response.LastModified ?? undefined,
	};
}

export async function getSignedStorageUrl(
	key: string,
	expiresInSeconds = 3600,
): Promise<string> {
	return getSignedUrl(
		publicS3Client,
		new GetObjectCommand({
			Bucket: bucketName,
			Key: key,
		}),
		{
			expiresIn: expiresInSeconds,
		},
	);
}

export async function getStorageObjectStream(key: string) {
	return getStorageObjectStreamWithRange({ key });
}

export async function getStorageObjectStreamWithRange(input: {
	key: string;
	range?: string;
}) {
	const response = await s3Client.send(
		new GetObjectCommand({
			Bucket: bucketName,
			Key: input.key,
			Range: input.range,
		}),
	);

	if (!response.Body) {
		throw new Error(`Storage object ${input.key} is empty`);
	}

	return {
		body: response.Body,
		contentLength: response.ContentLength ?? undefined,
		contentType: response.ContentType ?? "application/octet-stream",
		contentRange: response.ContentRange ?? undefined,
		etag: response.ETag ?? undefined,
	};
}

export async function writeTextFileToStorage(input: {
	key: string;
	content: string;
	contentType: string;
}): Promise<void> {
	await s3Client.send(
		new PutObjectCommand({
			Bucket: bucketName,
			Key: input.key,
			Body: input.content,
			ContentType: input.contentType,
		}),
	);
}

export async function createMultipartVideoUpload(input: {
	key: string;
	contentType: string;
}): Promise<{
	uploadId: string;
}> {
	const response = await s3Client.send(
		new CreateMultipartUploadCommand({
			Bucket: bucketName,
			Key: input.key,
			ContentType: input.contentType,
		}),
	);

	if (!response.UploadId) {
		throw new Error("Failed to create multipart upload");
	}

	return {
		uploadId: response.UploadId,
	};
}

export async function createMultipartUploadPartUrls(input: {
	key: string;
	uploadId: string;
	partNumbers: number[];
}): Promise<Array<{ partNumber: number; url: string }>> {
	return Promise.all(
		input.partNumbers.map(async (partNumber) => ({
			partNumber,
			url: await getSignedUrl(
				publicS3Client,
				new UploadPartCommand({
					Bucket: bucketName,
					Key: input.key,
					UploadId: input.uploadId,
					PartNumber: partNumber,
				}),
				{
					expiresIn: 3600,
				},
			),
		})),
	);
}

export async function uploadMultipartVideoPart(input: {
	key: string;
	uploadId: string;
	partNumber: number;
	body: Uint8Array;
}): Promise<{ etag: string }> {
	const response = await s3Client.send(
		new UploadPartCommand({
			Bucket: bucketName,
			Key: input.key,
			UploadId: input.uploadId,
			PartNumber: input.partNumber,
			Body: input.body,
		}),
	);

	if (!response.ETag) {
		throw new Error("Upload part completed without an ETag");
	}

	return {
		etag: response.ETag,
	};
}

export async function completeMultipartVideoUpload(input: {
	key: string;
	uploadId: string;
	parts: Array<{ partNumber: number; etag: string }>;
}): Promise<void> {
	await s3Client.send(
		new CompleteMultipartUploadCommand({
			Bucket: bucketName,
			Key: input.key,
			UploadId: input.uploadId,
			MultipartUpload: {
				Parts: input.parts
					.sort((left, right) => left.partNumber - right.partNumber)
					.map((part) => ({
						ETag: part.etag,
						PartNumber: part.partNumber,
					})),
			},
		}),
	);
}

export async function abortMultipartVideoUpload(input: {
	key: string;
	uploadId: string;
}): Promise<void> {
	await s3Client.send(
		new AbortMultipartUploadCommand({
			Bucket: bucketName,
			Key: input.key,
			UploadId: input.uploadId,
		}),
	);
}
