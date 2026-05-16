import { createGoogleGenerativeAI } from "@ai-sdk/google";
import { createOpenAI } from "@ai-sdk/openai";
import {
	extractJsonMiddleware,
	generateText,
	type LanguageModel,
	NoObjectGeneratedError,
	Output,
	wrapLanguageModel,
} from "ai";
import { jsonrepair } from "jsonrepair";
import { z } from "zod";
import { env } from "~/env";
import {
	type GeneratedChapter,
	GeneratedChapterSchema,
} from "~/modules/content-chapters/domain/content-chapter.valueobject";
import {
	type GeneratedClipCandidate,
	GeneratedClipCandidateSchema,
	normalizeClipCandidate,
} from "~/modules/content-clips/domain/content-clip.valueobject";
import type { ContentAiSettings } from "~/modules/content-settings/domain/content-ai-settings.valueobject";
import { generateCodexText } from "~/modules/content-settings/infrastructure/codex-cli";
import { contentAiSettingsRepository } from "~/modules/content-settings/infrastructure/content-ai-settings.repository";
import {
	type ContentTranscription,
	type ContentTranscriptionSegment,
	formatContentTimestamp,
} from "~/modules/content-transcriptions/domain/content-transcription.valueobject";
import type { ContentVideo } from "~/modules/content-videos/domain/content-video.valueobject";

const clipAnalysisSchema = z.object({
	clips: z
		.array(GeneratedClipCandidateSchema)
		.min(1)
		.max(env.CLIPSE_MAX_CLIPS_PER_VIDEO),
});
const shortAnalysisSchema = z.object({
	clips: z
		.array(GeneratedClipCandidateSchema)
		.min(1)
		.max(env.CLIPSE_MAX_SHORTS_PER_VIDEO),
});
const chapterAnalysisSchema = z.object({
	chapters: z.array(GeneratedChapterSchema).min(1).max(80),
});
const clipMetadataSchema = z.object({
	title: z.string().min(1).max(255),
	hook: z.string().max(1000).default(""),
	summary: z.string().max(2000).default(""),
	rationale: z.string().max(2000).default(""),
	score: z.number().min(0).max(100).default(70),
	tags: z.array(z.string().min(1).max(40)).max(10).default([]),
});
const ANALYSIS_CHUNK_SECONDS = 30 * 60;
const ANALYSIS_SMALL_REMAINDER_SECONDS = 15 * 60;
const ANALYSIS_SINGLE_CHUNK_TOLERANCE_SECONDS =
	ANALYSIS_CHUNK_SECONDS + ANALYSIS_SMALL_REMAINDER_SECONDS;
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";

interface AnalysisChunk {
	readonly index: number;
	readonly startSeconds: number;
	readonly endSeconds: number;
	readonly segments: ContentTranscriptionSegment[];
}

function buildTranscriptExcerpt(
	segments: ContentTranscriptionSegment[],
	startSeconds: number,
	endSeconds: number,
): string {
	return segments
		.filter(
			(segment) => segment.end >= startSeconds && segment.start <= endSeconds,
		)
		.map((segment) => segment.text)
		.join(" ")
		.trim();
}

function buildAnalysisChunks(
	segments: ContentTranscriptionSegment[],
	durationSeconds: number | null,
): AnalysisChunk[] {
	const inferredDuration = Math.max(
		durationSeconds ?? 0,
		...segments.map((segment) => segment.end),
	);

	if (inferredDuration <= ANALYSIS_SINGLE_CHUNK_TOLERANCE_SECONDS) {
		return [
			{
				index: 0,
				startSeconds: 0,
				endSeconds: inferredDuration,
				segments,
			},
		];
	}

	const bounds: Array<{ startSeconds: number; endSeconds: number }> = [];
	for (
		let startSeconds = 0;
		startSeconds < inferredDuration;
		startSeconds += ANALYSIS_CHUNK_SECONDS
	) {
		bounds.push({
			startSeconds,
			endSeconds: Math.min(
				inferredDuration,
				startSeconds + ANALYSIS_CHUNK_SECONDS,
			),
		});
	}

	const lastBound = bounds.at(-1);
	const previousBound = bounds.at(-2);
	if (
		lastBound &&
		previousBound &&
		lastBound.endSeconds - lastBound.startSeconds <=
			ANALYSIS_SMALL_REMAINDER_SECONDS
	) {
		previousBound.endSeconds = lastBound.endSeconds;
		bounds.pop();
	}

	return bounds.map((bound, index) => ({
		index,
		startSeconds: bound.startSeconds,
		endSeconds: bound.endSeconds,
		segments: segments.filter(
			(segment) =>
				segment.end >= bound.startSeconds && segment.start <= bound.endSeconds,
		),
	}));
}

function buildTimestampedTranscript(
	segments: ContentTranscriptionSegment[],
): string {
	return segments
		.map(
			(segment) =>
				`[${formatContentTimestamp(segment.start)} - ${formatContentTimestamp(segment.end)}] ${segment.text}`,
		)
		.join("\n");
}

function normalizeShortClipCandidate(
	input: GeneratedClipCandidate,
	videoDurationSeconds: number | null,
): GeneratedClipCandidate {
	const minDurationSeconds = 20;
	const maxDurationSeconds = 75;
	const maxEnd = videoDurationSeconds ?? Number.MAX_SAFE_INTEGER;
	const safeStart = Math.max(0, Number(input.startSeconds.toFixed(3)));
	const requestedEnd = Number(input.endSeconds.toFixed(3));
	const safeEnd = Math.min(
		Math.max(
			Math.min(requestedEnd, safeStart + maxDurationSeconds),
			safeStart + minDurationSeconds,
		),
		maxEnd,
	);

	return {
		...input,
		startSeconds: safeStart,
		endSeconds: Number(safeEnd.toFixed(3)),
		score: Math.round(input.score),
	};
}

async function withAiRetry<T>(operation: () => Promise<T>): Promise<T> {
	let lastError: unknown;
	for (let attempt = 1; attempt <= 3; attempt += 1) {
		try {
			return await operation();
		} catch (error) {
			lastError = error;
			console.warn(`AI generation attempt ${attempt} failed:`, error);
			if (attempt < 3) {
				await new Promise((resolve) => setTimeout(resolve, attempt * 1000));
			}
		}
	}

	throw lastError;
}

function wrapJsonExtractingModel(
	model: Exclude<LanguageModel, string>,
): LanguageModel {
	return wrapLanguageModel({
		model: model as Parameters<typeof wrapLanguageModel>[0]["model"],
		middleware: extractJsonMiddleware(),
	});
}

function extractJsonText(text: string): string {
	const trimmedText = text.trim();
	const fencedJson = /```(?:json)?\s*([\s\S]*?)\s*```/i.exec(trimmedText);
	if (fencedJson?.[1]) {
		return fencedJson[1].trim();
	}

	const objectStart = trimmedText.indexOf("{");
	const arrayStart = trimmedText.indexOf("[");
	const starts = [objectStart, arrayStart].filter((index) => index >= 0);
	const start = Math.min(...starts);
	if (!Number.isFinite(start)) {
		return trimmedText;
	}

	const objectEnd = trimmedText.lastIndexOf("}");
	const arrayEnd = trimmedText.lastIndexOf("]");
	const end = Math.max(objectEnd, arrayEnd);
	return end > start ? trimmedText.slice(start, end + 1).trim() : trimmedText;
}

interface OpenRouterChatCompletionResponse {
	readonly error?: {
		readonly message?: string;
		readonly code?: string | number;
		readonly metadata?: unknown;
	};
	readonly choices?: Array<{
		readonly message?: {
			readonly content?: string | Array<{ readonly text?: string }>;
		};
	}>;
}

function getOpenRouterContent(
	payload: OpenRouterChatCompletionResponse,
): string | null {
	const content = payload.choices?.[0]?.message?.content;
	if (typeof content === "string") {
		return content;
	}

	if (Array.isArray(content)) {
		return content
			.map((part) => part.text ?? "")
			.join("")
			.trim();
	}

	return null;
}

async function generateOpenRouterJsonObject<
	Schema extends z.ZodTypeAny,
>(input: {
	readonly aiSettings: ContentAiSettings;
	readonly schema: Schema;
	readonly prompt: string;
}): Promise<z.infer<Schema>> {
	const response = await fetch(OPENROUTER_API_URL, {
		method: "POST",
		headers: {
			Authorization: `Bearer ${input.aiSettings.openrouterApiKey}`,
			"Content-Type": "application/json",
			"HTTP-Referer": "https://clipse.local",
			"X-Title": "ClipSE",
		},
		body: JSON.stringify({
			model: input.aiSettings.openrouterModel,
			messages: [{ role: "user", content: input.prompt }],
		}),
	});
	const payload = (await response
		.json()
		.catch(() => null)) as OpenRouterChatCompletionResponse | null;

	if (!response.ok || payload?.error) {
		const details =
			payload?.error?.message ??
			`${response.status} ${response.statusText}`.trim();
		throw new Error(`OpenRouter request failed: ${details}`);
	}

	const text = payload ? getOpenRouterContent(payload) : null;
	if (!text) {
		throw new Error("OpenRouter returned an empty response.");
	}

	const repairedJson = jsonrepair(extractJsonText(text));
	return input.schema.parse(JSON.parse(repairedJson));
}

async function generateContentAiObject<Schema extends z.ZodTypeAny>(input: {
	readonly model: LanguageModel | null;
	readonly aiSettings: ContentAiSettings;
	readonly schema: Schema;
	readonly prompt: string;
	readonly jsonInstructions: string;
}): Promise<z.infer<Schema>> {
	const prompt = `${input.prompt}

Return only valid JSON. Do not wrap it in markdown. The JSON must match this shape:
${input.jsonInstructions}`;
	if (input.aiSettings.provider === "openrouter") {
		return generateOpenRouterJsonObject({
			aiSettings: input.aiSettings,
			schema: input.schema,
			prompt,
		});
	}

	if (input.aiSettings.provider === "codex") {
		const text = await generateCodexText({
			model: input.aiSettings.codexModel,
			prompt,
		});
		const repairedJson = jsonrepair(extractJsonText(text));
		return input.schema.parse(JSON.parse(repairedJson));
	}

	const model =
		typeof input.model === "string"
			? input.model
			: wrapJsonExtractingModel(input.model as Exclude<LanguageModel, string>);

	try {
		const { output } = await generateText({
			model,
			output: Output.object({
				schema: input.schema,
			}),
			prompt,
		});
		return input.schema.parse(output);
	} catch (error) {
		if (!NoObjectGeneratedError.isInstance(error) || !error.text) {
			throw error;
		}

		try {
			const repairedJson = jsonrepair(error.text);
			return input.schema.parse(JSON.parse(repairedJson));
		} catch {
			throw error;
		}
	}
}

function createContentAiLanguageModel(
	aiSettings: ContentAiSettings,
): LanguageModel | null {
	if (aiSettings.provider === "codex") {
		if (!aiSettings.codexModel) {
			throw new Error("Select a Codex model in AI Settings.");
		}
		return null;
	}

	if (aiSettings.provider === "gemini") {
		if (!aiSettings.geminiApiKey) {
			throw new Error("Add a Gemini API key in AI Settings.");
		}

		const google = createGoogleGenerativeAI({
			apiKey: aiSettings.geminiApiKey,
		});
		return google(aiSettings.geminiModel);
	}

	if (aiSettings.provider === "openrouter") {
		if (!aiSettings.openrouterApiKey) {
			throw new Error("Add an OpenRouter API key in AI Settings.");
		}

		if (!aiSettings.openrouterModel) {
			throw new Error("Select an OpenRouter model in AI Settings.");
		}

		const openrouter = createOpenAI({
			apiKey: aiSettings.openrouterApiKey,
			baseURL: "https://openrouter.ai/api/v1",
			headers: {
				"HTTP-Referer": "https://clipse.local",
				"X-Title": "ClipSE",
			},
			name: "openrouter",
		});
		return openrouter.chat(aiSettings.openrouterModel);
	}

	if (!aiSettings.openaiApiKey) {
		throw new Error("Add an OpenAI API key in AI Settings.");
	}

	const openai = createOpenAI({
		apiKey: aiSettings.openaiApiKey,
		baseURL: aiSettings.openaiBaseUrl || undefined,
	});
	return aiSettings.openaiBaseUrl
		? openai.chat(aiSettings.openaiModel)
		: openai(aiSettings.openaiModel);
}

export async function generateClipCandidatesFromTranscription(input: {
	video: ContentVideo;
	transcription: ContentTranscription;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<GeneratedClipCandidate[]> {
	const aiSettings = await contentAiSettingsRepository.get();
	const chunks = buildAnalysisChunks(
		input.transcription.segments,
		input.video.durationSeconds,
	);

	const buildPrompt = (chunk: AnalysisChunk) => {
		const chunkDurationSeconds = chunk.endSeconds - chunk.startSeconds;
		const targetClipCount = Math.min(
			env.CLIPSE_MAX_CLIPS_PER_VIDEO,
			Math.max(3, Math.round(chunkDurationSeconds / 360)),
		);

		return `You are a clip strategist building self-contained short-form clips from a long-form source video.

Find the strongest sections for a clip channel. A strong clip is a complete viewer-value unit: the question/setup is clear, the payoff is understandable, and the ending lands without requiring the surrounding video.

Prioritize:
- question-and-answer moments where the host asks a clear question and the guest gives a useful or surprising answer
- specific explainers, calculations, examples, comparisons, lists, practical tips, mistakes to avoid, demonstrations, audience questions, or named frameworks/tools
- moments with a clear hook, tension, contrarian claim, myth correction, actionable advice, or memorable phrasing
- clean beginnings that include the question/setup and clean endings that complete the thought
- clips that can stand alone in the same language as the transcript
- titles and hooks that improve click-through without becoming misleading
- do not generate transcript excerpts or editor notes for each clip

Avoid:
- broad topic summaries that combine multiple questions or unrelated subtopics
- clips that start mid-sentence or after the context-setting question
- clips that end before the answer/payoff is complete
- near-duplicate ideas, generic introductions, housekeeping, or low-value transitions
- timestamps outside this analysis batch

Clip boundaries:
- Start where the setup/question begins, not at the punchline.
- End after the answer, example, or recommendation resolves.
- Each clip should usually be 35-150 seconds. Up to 210 seconds is acceptable for a dense answer that cannot be split cleanly.

Return about ${targetClipCount} candidates from this batch, with higher scores only for clips that are self-contained, specific, and likely to perform.
Only use timestamps inside this analysis batch:
${formatContentTimestamp(chunk.startSeconds)} - ${formatContentTimestamp(chunk.endSeconds)}

VIDEO TITLE:
${input.video.title}

OPTIONAL TOPIC GUIDANCE:
${input.video.analysisPrompt || "No extra topic guidance supplied."}

TRANSCRIPT:
${buildTimestampedTranscript(chunk.segments)}`;
	};

	const model = createContentAiLanguageModel(aiSettings);

	const candidates: GeneratedClipCandidate[] = [];
	for (const chunk of chunks) {
		if (chunk.segments.length === 0) {
			await input.onProgress?.(((chunk.index + 1) / chunks.length) * 100);
			continue;
		}

		const object = await withAiRetry(() =>
			generateContentAiObject({
				model,
				aiSettings,
				schema: clipAnalysisSchema,
				prompt: buildPrompt(chunk),
				jsonInstructions: `{
  "clips": [
    {
      "title": "string",
      "hook": "string",
      "summary": "string",
      "rationale": "string",
      "startSeconds": number,
      "endSeconds": number,
      "score": number,
      "tags": ["string"]
    }
  ]
}`,
			}),
		);

		candidates.push(
			...object.clips.map((candidate) => {
				const normalizedCandidate = normalizeClipCandidate(
					candidate,
					input.video.durationSeconds,
				);

				return {
					...normalizedCandidate,
					summary: "",
					transcriptExcerpt: "",
				};
			}),
		);
		await input.onProgress?.(((chunk.index + 1) / chunks.length) * 100);
	}

	const selectedCandidates: GeneratedClipCandidate[] = [];
	for (const candidate of candidates.sort(
		(left, right) => right.score - left.score,
	)) {
		const overlapsSelectedCandidate = selectedCandidates.some(
			(selectedCandidate) =>
				candidate.startSeconds < selectedCandidate.endSeconds &&
				candidate.endSeconds > selectedCandidate.startSeconds,
		);

		if (!overlapsSelectedCandidate) {
			selectedCandidates.push(candidate);
		}

		if (selectedCandidates.length >= env.CLIPSE_MAX_CLIPS_PER_VIDEO) {
			break;
		}
	}

	return selectedCandidates.sort(
		(left, right) => left.startSeconds - right.startSeconds,
	);
}

export async function generateShortCandidatesFromTranscription(input: {
	video: ContentVideo;
	transcription: ContentTranscription;
	onProgress?: (progress: number) => Promise<void>;
}): Promise<GeneratedClipCandidate[]> {
	const aiSettings = await contentAiSettingsRepository.get();
	const chunks = buildAnalysisChunks(
		input.transcription.segments,
		input.video.durationSeconds,
	);

	const buildPrompt = (chunk: AnalysisChunk) => {
		const chunkDurationSeconds = chunk.endSeconds - chunk.startSeconds;
		const targetClipCount = Math.min(
			env.CLIPSE_MAX_SHORTS_PER_VIDEO,
			Math.max(4, Math.round(chunkDurationSeconds / 180)),
		);

		return `You are a short-form producer finding Shorts/Reels/TikTok cuts from a long-form source video.

Find clips that can stop a feed scroll quickly and deliver a complete payoff without extra context.

Prioritize:
- a strong first 1-3 seconds: surprising claim, direct question, tension, mistake, result, useful warning, or named takeaway
- single-idea moments that are easy to understand on a phone
- quick payoffs, practical examples, demonstrations, memorable phrases, contrasts, lists, or sharp explanations
- natural starts before the hook/setup and endings immediately after the payoff resolves
- clips that work as vertical short-form videos in the same language as the transcript

Avoid:
- slow introductions, broad summaries, rambling context, housekeeping, sponsor-like sections, and multi-topic clips
- clips that need earlier context to understand
- clips that start mid-sentence or end before the key takeaway lands
- near-duplicates and timestamps outside this analysis batch

Short boundaries:
- Each short should usually be 20-75 seconds.
- Prefer 25-60 seconds when the idea is complete.
- Keep every candidate tightly focused on one short-form idea.

Return about ${targetClipCount} candidates from this batch, with higher scores only for shorts likely to perform in Shorts/Reels/TikTok.
Only use timestamps inside this analysis batch:
${formatContentTimestamp(chunk.startSeconds)} - ${formatContentTimestamp(chunk.endSeconds)}

VIDEO TITLE:
${input.video.title}

OPTIONAL TOPIC GUIDANCE:
${input.video.analysisPrompt || "No extra topic guidance supplied."}

TRANSCRIPT:
${buildTimestampedTranscript(chunk.segments)}`;
	};

	const model = createContentAiLanguageModel(aiSettings);

	const candidates: GeneratedClipCandidate[] = [];
	for (const chunk of chunks) {
		if (chunk.segments.length === 0) {
			await input.onProgress?.(((chunk.index + 1) / chunks.length) * 100);
			continue;
		}

		const object = await withAiRetry(() =>
			generateContentAiObject({
				model,
				aiSettings,
				schema: shortAnalysisSchema,
				prompt: buildPrompt(chunk),
				jsonInstructions: `{
  "clips": [
    {
      "title": "string",
      "hook": "string",
      "summary": "string",
      "rationale": "string",
      "startSeconds": number,
      "endSeconds": number,
      "score": number,
      "tags": ["string"]
    }
  ]
}`,
			}),
		);

		candidates.push(
			...object.clips.map((candidate) => {
				const normalizedCandidate = normalizeShortClipCandidate(
					candidate,
					input.video.durationSeconds,
				);

				return {
					...normalizedCandidate,
					summary: "",
					transcriptExcerpt: "",
				};
			}),
		);
		await input.onProgress?.(((chunk.index + 1) / chunks.length) * 100);
	}

	const selectedCandidates: GeneratedClipCandidate[] = [];
	for (const candidate of candidates.sort(
		(left, right) => right.score - left.score,
	)) {
		const overlapsSelectedCandidate = selectedCandidates.some(
			(selectedCandidate) =>
				candidate.startSeconds < selectedCandidate.endSeconds &&
				candidate.endSeconds > selectedCandidate.startSeconds,
		);

		if (!overlapsSelectedCandidate) {
			selectedCandidates.push(candidate);
		}

		if (selectedCandidates.length >= env.CLIPSE_MAX_SHORTS_PER_VIDEO) {
			break;
		}
	}

	return selectedCandidates.sort(
		(left, right) => left.startSeconds - right.startSeconds,
	);
}

export async function generateClipAndChapterStrategyFromTranscription(input: {
	video: ContentVideo;
	transcription: ContentTranscription;
	generateClips?: boolean;
	generateShorts?: boolean;
	generateChapters?: boolean;
	existingClips?: GeneratedClipCandidate[];
	existingShorts?: GeneratedClipCandidate[];
	onProgress?: (progress: number) => Promise<void>;
}): Promise<{
	clips: GeneratedClipCandidate[];
	shorts: GeneratedClipCandidate[];
	chapters: GeneratedChapter[];
}> {
	const shouldGenerateClips = input.generateClips ?? true;
	const shouldGenerateShorts = input.generateShorts ?? false;
	const shouldGenerateChapters = input.generateChapters ?? true;
	const analysisProgressSpan = shouldGenerateChapters ? 55 : 100;
	let completedAnalysisSteps = 0;
	const analysisStepCount = Math.max(
		1,
		[shouldGenerateClips, shouldGenerateShorts].filter(Boolean).length,
	);
	const clips = shouldGenerateClips
		? await generateClipCandidatesFromTranscription({
				...input,
				onProgress: async (progress) =>
					input.onProgress?.(
						((completedAnalysisSteps + progress / 100) / analysisStepCount) *
							analysisProgressSpan,
					),
			})
		: (input.existingClips ?? []);
	if (shouldGenerateClips) {
		completedAnalysisSteps += 1;
	}
	const shorts = shouldGenerateShorts
		? await generateShortCandidatesFromTranscription({
				...input,
				onProgress: async (progress) =>
					input.onProgress?.(
						((completedAnalysisSteps + progress / 100) / analysisStepCount) *
							analysisProgressSpan,
					),
			})
		: (input.existingShorts ?? []);
	if (!shouldGenerateChapters) {
		await input.onProgress?.(100);
		return { clips, shorts, chapters: [] };
	}
	await input.onProgress?.(58);

	const aiSettings = await contentAiSettingsRepository.get();
	const model = createContentAiLanguageModel(aiSettings);

	const transcriptDurationSeconds =
		input.video.durationSeconds ??
		Math.max(0, ...input.transcription.segments.map((segment) => segment.end));
	const targetChapterCount = Math.min(
		60,
		Math.max(8, Math.round(transcriptDurationSeconds / 150)),
	);

	const prompt = `Create detailed YouTube chapters from the timestamped transcript.

Use this process:
1. Treat this as a viewer navigation aid, not a high-level summary. Capture question boundaries, named subtopics, demonstrations, examples, recommendations, audience questions, calls to action, and closing announcements.
2. For interview, panel, podcast, tutorial, or Q&A content, create a new chapter when the host asks a new question or the speaker starts answering a distinct subtopic, even if it is part of the same broad theme.
3. Aim for about ${targetChapterCount} chapters for this video. For videos longer than 30 minutes, most chapters should be 1-4 minutes long. A chapter longer than 6 minutes is acceptable only when the transcript stays on one uninterrupted idea.
4. Prefer specific chapter titles grounded in the transcript. Preserve meaningful terms, proper names, tools, places, dates, domain-specific labels, and named frameworks. If the transcript contains a clear question, the chapter title may be that question.
5. Avoid merging adjacent questions into one broad chapter. Split examples, calculations, comparisons, positive/negative lists, practical recommendations, audience Q&A, and contact/promotion sections when they begin at different timestamps.
6. Chapter boundaries must start where the topic setup or question begins, not where the best quote happens.
7. Chapter 1 must start at 00:00. Keep all timestamps within the transcript and keep chapters in chronological order.
8. Use the generated clip candidates only as optional importance anchors. They should not reduce chapter detail or force chapters to match clip boundaries.

Output requirements:
- Return between ${Math.max(6, targetChapterCount - 8)} and ${Math.min(80, targetChapterCount + 12)} chapters unless the transcript genuinely has fewer topic changes.
- Titles should be concise but descriptive enough for YouTube chapters.
- Use the same language as the transcript.
- Each chapter summary should explain the specific subject covered in that segment.

VIDEO TITLE:
${input.video.title}

OPTIONAL TOPIC GUIDANCE:
${input.video.analysisPrompt || "No extra topic guidance supplied."}

GENERATED CLIP ANCHORS:
${clips
	.map(
		(clip, index) =>
			`${index}: [${formatContentTimestamp(clip.startSeconds)} - ${formatContentTimestamp(clip.endSeconds)}] ${clip.title} | ${clip.summary}`,
	)
	.join("\n")}

TRANSCRIPT:
${buildTimestampedTranscript(input.transcription.segments)}`;

	const object = await withAiRetry(() =>
		generateContentAiObject({
			model,
			aiSettings,
			schema: chapterAnalysisSchema,
			prompt,
			jsonInstructions: `{
  "chapters": [
    {
      "title": "string",
      "summary": "string",
      "startSeconds": number,
      "endSeconds": number
    }
  ]
}`,
		}),
	);
	await input.onProgress?.(100);

	const duration = input.video.durationSeconds;
	const chapters = object.chapters
		.map((chapter, index) => ({
			...chapter,
			startSeconds: index === 0 ? 0 : Math.max(0, chapter.startSeconds),
			endSeconds: duration
				? Math.min(duration, chapter.endSeconds)
				: chapter.endSeconds,
		}))
		.filter((chapter) => chapter.endSeconds > chapter.startSeconds)
		.sort((left, right) => left.startSeconds - right.startSeconds);

	return { clips, shorts, chapters };
}

export async function generateClipMetadataForTranscriptRange(input: {
	video: ContentVideo;
	transcription: ContentTranscription;
	startSeconds: number;
	endSeconds: number;
}): Promise<GeneratedClipCandidate> {
	const aiSettings = await contentAiSettingsRepository.get();
	const model = createContentAiLanguageModel(aiSettings);

	const rangeSegments = input.transcription.segments.filter(
		(segment) =>
			segment.end >= input.startSeconds && segment.start <= input.endSeconds,
	);
	const transcriptExcerpt = buildTranscriptExcerpt(
		input.transcription.segments,
		input.startSeconds,
		input.endSeconds,
	);

	if (!rangeSegments.length || !transcriptExcerpt) {
		throw new Error("No transcript text found for this clip range.");
	}

	const prompt = `Analyze this selected clip range and fill editor metadata for a short-form video clip.

Keep the timing fixed. Do not suggest new timestamps.
Write only:
- title: clear, concise, curiosity-driven, not misleading
- hook: one sentence that explains why this clip is worth watching
- rationale: short reason this range is a useful clip
- score: 0-100 based on standalone clip quality
- tags: concise topical tags

VIDEO TITLE:
${input.video.title}

OPTIONAL TOPIC GUIDANCE:
${input.video.analysisPrompt || "No extra topic guidance supplied."}

SELECTED RANGE:
${formatContentTimestamp(input.startSeconds)} - ${formatContentTimestamp(input.endSeconds)}

TRANSCRIPT RANGE:
${buildTimestampedTranscript(rangeSegments)}`;

	const object = await withAiRetry(() =>
		generateContentAiObject({
			model,
			aiSettings,
			schema: clipMetadataSchema,
			prompt,
			jsonInstructions: `{
  "title": "string",
  "hook": "string",
  "rationale": "string",
  "score": number,
  "tags": ["string"]
}`,
		}),
	);

	return normalizeClipCandidate(
		{
			...object,
			summary: "",
			transcriptExcerpt: "",
			startSeconds: input.startSeconds,
			endSeconds: input.endSeconds,
		},
		input.video.durationSeconds,
	);
}
