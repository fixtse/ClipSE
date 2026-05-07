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
		.max(env.CONTENTCLIP_MAX_CLIPS_PER_VIDEO),
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

async function generateContentAiObject<Schema extends z.ZodTypeAny>(input: {
	readonly model: LanguageModel;
	readonly provider: ContentAiSettings["provider"];
	readonly schema: Schema;
	readonly prompt: string;
	readonly jsonInstructions: string;
}): Promise<z.infer<Schema>> {
	const model =
		typeof input.model === "string"
			? input.model
			: wrapJsonExtractingModel(input.model);
	const prompt = `${input.prompt}

Return only valid JSON. Do not wrap it in markdown. The JSON must match this shape:
${input.jsonInstructions}`;

	try {
		const { output } = await generateText({
			model,
			output: Output.object({
				schema: input.schema,
			}),
			prompt,
		});
		return output;
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
): LanguageModel {
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
				"HTTP-Referer": "https://contentclip.local",
				"X-Title": "ContentClip",
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
			env.CONTENTCLIP_MAX_CLIPS_PER_VIDEO,
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
				provider: aiSettings.provider,
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

		if (selectedCandidates.length >= env.CONTENTCLIP_MAX_CLIPS_PER_VIDEO) {
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
	generateChapters?: boolean;
	existingClips?: GeneratedClipCandidate[];
	onProgress?: (progress: number) => Promise<void>;
}): Promise<{ clips: GeneratedClipCandidate[]; chapters: GeneratedChapter[] }> {
	const shouldGenerateClips = input.generateClips ?? true;
	const shouldGenerateChapters = input.generateChapters ?? true;
	const clips = shouldGenerateClips
		? await generateClipCandidatesFromTranscription({
				...input,
				onProgress: async (progress) =>
					input.onProgress?.(
						shouldGenerateChapters ? progress * 0.55 : progress,
					),
			})
		: (input.existingClips ?? []);
	if (!shouldGenerateChapters) {
		await input.onProgress?.(100);
		return { clips, chapters: [] };
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
			provider: aiSettings.provider,
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

	return { clips, chapters };
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
			provider: aiSettings.provider,
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
