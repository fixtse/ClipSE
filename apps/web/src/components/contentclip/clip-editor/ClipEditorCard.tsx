"use client";

import {
	Check,
	ChevronsUpDown,
	Clipboard,
	Clock3,
	Download,
	FastForward,
	Gauge,
	LoaderCircle,
	Pause,
	Play,
	Redo2,
	RefreshCcw,
	Rewind,
	RotateCcw,
	Save,
	Scissors,
	Trash2,
	Undo2,
	Video,
} from "lucide-react";
import {
	forwardRef,
	useEffect,
	useImperativeHandle,
	useRef,
	useState,
} from "react";
import toast from "react-hot-toast";
import ReactPlayer from "react-player";
import { Badge } from "~/components/ui/badge";
import { Button } from "~/components/ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "~/components/ui/card";
import {
	Command,
	CommandEmpty,
	CommandGroup,
	CommandInput,
	CommandItem,
	CommandList,
} from "~/components/ui/command";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "~/components/ui/dialog";
import { Input } from "~/components/ui/input";
import {
	Popover,
	PopoverContent,
	PopoverTrigger,
} from "~/components/ui/popover";
import { Progress } from "~/components/ui/progress";
import { Slider } from "~/components/ui/slider";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "~/components/ui/tabs";
import { Textarea } from "~/components/ui/textarea";
import { useTranslations } from "~/i18n/provider";
import { cn } from "~/lib/utils";
import {
	type ClipDraftState,
	pushClipDraftUndoSnapshot,
	redoClipDraft,
	undoClipDraft,
} from "~/modules/content-clips/application/clip-draft";
import {
	formatTimecode,
	roundToFrame,
} from "~/modules/content-clips/application/clip-timing";
import type { ContentAiModelOption } from "~/modules/content-settings/domain/content-ai-models";
import {
	type ClipItem,
	formatDuration,
	getStatusLabel,
} from "~/modules/content-videos/application/content-clip-dashboard-view";
import {
	buildClipSaveInput,
	canGenerateDraftMetadata,
	commitEndTimecode,
	commitStartTimecode,
	getBoundedClipTime,
	getBoundedPlayerSeekTime,
	getClipPreviewWindow,
	hasClipDraftChanges,
	isClipRendering,
} from "./clip-editor-state";

const PLAYBACK_RATES = [1, 1.25, 1.5, 1.75, 2] as const;
type PlaybackRate = (typeof PLAYBACK_RATES)[number];
type GeneratedClipMetadataResult = Pick<
	ClipItem,
	"title" | "hook" | "summary" | "startSeconds" | "endSeconds"
>;

interface ClipEditorCardProps {
	clip: ClipItem;
	maxDurationSeconds: number;
	frameRate: number | null;
	currentTime: number;
	sourceUrl: string | null;
	mutationPending: boolean;
	onSave: (input: {
		id: string;
		title: string;
		hook: string;
		summary: string;
		startSeconds: number;
		endSeconds: number;
	}) => Promise<void>;
	onAiGenerate: (input: {
		clipId: string;
		startSeconds: number;
		endSeconds: number;
	}) => Promise<GeneratedClipMetadataResult | undefined>;
	onRender: (clipId: string) => Promise<void>;
	onDelete: (clipId: string) => Promise<void>;
}

interface ModelComboboxProps {
	options: ContentAiModelOption[];
	isLoading: boolean;
	value: string;
	onChange: (value: string) => void;
}

export function ModelCombobox({
	options,
	isLoading,
	value,
	onChange,
}: ModelComboboxProps) {
	const t = useTranslations();
	const [open, setOpen] = useState(false);
	const listRef = useRef<HTMLDivElement | null>(null);
	const selectedOption = options.find((option) => option.value === value);

	return (
		<Popover onOpenChange={setOpen} open={open}>
			<PopoverTrigger asChild>
				<Button
					aria-expanded={open}
					className="w-full justify-between border-white/10 bg-slate-900/75 text-slate-100 hover:bg-slate-900"
					role="combobox"
					variant="outline"
				>
					{selectedOption?.label ??
						(value || t("workspace.modelCombobox.select"))}
					<ChevronsUpDown className="h-4 w-4 opacity-60" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="start"
				className="w-[--radix-popover-trigger-width] overflow-hidden border-white/10 bg-slate-950 p-0 text-slate-100"
			>
				<Command className="bg-slate-950 text-slate-100">
					<CommandInput placeholder={t("workspace.modelCombobox.search")} />
					<CommandList
						className="max-h-72 overflow-y-auto overscroll-contain"
						onWheelCapture={(event) => {
							const list = listRef.current;
							if (!list || list.scrollHeight <= list.clientHeight) {
								return;
							}

							event.preventDefault();
							event.stopPropagation();
							list.scrollTop += event.deltaY;
						}}
						ref={listRef}
					>
						<CommandEmpty>
							{isLoading
								? t("workspace.modelCombobox.loading")
								: t("workspace.modelCombobox.empty")}
						</CommandEmpty>
						<CommandGroup>
							{options.map((option) => (
								<CommandItem
									key={option.value}
									onSelect={() => {
										onChange(option.value);
										setOpen(false);
									}}
									value={`${option.label} ${option.value}`}
								>
									<Check
										className={cn(
											"h-4 w-4",
											value === option.value ? "opacity-100" : "opacity-0",
										)}
									/>
									<span>{option.label}</span>
									<span className="ml-auto text-slate-500 text-xs">
										{option.value}
									</span>
								</CommandItem>
							))}
						</CommandGroup>
					</CommandList>
				</Command>
			</PopoverContent>
		</Popover>
	);
}

function PlaybackSpeedButton({
	value,
	onChange,
}: {
	value: PlaybackRate;
	onChange: (value: PlaybackRate) => void;
}) {
	const t = useTranslations();

	return (
		<Popover>
			<PopoverTrigger asChild>
				<Button
					aria-label={t("workspace.clipEditor.playbackSpeed")}
					className="h-9 w-9 border-white/10 bg-slate-950/75 p-0 text-slate-100 shadow-md backdrop-blur hover:bg-slate-900"
					size="icon"
					title={t("workspace.clipEditor.playbackSpeed")}
					variant="outline"
				>
					<Gauge className="h-4 w-4" />
				</Button>
			</PopoverTrigger>
			<PopoverContent
				align="end"
				className="w-28 border-white/10 bg-slate-950 p-1 text-slate-100"
			>
				<div className="grid gap-1">
					{PLAYBACK_RATES.map((rate) => (
						<Button
							className={cn(
								"h-8 justify-between border-white/10 px-2 text-xs",
								value === rate
									? "border-yellow-200/40 bg-yellow-200/20 text-yellow-50 hover:bg-yellow-200/25"
									: "bg-white/6 text-slate-100 hover:bg-white/10",
							)}
							key={rate}
							onClick={() => onChange(rate)}
							size="sm"
							variant="outline"
						>
							{rate}x{value === rate ? <Check className="h-3.5 w-3.5" /> : null}
						</Button>
					))}
				</div>
			</PopoverContent>
		</Popover>
	);
}

interface ClipPreviewPlayerProps {
	sourceUrl: string;
	renderedUrl?: string | null;
	startSeconds: number;
	endSeconds: number;
}

function ClipPreviewPlayer({
	sourceUrl,
	renderedUrl,
	startSeconds,
	endSeconds,
}: ClipPreviewPlayerProps) {
	const t = useTranslations();
	const playerRef = useRef<HTMLVideoElement | null>(null);
	const [isPlaying, setIsPlaying] = useState(false);
	const [elapsedSeconds, setElapsedSeconds] = useState(0);
	const [renderedDurationSeconds, setRenderedDurationSeconds] = useState<
		number | null
	>(null);
	const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);
	const { clipStartSeconds, durationSeconds, clipEndSeconds, previewUrl } =
		getClipPreviewWindow({
			sourceUrl,
			renderedUrl,
			startSeconds,
			endSeconds,
			renderedDurationSeconds,
		});

	function applyPlaybackRate(
		player: HTMLVideoElement | null = playerRef.current,
	) {
		if (player && player.playbackRate !== playbackRate) {
			player.playbackRate = playbackRate;
		}
	}

	useEffect(() => {
		const player = playerRef.current;
		if (player && player.playbackRate !== playbackRate) {
			player.playbackRate = playbackRate;
		}
	}, [playbackRate]);

	function seekWithinClip(nextElapsedSeconds: number) {
		const player = playerRef.current;
		const boundedElapsed = Math.max(
			0,
			Math.min(durationSeconds, nextElapsedSeconds),
		);
		setElapsedSeconds(boundedElapsed);

		if (player) {
			player.currentTime = clipStartSeconds + boundedElapsed;
		}
	}

	function playClip() {
		const player = playerRef.current;
		if (!player) {
			return;
		}

		if (
			player.currentTime < clipStartSeconds ||
			player.currentTime >= clipEndSeconds
		) {
			player.currentTime = clipStartSeconds;
			setElapsedSeconds(0);
		}

		applyPlaybackRate(player);
		void player.play().then(() => setIsPlaying(true));
	}

	function pauseClip() {
		const player = playerRef.current;
		player?.pause();
		setIsPlaying(false);
	}

	return (
		<div className="overflow-hidden rounded-md border border-white/10 bg-black">
			<ReactPlayer
				className="aspect-video bg-black"
				controls={false}
				onLoadedMetadata={(event) => {
					applyPlaybackRate(event.currentTarget);
					if (renderedUrl) {
						setRenderedDurationSeconds(event.currentTarget.duration);
					}
				}}
				onPause={() => setIsPlaying(false)}
				onPlay={() => {
					const player = playerRef.current;
					if (!player) {
						return;
					}

					applyPlaybackRate(player);
					if (
						player.currentTime < clipStartSeconds ||
						player.currentTime >= clipEndSeconds
					) {
						player.currentTime = clipStartSeconds;
						setElapsedSeconds(0);
					}
					setIsPlaying(true);
				}}
				onRateChange={(event) => applyPlaybackRate(event.currentTarget)}
				onTimeUpdate={(event) => {
					applyPlaybackRate(event.currentTarget);
					const absoluteTime = event.currentTarget.currentTime;
					if (absoluteTime >= clipEndSeconds) {
						event.currentTarget.pause();
						event.currentTarget.currentTime = clipStartSeconds;
						setElapsedSeconds(0);
						setIsPlaying(false);
						return;
					}

					setElapsedSeconds(Math.max(0, absoluteTime - clipStartSeconds));
				}}
				preload="metadata"
				ref={playerRef}
				src={previewUrl}
				style={{ width: "100%", height: "auto" }}
				width="100%"
			/>
			<div className="space-y-3 border-white/10 border-t bg-slate-950 px-3 py-3">
				<div className="flex items-center gap-3">
					<Button
						aria-label={
							isPlaying
								? t("workspace.clipEditor.pauseClip")
								: t("workspace.clipEditor.playClip")
						}
						className="h-9 w-9 shrink-0 border-white/10 bg-white/6 p-0 text-slate-100 hover:bg-white/10"
						onClick={isPlaying ? pauseClip : playClip}
						size="sm"
						variant="outline"
					>
						{isPlaying ? (
							<Pause className="h-4 w-4" />
						) : (
							<Play className="h-4 w-4" />
						)}
					</Button>
					<Slider
						className="min-w-0 flex-1"
						max={durationSeconds}
						min={0}
						onValueChange={(value) => {
							seekWithinClip(value[0] ?? 0);
						}}
						step={0.1}
						value={[Math.min(elapsedSeconds, durationSeconds)]}
					/>
					<p className="w-28 text-right text-slate-300 text-xs tabular-nums">
						{formatTimecode(elapsedSeconds)} / {formatTimecode(durationSeconds)}
					</p>
					<PlaybackSpeedButton
						onChange={setPlaybackRate}
						value={playbackRate}
					/>
				</div>
			</div>
		</div>
	);
}

interface ClipFullVideoPlayerProps {
	sourceUrl: string;
	initialSeconds: number;
	onTimeChange: (seconds: number) => void;
}

interface ClipFullVideoPlayerHandle {
	seekTo: (seconds: number) => void;
}

const ClipFullVideoPlayer = forwardRef<
	ClipFullVideoPlayerHandle,
	ClipFullVideoPlayerProps
>(function ClipFullVideoPlayer(
	{ sourceUrl, initialSeconds, onTimeChange },
	ref,
) {
	const playerRef = useRef<HTMLVideoElement | null>(null);
	const [playbackRate, setPlaybackRate] = useState<PlaybackRate>(1);

	function applyPlaybackRate(
		player: HTMLVideoElement | null = playerRef.current,
	) {
		if (player && player.playbackRate !== playbackRate) {
			player.playbackRate = playbackRate;
		}
	}

	useImperativeHandle(
		ref,
		() => ({
			seekTo(seconds: number) {
				const player = playerRef.current;
				if (!player) {
					return;
				}

				const boundedTime = getBoundedPlayerSeekTime({
					seconds,
					durationSeconds: player.duration,
				});
				player.currentTime = boundedTime;
				onTimeChange(boundedTime);
			},
		}),
		[onTimeChange],
	);

	useEffect(() => {
		const player = playerRef.current;
		if (player && player.playbackRate !== playbackRate) {
			player.playbackRate = playbackRate;
		}
	}, [playbackRate]);

	return (
		<div className="overflow-hidden rounded-md border border-white/10 bg-black">
			<div className="relative">
				<ReactPlayer
					className="aspect-video bg-black"
					controls
					onLoadedMetadata={(event) => {
						const player = event.currentTarget;
						const boundedTime = getBoundedPlayerSeekTime({
							seconds: initialSeconds,
							durationSeconds: player.duration,
						});
						applyPlaybackRate(player);
						player.currentTime = boundedTime;
						onTimeChange(boundedTime);
					}}
					onPlay={(event) => applyPlaybackRate(event.currentTarget)}
					onRateChange={(event) => applyPlaybackRate(event.currentTarget)}
					onTimeUpdate={(event) => {
						applyPlaybackRate(event.currentTarget);
						onTimeChange(event.currentTarget.currentTime);
					}}
					preload="metadata"
					ref={playerRef}
					src={sourceUrl}
					style={{ width: "100%", height: "auto" }}
					width="100%"
				/>
				<div className="absolute top-2 right-2">
					<PlaybackSpeedButton
						onChange={setPlaybackRate}
						value={playbackRate}
					/>
				</div>
			</div>
		</div>
	);
});

export function ClipEditorCard({
	clip,
	maxDurationSeconds,
	frameRate,
	currentTime,
	sourceUrl,
	mutationPending,
	onSave,
	onAiGenerate,
	onRender,
	onDelete,
}: ClipEditorCardProps) {
	const t = useTranslations();
	const [title, setTitle] = useState(clip.title);
	const [hook, setHook] = useState(clip.hook);
	const [summary, setSummary] = useState(clip.summary);
	const [startSeconds, setStartSeconds] = useState(clip.startSeconds);
	const [endSeconds, setEndSeconds] = useState(clip.endSeconds);
	const [startDraft, setStartDraft] = useState(
		formatTimecode(clip.startSeconds),
	);
	const [endDraft, setEndDraft] = useState(formatTimecode(clip.endSeconds));
	const [undoStack, setUndoStack] = useState<ClipDraftState[]>([]);
	const [redoStack, setRedoStack] = useState<ClipDraftState[]>([]);
	const [localPlayerTime, setLocalPlayerTime] = useState(clip.startSeconds);
	const [sourceSeekStepSeconds, setSourceSeekStepSeconds] = useState(5);
	const [deleteDialogOpen, setDeleteDialogOpen] = useState(false);
	const [aiGenerateDialogOpen, setAiGenerateDialogOpen] = useState(false);
	const [downloadedAt, setDownloadedAt] = useState(clip.downloadedAt);
	const activeClipIdRef = useRef(clip.id);
	const sourcePlayerRef = useRef<ClipFullVideoPlayerHandle | null>(null);
	const oneSecondStep = 1;
	const currentDraft: ClipDraftState = {
		title,
		hook,
		summary,
		startSeconds,
		endSeconds,
	};

	function applyDraftState(nextState: ClipDraftState) {
		setTitle(nextState.title);
		setHook(nextState.hook);
		setSummary(nextState.summary);
		setStartSeconds(nextState.startSeconds);
		setEndSeconds(nextState.endSeconds);
		setStartDraft(formatTimecode(nextState.startSeconds));
		setEndDraft(formatTimecode(nextState.endSeconds));
	}

	function pushUndoSnapshot() {
		const nextHistory = pushClipDraftUndoSnapshot(
			{ undoStack, redoStack },
			currentDraft,
		);
		setUndoStack(nextHistory.undoStack);
		setRedoStack(nextHistory.redoStack);
	}

	function updateDraft(nextState: Partial<ClipDraftState>) {
		pushUndoSnapshot();
		applyDraftState({
			...currentDraft,
			...nextState,
		});
	}

	function undoEdit() {
		const result = undoClipDraft({ undoStack, redoStack }, currentDraft);
		if (!result) {
			return;
		}

		setUndoStack(result.history.undoStack);
		setRedoStack(result.history.redoStack);
		applyDraftState(result.draft);
	}

	function redoEdit() {
		const result = redoClipDraft({ undoStack, redoStack }, currentDraft);
		if (!result) {
			return;
		}

		setUndoStack(result.history.undoStack);
		setRedoStack(result.history.redoStack);
		applyDraftState(result.draft);
	}

	function cancelEdits() {
		applyDraftState({
			title: clip.title,
			hook: clip.hook,
			summary: clip.summary,
			startSeconds: clip.startSeconds,
			endSeconds: clip.endSeconds,
		});
		setUndoStack([]);
		setRedoStack([]);
	}

	function seekSourcePlayer(seconds: number) {
		const boundedTime = getBoundedClipTime({ seconds, maxDurationSeconds });
		sourcePlayerRef.current?.seekTo(boundedTime);
		setLocalPlayerTime(boundedTime);
	}

	function seekSourcePlayerByStep(direction: -1 | 1) {
		seekSourcePlayer(localPlayerTime + direction * sourceSeekStepSeconds);
	}

	async function generateAiMetadata() {
		const updatedClip = await onAiGenerate({
			clipId: clip.id,
			startSeconds,
			endSeconds,
		});

		if (!updatedClip) {
			return;
		}

		applyDraftState({
			title: updatedClip.title,
			hook: updatedClip.hook,
			summary: updatedClip.summary,
			startSeconds: updatedClip.startSeconds,
			endSeconds: updatedClip.endSeconds,
		});
	}

	async function copyDraftValue(value: string) {
		const trimmedValue = value.trim();
		if (!trimmedValue) {
			return;
		}

		await navigator.clipboard.writeText(trimmedValue);
		toast.success(t("workspace.toasts.copied"));
	}

	function commitStartDraft(value: string) {
		const nextStartSeconds = commitStartTimecode({
			value,
			currentStartSeconds: startSeconds,
			currentEndSeconds: endSeconds,
			frameRate,
		});
		if (nextStartSeconds === startSeconds) {
			setStartDraft(formatTimecode(startSeconds));
			return;
		}

		updateDraft({
			startSeconds: nextStartSeconds,
		});
	}

	function commitEndDraft(value: string) {
		const nextEndSeconds = commitEndTimecode({
			value,
			currentStartSeconds: startSeconds,
			currentEndSeconds: endSeconds,
			maxDurationSeconds,
			frameRate,
		});
		if (nextEndSeconds === endSeconds) {
			setEndDraft(formatTimecode(endSeconds));
			return;
		}

		updateDraft({
			endSeconds: nextEndSeconds,
		});
	}

	useEffect(() => {
		if (activeClipIdRef.current === clip.id) {
			return;
		}

		activeClipIdRef.current = clip.id;
		setTitle(clip.title);
		setHook(clip.hook);
		setSummary(clip.summary);
		setStartSeconds(clip.startSeconds);
		setEndSeconds(clip.endSeconds);
		setStartDraft(formatTimecode(clip.startSeconds));
		setEndDraft(formatTimecode(clip.endSeconds));
		setLocalPlayerTime(clip.startSeconds);
		setDownloadedAt(clip.downloadedAt);
		setUndoStack([]);
		setRedoStack([]);
	}, [clip]);

	useEffect(() => {
		setDownloadedAt(clip.downloadedAt);
	}, [clip.downloadedAt]);

	useEffect(() => {
		setStartDraft(formatTimecode(startSeconds));
	}, [startSeconds]);

	useEffect(() => {
		setEndDraft(formatTimecode(endSeconds));
	}, [endSeconds]);

	const hasChanges = hasClipDraftChanges(currentDraft, clip);
	const isRendering = isClipRendering(clip);
	const isManualClip = clip.rationale === "Manual clip";
	const canAiGenerate = canGenerateDraftMetadata({
		clip,
		mutationPending,
		isRendering,
		startSeconds,
		endSeconds,
	});
	const iconButtonClass =
		"h-9 w-9 border-white/10 bg-white/6 p-0 text-slate-200 hover:bg-white/10";

	return (
		<Card className="overflow-hidden rounded-md border-white/10 bg-slate-950/65 shadow-none">
			<CardHeader className="gap-3 border-white/10 border-b">
				<div className="flex flex-wrap items-start justify-between gap-3">
					<div className="space-y-2">
						<div className="flex flex-wrap items-center gap-2">
							<Badge className="border-white/10 bg-white/6 text-[11px] text-slate-200 uppercase tracking-[0.2em]">
								{getStatusLabel(clip.status, t)}
							</Badge>
							<Badge className="border-orange-300/20 bg-orange-300/10 text-orange-100">
								{formatDuration(endSeconds - startSeconds, t("common.pending"))}
							</Badge>
							<Badge className="border-sky-300/20 bg-sky-300/10 text-sky-100">
								{t("workspace.clipEditor.score", { score: clip.score })}
							</Badge>
						</div>
						<CardTitle className="font-semibold text-white text-xl">
							{clip.title}
						</CardTitle>
						{clip.rationale ? (
							<CardDescription className="max-w-2xl text-slate-300 leading-6">
								{clip.rationale}
							</CardDescription>
						) : null}
					</div>
					<div className="flex gap-2">
						<Button
							className="border-orange-300/25 bg-orange-400/15 text-orange-50 hover:bg-orange-400/20"
							disabled={mutationPending || hasChanges || isRendering}
							onClick={() => void onRender(clip.id)}
							size="sm"
						>
							{clip.status === "queued" || clip.status === "rendering" ? (
								<>
									<LoaderCircle className="h-4 w-4 animate-spin" />
									{t("workspace.clipEditor.exporting")}
								</>
							) : (
								<>
									<Scissors className="h-4 w-4" />
									{t("workspace.clipEditor.exportMp4")}
								</>
							)}
						</Button>
						{isManualClip ? (
							<Button
								className="border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15"
								disabled={!canAiGenerate}
								onClick={() => setAiGenerateDialogOpen(true)}
								size="sm"
								variant="outline"
							>
								<RefreshCcw className="h-4 w-4" />
								{t("workspace.clipEditor.aiGenerate")}
							</Button>
						) : null}
						<Button
							className="border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
							disabled={mutationPending || isRendering}
							onClick={() => setDeleteDialogOpen(true)}
							size="sm"
							variant="outline"
						>
							<Trash2 className="h-4 w-4" />
							{t("workspace.clipEditor.delete")}
						</Button>
					</div>
				</div>
			</CardHeader>
			<CardContent className="grid gap-6 py-6 lg:grid-cols-[1.2fr_0.8fr]">
				<div className="space-y-5">
					<div className="space-y-3 rounded-md border border-white/8 bg-white/4 p-4">
						<div className="flex items-center justify-between">
							<p className="font-medium text-slate-100 text-sm uppercase tracking-[0.18em]">
								{t("workspace.clipEditor.inOut")}
							</p>
							<p className="text-slate-400 text-xs">
								{t("workspace.clipEditor.range", {
									start: formatTimecode(startSeconds),
									end: formatTimecode(endSeconds),
								})}
							</p>
						</div>
						{sourceUrl ? (
							<Tabs className="space-y-3" defaultValue="source">
								<div className="flex items-center justify-between gap-3">
									<TabsList className="grid h-9 grid-cols-2 border border-white/10 bg-slate-900/80">
										<TabsTrigger value="source">
											{t("workspace.clipEditor.source")}
										</TabsTrigger>
										<TabsTrigger value="clip">
											{t("workspace.clipEditor.clip")}
										</TabsTrigger>
									</TabsList>
									<div className="flex items-center gap-1.5">
										<Button
											aria-label={t("workspace.clipEditor.undo")}
											className={iconButtonClass}
											disabled={!undoStack.length || mutationPending}
											onClick={undoEdit}
											size="icon"
											title={t("workspace.clipEditor.undo")}
											variant="outline"
										>
											<Undo2 className="h-3.5 w-3.5" />
										</Button>
										<Button
											aria-label={t("workspace.clipEditor.redo")}
											className={iconButtonClass}
											disabled={!redoStack.length || mutationPending}
											onClick={redoEdit}
											size="icon"
											title={t("workspace.clipEditor.redo")}
											variant="outline"
										>
											<Redo2 className="h-3.5 w-3.5" />
										</Button>
										<Button
											aria-label={t("workspace.clipEditor.cancel")}
											className={cn(
												"disabled:!border-white/10 disabled:!bg-white/6 h-9 w-9 p-0 disabled:text-slate-400",
												hasChanges && !mutationPending
													? "!border-rose-300/25 !bg-rose-300/12 hover:!bg-rose-300/18 text-rose-50"
													: "border-white/10 bg-white/6 text-slate-400",
											)}
											disabled={!hasChanges || mutationPending}
											onClick={cancelEdits}
											size="icon"
											title={t("workspace.clipEditor.cancel")}
											variant="outline"
										>
											<RotateCcw className="h-3.5 w-3.5" />
										</Button>
										<Button
											aria-label={t("workspace.clipEditor.save")}
											className="h-9 w-9 border-teal-300/20 bg-teal-300/10 p-0 text-teal-100 hover:bg-teal-300/15"
											disabled={!hasChanges || mutationPending}
											onClick={() =>
												void onSave(buildClipSaveInput(clip.id, currentDraft))
											}
											size="icon"
											title={t("workspace.clipEditor.save")}
										>
											<Save className="h-3.5 w-3.5" />
										</Button>
									</div>
								</div>
								<TabsContent className="mt-0" value="source">
									<div className="space-y-3">
										<ClipFullVideoPlayer
											initialSeconds={startSeconds}
											onTimeChange={setLocalPlayerTime}
											ref={sourcePlayerRef}
											sourceUrl={sourceUrl}
										/>
										<div className="space-y-2 rounded-md border border-white/8 bg-white/4 p-3">
											<div className="flex flex-wrap items-center justify-center gap-2">
												<div className="flex items-center gap-2 rounded-md border border-white/8 bg-slate-950/45 px-2 py-1.5">
													<span className="text-slate-400 text-xs uppercase tracking-[0.14em]">
														{t("workspace.clipEditor.step")}
													</span>
													<Input
														className="h-8 w-20 border-white/10 bg-slate-900/70 text-white"
														min={1}
														onChange={(event) => {
															const nextValue = Number.parseInt(
																event.target.value,
																10,
															);
															if (!Number.isFinite(nextValue)) {
																return;
															}
															setSourceSeekStepSeconds(
																Math.max(1, Math.min(3600, nextValue)),
															);
														}}
														step={1}
														type="number"
														value={sourceSeekStepSeconds}
													/>
													<span className="text-slate-400 text-xs">
														{t("workspace.clipEditor.secondsAbbrev")}
													</span>
												</div>
												<Button
													className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
													onClick={() => seekSourcePlayerByStep(-1)}
													size="sm"
													variant="outline"
												>
													<Rewind className="h-3.5 w-3.5" />-
													{sourceSeekStepSeconds}s
												</Button>
												<Button
													className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
													onClick={() => seekSourcePlayerByStep(1)}
													size="sm"
													variant="outline"
												>
													<FastForward className="h-3.5 w-3.5" />+
													{sourceSeekStepSeconds}s
												</Button>
											</div>
											<div className="mx-auto grid w-full max-w-md grid-cols-2 gap-2">
												<Button
													className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
													onClick={() => seekSourcePlayer(startSeconds)}
													size="sm"
													variant="outline"
												>
													<RotateCcw className="h-3.5 w-3.5" />
													{t("workspace.clipEditor.playerToStart")}
												</Button>
												<Button
													className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
													onClick={() => seekSourcePlayer(endSeconds)}
													size="sm"
													variant="outline"
												>
													<Clock3 className="h-3.5 w-3.5" />
													{t("workspace.clipEditor.playerToEnd")}
												</Button>
											</div>
										</div>
									</div>
								</TabsContent>
								<TabsContent className="mt-0" value="clip">
									<ClipPreviewPlayer
										endSeconds={endSeconds}
										renderedUrl={clip.sourceUrl}
										sourceUrl={sourceUrl}
										startSeconds={startSeconds}
									/>
								</TabsContent>
							</Tabs>
						) : (
							<div className="flex aspect-video items-center justify-center rounded-md border border-white/10 border-dashed bg-white/4 text-slate-400 text-sm">
								{t("workspace.clipEditor.sourcePending")}
							</div>
						)}
						<div className="grid gap-3 md:grid-cols-2">
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
										{t("workspace.clipEditor.clipStart")}
									</p>
									<Button
										className="h-7 border-white/10 bg-white/6 px-2 text-slate-200 hover:bg-white/10"
										onClick={() => {
											const boundedTime = roundToFrame(
												Math.max(0, localPlayerTime || currentTime),
												frameRate,
											);
											if (boundedTime < endSeconds) {
												updateDraft({ startSeconds: boundedTime });
											}
										}}
										size="xs"
										variant="outline"
									>
										<Video className="h-3.5 w-3.5" />
										{t("workspace.clipEditor.setIn")}
									</Button>
								</div>
								<Input
									className="border-white/10 bg-slate-900/70 text-white"
									onBlur={(event) => commitStartDraft(event.target.value)}
									onChange={(event) => setStartDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											commitStartDraft(event.currentTarget.value);
										}
									}}
									placeholder="0:00"
									value={startDraft}
								/>
							</div>
							<div className="space-y-2">
								<div className="flex items-center justify-between gap-2">
									<p className="text-slate-400 text-xs uppercase tracking-[0.16em]">
										{t("workspace.clipEditor.clipEnd")}
									</p>
									<Button
										className="h-7 border-white/10 bg-white/6 px-2 text-slate-200 hover:bg-white/10"
										onClick={() => {
											const boundedTime = roundToFrame(
												Math.min(
													maxDurationSeconds,
													localPlayerTime || currentTime,
												),
												frameRate,
											);
											if (boundedTime > startSeconds) {
												updateDraft({ endSeconds: boundedTime });
											}
										}}
										size="xs"
										variant="outline"
									>
										<Video className="h-3.5 w-3.5" />
										{t("workspace.clipEditor.setOut")}
									</Button>
								</div>
								<Input
									className="border-white/10 bg-slate-900/70 text-white"
									onBlur={(event) => commitEndDraft(event.target.value)}
									onChange={(event) => setEndDraft(event.target.value)}
									onKeyDown={(event) => {
										if (event.key === "Enter") {
											commitEndDraft(event.currentTarget.value);
										}
									}}
									placeholder="1:30"
									value={endDraft}
								/>
							</div>
						</div>
						<div className="flex flex-wrap items-center justify-center gap-2">
							<div className="flex flex-wrap items-center justify-center gap-2">
								<Button
									className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
									onClick={() =>
										updateDraft({
											startSeconds: roundToFrame(
												Math.max(0, startSeconds - oneSecondStep),
												frameRate,
											),
										})
									}
									size="sm"
									variant="outline"
								>
									<Clock3 className="h-3.5 w-3.5" />
									{t("workspace.clipEditor.inMinus")}
								</Button>
								<Button
									className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
									onClick={() =>
										updateDraft({
											startSeconds: roundToFrame(
												Math.min(
													endSeconds - oneSecondStep,
													startSeconds + oneSecondStep,
												),
												frameRate,
											),
										})
									}
									size="sm"
									variant="outline"
								>
									<Clock3 className="h-3.5 w-3.5" />
									{t("workspace.clipEditor.inPlus")}
								</Button>
							</div>
							<div className="h-8 w-px bg-white/10" />
							<div className="flex flex-wrap items-center justify-center gap-2">
								<Button
									className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
									onClick={() =>
										updateDraft({
											endSeconds: roundToFrame(
												Math.max(
													startSeconds + oneSecondStep,
													endSeconds - oneSecondStep,
												),
												frameRate,
											),
										})
									}
									size="sm"
									variant="outline"
								>
									<Clock3 className="h-3.5 w-3.5" />
									{t("workspace.clipEditor.outMinus")}
								</Button>
								<Button
									className="border-white/10 bg-white/6 text-slate-200 hover:bg-white/10"
									onClick={() =>
										updateDraft({
											endSeconds: roundToFrame(
												Math.min(
													maxDurationSeconds,
													endSeconds + oneSecondStep,
												),
												frameRate,
											),
										})
									}
									size="sm"
									variant="outline"
								>
									<Clock3 className="h-3.5 w-3.5" />
									{t("workspace.clipEditor.outPlus")}
								</Button>
							</div>
						</div>
					</div>
				</div>
				<div className="space-y-4">
					<div className="space-y-4 rounded-md border border-white/8 bg-white/4 p-4">
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
									{t("workspace.clipEditor.clipTitle")}
								</p>
								<div className="flex items-center gap-2">
									<Button
										aria-label={t("workspace.clipEditor.copyTitle")}
										className={iconButtonClass}
										disabled={!title.trim()}
										onClick={() => void copyDraftValue(title)}
										size="icon"
										title={t("workspace.clipEditor.copyTitle")}
										variant="outline"
									>
										<Clipboard className="h-3.5 w-3.5" />
									</Button>
								</div>
							</div>
							<Textarea
								className="min-h-16 resize-y border-white/10 bg-slate-900/70 text-white"
								onChange={(event) => updateDraft({ title: event.target.value })}
								value={title}
							/>
						</div>
						<div className="space-y-2">
							<div className="flex items-center justify-between gap-2">
								<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
									{t("workspace.clipEditor.hook")}
								</p>
								<Button
									aria-label={t("workspace.clipEditor.copyHook")}
									className={iconButtonClass}
									disabled={!hook.trim()}
									onClick={() => void copyDraftValue(hook)}
									size="icon"
									title={t("workspace.clipEditor.copyHook")}
									variant="outline"
								>
									<Clipboard className="h-3.5 w-3.5" />
								</Button>
							</div>
							<Textarea
								className="min-h-16 resize-y border-white/10 bg-slate-900/70 text-white"
								onChange={(event) => updateDraft({ hook: event.target.value })}
								value={hook}
							/>
						</div>
						<div className="space-y-2">
							<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
								{t("workspace.clipEditor.editorNotes")}
							</p>
							<Textarea
								className="min-h-24 resize-y border-white/10 bg-slate-900/70 text-white"
								onChange={(event) =>
									updateDraft({ summary: event.target.value })
								}
								value={summary}
							/>
						</div>
					</div>
					{clip.renderJob ? (
						<div className="space-y-2 rounded-md border border-orange-300/15 bg-orange-300/10 p-3">
							<div className="flex items-center justify-between text-orange-100 text-xs">
								<span>
									{t("workspace.clipEditor.renderStatus", {
										status: getStatusLabel(clip.renderJob.status, t),
									})}
								</span>
								<span>{clip.renderJob.progress}%</span>
							</div>
							<Progress value={clip.renderJob.progress} />
							{clip.renderJob.message ? (
								<p className="text-orange-100/80 text-xs">
									{clip.renderJob.message}
								</p>
							) : null}
						</div>
					) : null}
					{clip.downloadUrl ? (
						<div className="space-y-3 rounded-md border border-white/8 bg-white/4 p-4">
							<div className="flex items-center justify-between gap-3">
								<p className="font-medium text-slate-100 text-xs uppercase tracking-[0.18em]">
									{t("workspace.clipEditor.mp4File")}
								</p>
								<Badge
									className={
										downloadedAt
											? "border-teal-300/20 bg-teal-300/10 text-teal-100"
											: "border-amber-300/20 bg-amber-300/10 text-amber-100"
									}
								>
									{downloadedAt ? (
										<Check className="h-3.5 w-3.5" />
									) : (
										<Clock3 className="h-3.5 w-3.5" />
									)}
									{downloadedAt
										? t("workspace.clipEditor.downloaded")
										: t("workspace.clipEditor.notDownloaded")}
								</Badge>
							</div>
							<Button
								asChild
								className="w-full bg-white text-slate-950 hover:bg-slate-100"
							>
								<a
									href={clip.downloadUrl}
									onClick={() => setDownloadedAt(new Date())}
								>
									<Download className="h-4 w-4" />
									{t("workspace.clipEditor.downloadMp4")}
								</a>
							</Button>
						</div>
					) : null}
				</div>
			</CardContent>
			<Dialog
				onOpenChange={setAiGenerateDialogOpen}
				open={aiGenerateDialogOpen}
			>
				<DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-md">
					<DialogHeader>
						<DialogTitle>
							{t("workspace.clipEditor.aiGenerateTitle")}
						</DialogTitle>
						<DialogDescription className="text-slate-300">
							{t("workspace.clipEditor.aiGenerateDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="rounded-md border border-sky-300/20 bg-sky-300/10 p-3">
							<p className="font-medium text-sky-50">{clip.title}</p>
							<p className="mt-1 text-sky-100/80 text-sm">
								{formatTimecode(startSeconds)} to {formatTimecode(endSeconds)}
							</p>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								className="border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
								disabled={mutationPending}
								onClick={() => setAiGenerateDialogOpen(false)}
								variant="outline"
							>
								{t("workspace.clipEditor.cancel")}
							</Button>
							<Button
								className="border-sky-300/20 bg-sky-300/10 text-sky-100 hover:bg-sky-300/15"
								disabled={!canAiGenerate}
								onClick={() => {
									setAiGenerateDialogOpen(false);
									void generateAiMetadata();
								}}
								variant="outline"
							>
								<RefreshCcw className="h-4 w-4" />
								{t("workspace.clipEditor.aiGenerate")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
			<Dialog onOpenChange={setDeleteDialogOpen} open={deleteDialogOpen}>
				<DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-md">
					<DialogHeader>
						<DialogTitle>{t("workspace.clipEditor.deleteTitle")}</DialogTitle>
						<DialogDescription className="text-slate-300">
							{t("workspace.clipEditor.deleteDescription")}
						</DialogDescription>
					</DialogHeader>
					<div className="space-y-4">
						<div className="rounded-md border border-rose-300/20 bg-rose-300/10 p-3">
							<p className="font-medium text-rose-50">{clip.title}</p>
							<p className="mt-1 text-rose-100/80 text-sm">
								{formatTimecode(startSeconds)} to {formatTimecode(endSeconds)}
							</p>
						</div>
						<div className="grid gap-2 sm:grid-cols-2">
							<Button
								className="border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
								disabled={mutationPending}
								onClick={() => setDeleteDialogOpen(false)}
								variant="outline"
							>
								{t("workspace.clipEditor.cancel")}
							</Button>
							<Button
								className="border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
								disabled={mutationPending}
								onClick={() => {
									setDeleteDialogOpen(false);
									void onDelete(clip.id);
								}}
								variant="outline"
							>
								<Trash2 className="h-4 w-4" />
								{t("workspace.clipEditor.delete")}
							</Button>
						</div>
					</div>
				</DialogContent>
			</Dialog>
		</Card>
	);
}
