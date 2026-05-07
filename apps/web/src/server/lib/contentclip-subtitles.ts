import type { ContentTranscriptionSegment } from "~/modules/content-transcriptions/domain/content-transcription.valueobject";

export interface RenderSubtitleCue {
	startSeconds: number;
	endSeconds: number;
	text: string;
	words: RenderSubtitleWord[];
}

export interface RenderSubtitleWord {
	startSeconds: number;
	endSeconds: number;
	text: string;
}

const SUBTITLE_WORDS_PER_CUE = 4;
const MIN_CUE_DURATION_SECONDS = 0.45;

function escapeAssText(text: string): string {
	return text
		.replaceAll("\\", "\\\\")
		.replaceAll("{", "\\{")
		.replaceAll("}", "\\}")
		.replace(/\s+/g, " ")
		.trim();
}

function formatAssTimestamp(totalSeconds: number): string {
	const safeSeconds = Math.max(0, totalSeconds);
	const hours = Math.floor(safeSeconds / 3600);
	const minutes = Math.floor((safeSeconds % 3600) / 60);
	const seconds = Math.floor(safeSeconds % 60);
	const centiseconds = Math.floor((safeSeconds % 1) * 100);

	return `${hours}:${minutes.toString().padStart(2, "0")}:${seconds
		.toString()
		.padStart(2, "0")}.${centiseconds.toString().padStart(2, "0")}`;
}

function chunkWords(text: string): string[] {
	const words = text.split(/\s+/).filter(Boolean);
	const chunks: string[] = [];

	for (let index = 0; index < words.length; index += SUBTITLE_WORDS_PER_CUE) {
		chunks.push(words.slice(index, index + SUBTITLE_WORDS_PER_CUE).join(" "));
	}

	return chunks;
}

function splitWords(text: string): string[] {
	return text.split(/\s+/).filter(Boolean);
}

export function buildRenderSubtitleCues(input: {
	segments: readonly ContentTranscriptionSegment[];
	clipStartSeconds: number;
	clipEndSeconds: number;
}): RenderSubtitleCue[] {
	const clipDurationSeconds = Math.max(
		0,
		input.clipEndSeconds - input.clipStartSeconds,
	);

	return input.segments.flatMap((segment) => {
		const startSeconds = Math.max(segment.start, input.clipStartSeconds);
		const endSeconds = Math.min(segment.end, input.clipEndSeconds);
		const durationSeconds = endSeconds - startSeconds;
		const words = splitWords(segment.text);
		const chunks = chunkWords(segment.text);

		if (durationSeconds <= 0 || chunks.length === 0 || words.length === 0) {
			return [];
		}

		const chunkDurationSeconds = durationSeconds / chunks.length;
		const wordDurationSeconds = durationSeconds / words.length;
		const timedWords = words.map((word, index) => ({
			startSeconds: Math.max(
				0,
				startSeconds - input.clipStartSeconds + wordDurationSeconds * index,
			),
			endSeconds: Math.min(
				clipDurationSeconds,
				index === words.length - 1
					? endSeconds - input.clipStartSeconds
					: startSeconds -
							input.clipStartSeconds +
							wordDurationSeconds * (index + 1),
			),
			text: word,
		}));

		return chunks.flatMap((chunk, index) => {
			const chunkStartWordIndex = index * SUBTITLE_WORDS_PER_CUE;
			const cueStartSeconds =
				startSeconds - input.clipStartSeconds + chunkDurationSeconds * index;
			const cueEndSeconds =
				index === chunks.length - 1
					? endSeconds - input.clipStartSeconds
					: cueStartSeconds + chunkDurationSeconds;

			if (
				cueStartSeconds >= clipDurationSeconds ||
				cueEndSeconds - cueStartSeconds < MIN_CUE_DURATION_SECONDS
			) {
				return [];
			}

			return {
				startSeconds: Math.max(0, cueStartSeconds),
				endSeconds: Math.min(clipDurationSeconds, cueEndSeconds),
				text: chunk,
				words: timedWords.slice(
					chunkStartWordIndex,
					chunkStartWordIndex + SUBTITLE_WORDS_PER_CUE,
				),
			};
		});
	});
}

export function buildAssSubtitleFile(
	cues: readonly RenderSubtitleCue[],
): string {
	const dialogue = cues
		.map(
			(cue) =>
				`Dialogue: 0,${formatAssTimestamp(cue.startSeconds)},${formatAssTimestamp(
					cue.endSeconds,
				)},TikTok,,0,0,0,,${escapeAssText(cue.text)}`,
		)
		.join("\n");

	return `[Script Info]
ScriptType: v4.00+
PlayResX: 1080
PlayResY: 1920
ScaledBorderAndShadow: yes

[V4+ Styles]
Format: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding
Style: TikTok,Arial,88,&H00FFFFFF,&H00FFFFFF,&H00000000,&H99000000,-1,0,0,0,100,100,0,0,1,7,0,2,72,72,220,1

[Events]
Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text
${dialogue}
`;
}
