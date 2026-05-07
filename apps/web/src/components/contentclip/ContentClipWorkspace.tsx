"use client";

import { AnimatePresence, motion } from "framer-motion";
import {
	ArrowRight,
	ChevronLeft,
	ChevronRight,
	Clapperboard,
	Clipboard,
	Clock3,
	Film,
	Languages,
	Link,
	LoaderCircle,
	Plus,
	RefreshCcw,
	RotateCcw,
	Save,
	Scissors,
	Search,
	Settings2,
	Trash2,
	Upload,
	Video,
} from "lucide-react";
import { useEffect, useRef, useState, useTransition } from "react";
import toast from "react-hot-toast";
import ReactPlayer from "react-player";
import { useTranslations } from "~/i18n/provider";
import { cn } from "~/lib/utils";
import { formatTimecode } from "~/modules/content-clips/application/clip-timing";
import type { ContentClipRenderAspectMode } from "~/modules/content-clips/domain/content-clip.valueobject";
import {
	getAudioLanguageOptions,
	getWhisperModelOptions,
} from "~/modules/content-settings/application/content-ai-settings-form";
import type { ContentAiProvider } from "~/modules/content-settings/domain/content-ai-models";
import type { ContentAiSettings } from "~/modules/content-settings/domain/content-ai-settings.valueobject";
import {
	buildLibraryVideoSignature,
	type ClipItem,
	filterLibraryVideos,
	filterTranscriptSegments,
	formatDuration,
	formatFileSize,
	formatJobTimestamp,
	getActiveVideoJobs,
	getClearableJobCount,
	getJobLabel,
	getJobMessage,
	getJobSubtitle,
	getStageClasses,
	getStageLabel,
	getStatusLabel,
	LIBRARY_VIDEOS_PER_PAGE,
	paginateLibraryVideos,
	SELECTED_CHANNEL_STORAGE_KEY,
} from "~/modules/content-videos/application/content-clip-dashboard-view";
import type { ContentClipDashboardVideo } from "~/modules/content-videos/application/get-content-clip-dashboard";
import { uploadContentVideoFile } from "~/modules/content-videos/application/upload-content-video-file";
import { createContentChannelAction } from "~/server/actions/content-channels/create-content-channel";
import {
	deleteContentChannelBumperAction,
	updateContentChannelBumperAction,
} from "~/server/actions/content-channels/update-content-channel-bumper";
import { createContentClipAction } from "~/server/actions/content-clips/create-content-clip";
import { deleteContentClipAction } from "~/server/actions/content-clips/delete-content-clip";
import { generateContentClipMetadataAction } from "~/server/actions/content-clips/generate-content-clip-metadata";
import { queueContentClipRenderAction } from "~/server/actions/content-clips/queue-content-clip-render";
import { queueContentVideoClipRendersAction } from "~/server/actions/content-clips/queue-content-video-clip-renders";
import { updateContentClipAction } from "~/server/actions/content-clips/update-content-clip";
import { clearFinishedContentJobsAction } from "~/server/actions/content-jobs/clear-finished-content-jobs";
import { updateContentAiSettingsAction } from "~/server/actions/content-settings/update-content-ai-settings";
import { createContentVideoDraftAction } from "~/server/actions/content-videos/create-content-video-draft";
import { createContentVideoUrlSourceAction } from "~/server/actions/content-videos/create-content-video-url-source";
import { deleteContentVideoAction } from "~/server/actions/content-videos/delete-content-video";
import { reanalyzeContentVideoAction } from "~/server/actions/content-videos/reanalyze-content-video";
import { retryContentVideoDownloadAction } from "~/server/actions/content-videos/retry-content-video-download";
import { updateContentVideoAction } from "~/server/actions/content-videos/update-content-video";
import { api } from "~/trpc/react";
import { Badge } from "../ui/badge";
import { Button } from "../ui/button";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "../ui/card";
import { Checkbox } from "../ui/checkbox";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "../ui/dialog";
import { Input } from "../ui/input";
import { Progress } from "../ui/progress";
import { ScrollArea } from "../ui/scroll-area";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "../ui/tabs";
import { Textarea } from "../ui/textarea";
import { ClipEditorCard, ModelCombobox } from "./clip-editor/ClipEditorCard";
import { LanguageSwitcher } from "./LanguageSwitcher";
import {
	useContentClipWorkspaceController,
	type WorkspaceTab,
} from "./useContentClipWorkspaceController";
import {
	buildWorkspaceBrowserUrl,
	getDashboardSelectedVideoId,
	getDashboardVideos,
	getManualClipTiming,
	getSelectedVideoFromDashboard,
	getWorkspaceTabFromBrowserUrl,
	getYoutubeChapterText,
	shouldShowFloatingJobButton as shouldDisplayFloatingJobButton,
} from "./workspace-state";

type DashboardVideo = ContentClipDashboardVideo;
type GeneratedClipMetadataResult = Pick<
	ClipItem,
	"title" | "hook" | "summary" | "startSeconds" | "endSeconds"
>;
type IntakeSourceTab = "file" | "url";
type WhisperModel = ContentAiSettings["whisperModel"];
type RenderOptionsState = {
	aspectMode: ContentClipRenderAspectMode;
	burnSubtitles: boolean;
};
type UploadMessageKey =
	| "workspace.intake.progress.idle"
	| "workspace.intake.progress.creatingUploadDraft"
	| "workspace.intake.progress.streamingSource"
	| "workspace.intake.progress.queuedForTranscription"
	| "workspace.intake.progress.creatingDownloadJob"
	| "workspace.intake.progress.queuedForDownload";

interface ContentClipWorkspaceProps {
	requestedVideoId?: string | null;
}

export function ContentClipWorkspace({
	requestedVideoId,
}: ContentClipWorkspaceProps) {
	const t = useTranslations();
	const utils = api.useUtils();
	const {
		selectedVideoId,
		setSelectedVideoId,
		selectedVideoChannelId,
		setSelectedVideoChannelId,
		selectedChannelId,
		setSelectedChannelId,
		workspaceTab,
		setWorkspaceTab,
	} = useContentClipWorkspaceController({ requestedVideoId });
	const [intakeSourceTab, setIntakeSourceTab] =
		useState<IntakeSourceTab>("file");
	const [uploadFileValue, setUploadFileValue] = useState<File | null>(null);
	const [sourceUrl, setSourceUrl] = useState("");
	const [uploadTitle, setUploadTitle] = useState("");
	const [uploadPrompt, setUploadPrompt] = useState("");
	const [uploadLanguage, setUploadLanguage] = useState("auto");
	const [isFileDragActive, setIsFileDragActive] = useState(false);
	const [uploadProgress, setUploadProgress] = useState(0);
	const [uploadMessageKey, setUploadMessageKey] = useState<UploadMessageKey>(
		"workspace.intake.progress.idle",
	);
	const [introFile, setIntroFile] = useState<File | null>(null);
	const [outroFile, setOutroFile] = useState<File | null>(null);
	const [bumperPreviewUrls, setBumperPreviewUrls] = useState<{
		readonly intro: string | null;
		readonly outro: string | null;
	}>({ intro: null, outro: null });
	const [activeBumperDropTarget, setActiveBumperDropTarget] = useState<
		"intro" | "outro" | null
	>(null);
	const [channelDialogOpen, setChannelDialogOpen] = useState(false);
	const [channelName, setChannelName] = useState("");
	const [channelLogo, setChannelLogo] = useState<File | null>(null);
	const [channelLogoPreviewUrl, setChannelLogoPreviewUrl] = useState<
		string | null
	>(null);
	const [isChannelLogoDragActive, setIsChannelLogoDragActive] = useState(false);
	const [videoTitleDraft, setVideoTitleDraft] = useState("");
	const [videoPromptDraft, setVideoPromptDraft] = useState("");
	const [videoTitleDraftDirty, setVideoTitleDraftDirty] = useState(false);
	const [videoPromptDraftDirty, setVideoPromptDraftDirty] = useState(false);
	const [aiProvider, setAiProvider] = useState<ContentAiProvider>("openai");
	const [openaiApiKey, setOpenaiApiKey] = useState("");
	const [openaiBaseUrl, setOpenaiBaseUrl] = useState("");
	const [openaiModel, setOpenaiModel] = useState("gpt-4o-mini");
	const [geminiApiKey, setGeminiApiKey] = useState("");
	const [geminiModel, setGeminiModel] = useState("gemini-2.5-flash");
	const [openrouterApiKey, setOpenrouterApiKey] = useState("");
	const [openrouterModel, setOpenrouterModel] = useState("");
	const [whisperModel, setWhisperModel] = useState<WhisperModel>("medium");
	const [aiSettingsOpen, setAiSettingsOpen] = useState(false);
	const [aiGenerateOpen, setAiGenerateOpen] = useState(false);
	const [jobQueueOpen, setJobQueueOpen] = useState(false);
	const [generateClips, setGenerateClips] = useState(true);
	const [generateChapters, setGenerateChapters] = useState(true);
	const [renderOptions, setRenderOptions] = useState<RenderOptionsState>({
		aspectMode: "source",
		burnSubtitles: false,
	});
	const [deleteSourceId, setDeleteSourceId] = useState<string | null>(null);
	const [bumperMutationPosition, setBumperMutationPosition] = useState<
		"intro" | "outro" | null
	>(null);
	const [libraryVideos, setLibraryVideos] = useState<DashboardVideo[]>([]);
	const [librarySearch, setLibrarySearch] = useState("");
	const [libraryPage, setLibraryPage] = useState(1);
	const [currentTime, setCurrentTime] = useState(0);
	const [transcriptSearch, setTranscriptSearch] = useState("");
	const [isPending, startTransition] = useTransition();
	const fileInputRef = useRef<HTMLInputElement | null>(null);
	const channelLogoInputRef = useRef<HTMLInputElement | null>(null);
	const bumperPreviewUrlsRef = useRef(bumperPreviewUrls);
	const libraryVideoSignatureRef = useRef("");
	const videoDraftSourceIdRef = useRef<string | null>(null);
	const videoRef = useRef<HTMLVideoElement | null>(null);
	const dashboardSelectedVideoId = getDashboardSelectedVideoId({
		selectedVideoId,
		selectedChannelId,
		selectedVideoChannelId,
	});

	const dashboardQuery = api.contentClip.dashboard.useQuery(
		{
			selectedChannelId: selectedChannelId ?? undefined,
			selectedVideoId: dashboardSelectedVideoId,
		},
		{
			placeholderData: (previousData) => previousData,
			refetchInterval: (query) => {
				const selectedJobs = query.state.data?.selectedVideo?.jobs ?? [];
				const videos = query.state.data?.videos ?? [];
				return selectedJobs.some(
					(job) => job.status === "pending" || job.status === "running",
				) || videos.some((video) => video.activeJob)
					? 2000
					: 7000;
			},
		},
	);
	const aiSettingsQuery = api.contentClip.aiSettings.useQuery();
	const aiModelsQuery = api.contentClip.aiModels.useQuery(
		{
			provider: aiProvider,
		},
		{
			retry: false,
		},
	);

	const dashboardDataMatchesSelectedChannel =
		!selectedChannelId ||
		dashboardQuery.data?.selectedChannel?.id === selectedChannelId;
	const selectedVideo = getSelectedVideoFromDashboard({
		dataMatchesSelectedChannel: dashboardDataMatchesSelectedChannel,
		selectedVideo: dashboardQuery.data?.selectedVideo,
	});
	const selectedVideoRecord = selectedVideo?.video ?? null;
	const selectedChannel =
		dashboardDataMatchesSelectedChannel && dashboardQuery.data?.selectedChannel
			? dashboardQuery.data.selectedChannel
			: null;
	const selectedVideoJobs = selectedVideo?.jobs ?? [];
	const dashboardVideos = getDashboardVideos({
		dataMatchesSelectedChannel: dashboardDataMatchesSelectedChannel,
		videos: dashboardQuery.data?.videos,
	});
	const clearableSelectedVideoJobCount =
		getClearableJobCount(selectedVideoJobs);
	const activeVideoJobs = getActiveVideoJobs(dashboardVideos);
	const primaryActiveVideoJob = activeVideoJobs[0] ?? null;
	const hasActiveVideoJobs = activeVideoJobs.length > 0;
	const floatingJobProgress = primaryActiveVideoJob?.job.progress ?? 0;
	const shouldShowFloatingJobButton = shouldDisplayFloatingJobButton({
		workspaceTab,
		selectedVideoJobs,
		activeVideoJobCount: activeVideoJobs.length,
	});
	const deleteSource = deleteSourceId
		? (dashboardQuery.data?.videos.find(
				(video) => video.id === deleteSourceId,
			) ?? null)
		: null;
	const transcriptSegments = selectedVideo?.transcription?.segments ?? [];
	const youtubeChapterText = getYoutubeChapterText(selectedVideo);
	const filteredTranscriptSegments = filterTranscriptSegments(
		transcriptSegments,
		transcriptSearch,
	);
	const filteredLibraryVideos = filterLibraryVideos(
		libraryVideos,
		librarySearch,
	);
	const {
		pageCount: libraryPageCount,
		boundedPage: boundedLibraryPage,
		videos: paginatedLibraryVideos,
	} = paginateLibraryVideos(filteredLibraryVideos, libraryPage);
	const libraryVideoSignature = buildLibraryVideoSignature(dashboardVideos);

	useEffect(() => {
		const settings = aiSettingsQuery.data;
		if (!settings) {
			return;
		}

		setAiProvider(settings.provider);
		setOpenaiApiKey(settings.openaiApiKey);
		setOpenaiBaseUrl(settings.openaiBaseUrl);
		setOpenaiModel(settings.openaiModel);
		setGeminiApiKey(settings.geminiApiKey);
		setGeminiModel(settings.geminiModel);
		setOpenrouterApiKey(settings.openrouterApiKey);
		setOpenrouterModel(settings.openrouterModel);
		setWhisperModel(settings.whisperModel);
	}, [aiSettingsQuery.data]);

	useEffect(() => {
		if (!selectedChannelId && dashboardQuery.data?.selectedChannel?.id) {
			setSelectedChannelId(dashboardQuery.data.selectedChannel.id);
		}
	}, [
		dashboardQuery.data?.selectedChannel?.id,
		selectedChannelId,
		setSelectedChannelId,
	]);

	useEffect(() => {
		if (typeof window === "undefined" || !selectedChannelId) {
			return;
		}

		window.localStorage.setItem(
			SELECTED_CHANNEL_STORAGE_KEY,
			selectedChannelId,
		);
	}, [selectedChannelId]);

	useEffect(() => {
		const channels = dashboardQuery.data?.channels;
		if (!channels || !selectedChannelId) {
			return;
		}

		if (!channels.some((channel) => channel.id === selectedChannelId)) {
			window.localStorage.removeItem(SELECTED_CHANNEL_STORAGE_KEY);
			setSelectedChannelId(dashboardQuery.data?.selectedChannel?.id ?? null);
		}
	}, [dashboardQuery.data, selectedChannelId, setSelectedChannelId]);

	useEffect(() => {
		if (!dashboardQuery.data || !dashboardDataMatchesSelectedChannel) {
			return;
		}
		if (libraryVideoSignatureRef.current === libraryVideoSignature) {
			return;
		}

		libraryVideoSignatureRef.current = libraryVideoSignature;
		setLibraryVideos(dashboardQuery.data.videos);
	}, [
		dashboardDataMatchesSelectedChannel,
		dashboardQuery.data,
		libraryVideoSignature,
	]);

	useEffect(() => {
		if (libraryPage > libraryPageCount) {
			setLibraryPage(libraryPageCount);
		}
	}, [libraryPage, libraryPageCount]);

	useEffect(() => {
		if (
			dashboardDataMatchesSelectedChannel &&
			!selectedVideoId &&
			dashboardQuery.data?.selectedVideo?.video.id
		) {
			setSelectedVideoId(dashboardQuery.data.selectedVideo.video.id);
			setSelectedVideoChannelId(
				dashboardQuery.data.selectedVideo.video.channelId ?? null,
			);
		}
	}, [
		dashboardDataMatchesSelectedChannel,
		dashboardQuery.data,
		selectedVideoId,
		setSelectedVideoChannelId,
		setSelectedVideoId,
	]);

	useEffect(() => {
		const videos = dashboardDataMatchesSelectedChannel
			? dashboardQuery.data?.videos
			: null;
		if (!videos || !selectedVideoId) {
			return;
		}
		if (!videos.some((video) => video.id === selectedVideoId)) {
			setSelectedVideoId(videos[0]?.id ?? null);
			setSelectedVideoChannelId(videos[0]?.channelId ?? null);
		}
	}, [
		dashboardDataMatchesSelectedChannel,
		dashboardQuery.data?.videos,
		selectedVideoId,
		setSelectedVideoChannelId,
		setSelectedVideoId,
	]);

	useEffect(() => {
		if (!selectedVideoRecord) {
			videoDraftSourceIdRef.current = null;
			setVideoTitleDraft("");
			setVideoPromptDraft("");
			setVideoTitleDraftDirty(false);
			setVideoPromptDraftDirty(false);
			return;
		}

		if (videoDraftSourceIdRef.current !== selectedVideoRecord.id) {
			videoDraftSourceIdRef.current = selectedVideoRecord.id;
			setVideoTitleDraft(selectedVideoRecord.title);
			setVideoPromptDraft(selectedVideoRecord.analysisPrompt);
			setVideoTitleDraftDirty(false);
			setVideoPromptDraftDirty(false);
		} else {
			if (!videoTitleDraftDirty) {
				setVideoTitleDraft(selectedVideoRecord.title);
			}
			if (!videoPromptDraftDirty) {
				setVideoPromptDraft(selectedVideoRecord.analysisPrompt);
			}
		}
		setSelectedVideoChannelId(selectedVideoRecord.channelId);
	}, [
		selectedVideoRecord,
		setSelectedVideoChannelId,
		videoPromptDraftDirty,
		videoTitleDraftDirty,
	]);

	useEffect(() => {
		if (!channelLogo) {
			setChannelLogoPreviewUrl(null);
			return;
		}

		const objectUrl = URL.createObjectURL(channelLogo);
		setChannelLogoPreviewUrl(objectUrl);

		return () => URL.revokeObjectURL(objectUrl);
	}, [channelLogo]);

	useEffect(() => {
		bumperPreviewUrlsRef.current = bumperPreviewUrls;
	}, [bumperPreviewUrls]);

	useEffect(() => {
		return () => {
			for (const previewUrl of Object.values(bumperPreviewUrlsRef.current)) {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
			}
		};
	}, []);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		window.history.replaceState(
			null,
			"",
			buildWorkspaceBrowserUrl({
				locationHref: window.location.href,
				selectedVideoId,
				workspaceTab,
			}),
		);
	}, [selectedVideoId, workspaceTab]);

	useEffect(() => {
		if (typeof window === "undefined") {
			return;
		}

		const handlePopState = () => {
			const url = new URL(window.location.href);
			setSelectedVideoId(url.searchParams.get("videoId"));
			setSelectedVideoChannelId(null);
			setWorkspaceTab(getWorkspaceTabFromBrowserUrl(window.location.href));
		};

		window.addEventListener("popstate", handlePopState);
		return () => window.removeEventListener("popstate", handlePopState);
	}, [setSelectedVideoChannelId, setSelectedVideoId, setWorkspaceTab]);

	async function refreshDashboard() {
		await utils.contentClip.dashboard.invalidate();
	}

	function selectUploadFile(file: File | null) {
		if (!file) {
			return;
		}

		if (!file.type.startsWith("video/")) {
			toast.error(t("workspace.toasts.chooseVideoFile"));
			return;
		}

		setUploadFileValue(file);
	}

	function selectBumperFile(position: "intro" | "outro", file: File | null) {
		if (!file) {
			return;
		}

		if (!file.type.startsWith("video/")) {
			toast.error(t("workspace.toasts.chooseVideoFile"));
			return;
		}

		if (position === "intro") {
			setIntroFile(file);
		} else {
			setOutroFile(file);
		}

		setBumperPreviewUrls((current) => {
			const previousUrl = current[position];
			if (previousUrl) {
				URL.revokeObjectURL(previousUrl);
			}

			return {
				...current,
				[position]: URL.createObjectURL(file),
			};
		});
		setActiveBumperDropTarget(null);
	}

	function clearBumperFile(position: "intro" | "outro") {
		if (position === "intro") {
			setIntroFile(null);
		} else {
			setOutroFile(null);
		}

		setBumperPreviewUrls((current) => {
			const previousUrl = current[position];
			if (previousUrl) {
				URL.revokeObjectURL(previousUrl);
			}

			return {
				...current,
				[position]: null,
			};
		});
	}

	function clearSelectedBumperFiles() {
		setIntroFile(null);
		setOutroFile(null);
		setActiveBumperDropTarget(null);
		setBumperPreviewUrls((current) => {
			for (const previewUrl of Object.values(current)) {
				if (previewUrl) {
					URL.revokeObjectURL(previewUrl);
				}
			}

			return { intro: null, outro: null };
		});
	}

	function selectChannelLogo(file: File | null) {
		if (!file) {
			return;
		}

		if (!file.type.startsWith("image/")) {
			toast.error(t("workspace.toasts.chooseImageFile"));
			return;
		}

		setChannelLogo(file);
	}

	function removeChannelLogo() {
		setChannelLogo(null);
		setIsChannelLogoDragActive(false);
		if (channelLogoInputRef.current) {
			channelLogoInputRef.current.value = "";
		}
	}

	async function handleCreateChannel() {
		if (!channelName.trim()) {
			toast.error(t("workspace.toasts.enterChannelName"));
			return;
		}

		const formData = new FormData();
		formData.set("name", channelName.trim());
		if (channelLogo) {
			formData.set("logo", channelLogo);
		}

		const result = await createContentChannelAction(formData);
		if (!result.success) {
			toast.error(result.error);
			return;
		}

		setSelectedChannelId(result.data.id);
		setSelectedVideoId(null);
		setSelectedVideoChannelId(null);
		clearSelectedBumperFiles();
		setChannelName("");
		removeChannelLogo();
		setChannelDialogOpen(false);
		toast.success(t("workspace.toasts.channelCreated"));
		await refreshDashboard();
	}

	async function handleUpload() {
		if (!uploadFileValue) {
			toast.error(t("workspace.toasts.chooseSourceVideoFirst"));
			return;
		}

		setUploadProgress(3);
		setUploadMessageKey("workspace.intake.progress.creatingUploadDraft");

		const draft = await createContentVideoDraftAction({
			channelId: selectedChannel?.id ?? selectedChannelId ?? undefined,
			originalFilename: uploadFileValue.name,
			title: uploadTitle || undefined,
			analysisPrompt: uploadPrompt || undefined,
			languageHint: uploadLanguage,
			mimeType: uploadFileValue.type,
			sizeBytes: uploadFileValue.size,
		});

		if (!draft.success) {
			toast.error(draft.error);
			setUploadProgress(0);
			setUploadMessageKey("workspace.intake.progress.idle");
			return;
		}

		setUploadMessageKey("workspace.intake.progress.streamingSource");
		try {
			await uploadContentVideoFile(
				draft.data.id,
				uploadFileValue,
				(progress) => {
					setUploadProgress(progress);
				},
				t,
			);
		} catch (error) {
			console.error("Failed to upload source video:", error);
			const message =
				error instanceof Error
					? error.message
					: t("workspace.toasts.uploadFailed");
			toast.error(message);
			setUploadProgress(0);
			setUploadMessageKey("workspace.intake.progress.idle");
			return;
		}

		setUploadMessageKey("workspace.intake.progress.queuedForTranscription");
		setUploadProgress(100);
		setSelectedVideoId(draft.data.id);
		setSelectedVideoChannelId(draft.data.channelId);
		setUploadFileValue(null);
		setUploadTitle("");
		setUploadPrompt("");
		setUploadLanguage("auto");
		toast.success(t("workspace.toasts.uploadQueued"));
		await refreshDashboard();
	}

	async function handleUrlImport() {
		if (!sourceUrl.trim()) {
			toast.error(t("workspace.toasts.pasteVideoUrlFirst"));
			return;
		}

		setUploadProgress(5);
		setUploadMessageKey("workspace.intake.progress.creatingDownloadJob");

		const result = await createContentVideoUrlSourceAction({
			channelId: selectedChannel?.id ?? selectedChannelId ?? undefined,
			sourceUrl: sourceUrl.trim(),
			title: uploadTitle || undefined,
			analysisPrompt: uploadPrompt || undefined,
			languageHint: uploadLanguage,
		});

		if (!result.success) {
			toast.error(result.error);
			setUploadProgress(0);
			setUploadMessageKey("workspace.intake.progress.idle");
			return;
		}

		setSelectedVideoId(result.data.id);
		setSelectedVideoChannelId(result.data.channelId);
		setSourceUrl("");
		setUploadTitle("");
		setUploadPrompt("");
		setUploadLanguage("auto");
		setUploadProgress(100);
		setUploadMessageKey("workspace.intake.progress.queuedForDownload");
		toast.success(t("workspace.toasts.urlQueued"));
		await refreshDashboard();
	}

	async function handleSaveAiSettings() {
		const result = await updateContentAiSettingsAction({
			provider: aiProvider,
			openaiApiKey,
			openaiBaseUrl,
			openaiModel,
			geminiApiKey,
			geminiModel,
			openrouterApiKey,
			openrouterModel,
			whisperModel,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.aiSettingsSaved"));
		await utils.contentClip.aiSettings.invalidate();
		await utils.contentClip.aiModels.invalidate({
			provider: aiProvider,
		});
		setAiSettingsOpen(false);
	}

	async function handleSaveVideoSettings() {
		if (!selectedVideo) {
			return;
		}

		const result = await updateContentVideoAction({
			id: selectedVideo.video.id,
			title: videoTitleDraft,
			analysisPrompt: videoPromptDraft,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.videoBriefUpdated"));
		await refreshDashboard();
		setVideoTitleDraftDirty(false);
		setVideoPromptDraftDirty(false);
	}

	async function handleUploadBumper(position: "intro" | "outro") {
		if (!selectedChannel) {
			toast.error(t("workspace.toasts.selectChannelFirst"));
			return;
		}

		const file = position === "intro" ? introFile : outroFile;
		if (!file) {
			toast.error(
				t("workspace.toasts.choosePositionVideo", {
					position: t(
						position === "intro"
							? "workspace.bumpers.startVideoLower"
							: "workspace.bumpers.endVideoLower",
					),
				}),
			);
			return;
		}

		const formData = new FormData();
		formData.set("channelId", selectedChannel.id);
		formData.set("position", position);
		formData.set("file", file);

		setBumperMutationPosition(position);
		try {
			const result = await updateContentChannelBumperAction(formData);
			if (!result.success) {
				toast.error(result.error);
				return;
			}

			if (position === "intro") {
				setIntroFile(null);
			} else {
				setOutroFile(null);
			}

			toast.success(
				t("workspace.toasts.bumperSaved", {
					position: t(
						position === "intro"
							? "workspace.bumpers.startVideoLower"
							: "workspace.bumpers.endVideoLower",
					),
				}),
			);
			await refreshDashboard();
		} finally {
			setBumperMutationPosition(null);
		}
	}

	async function handleDeleteBumper(position: "intro" | "outro") {
		if (!selectedChannel) {
			return;
		}

		setBumperMutationPosition(position);
		try {
			const result = await deleteContentChannelBumperAction({
				channelId: selectedChannel.id,
				position,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(
				t("workspace.toasts.bumperRemoved", {
					position: t(
						position === "intro"
							? "workspace.bumpers.startVideoLower"
							: "workspace.bumpers.endVideoLower",
					),
				}),
			);
			await refreshDashboard();
		} finally {
			setBumperMutationPosition(null);
		}
	}

	async function handleAiGenerate() {
		if (!selectedVideo) {
			return;
		}

		if (!generateClips && !generateChapters) {
			toast.error(t("workspace.toasts.selectGenerationTargets"));
			return;
		}

		try {
			const result = await reanalyzeContentVideoAction({
				videoId: selectedVideo.video.id,
				analysisPrompt: videoPromptDraft,
				generateClips,
				generateChapters,
			});

			if (!result.success) {
				toast.error(result.error);
				return;
			}

			toast.success(t("workspace.toasts.aiGenerationQueued"));
			setAiGenerateOpen(false);
			await refreshDashboard();
		} catch (error) {
			console.error("Failed to submit AI generation request:", error);
			toast.error(t("workspace.toasts.aiGenerationFailed"));
		}
	}

	async function copyYoutubeChapters() {
		if (!youtubeChapterText) {
			toast.error(t("workspace.toasts.noChaptersToCopy"));
			return;
		}

		await navigator.clipboard.writeText(youtubeChapterText);
		toast.success(t("workspace.toasts.youtubeChaptersCopied"));
	}

	async function handleRetryVideo(videoId: string) {
		const result = await retryContentVideoDownloadAction({
			videoId,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.downloadRetryQueued"));
		await refreshDashboard();
	}

	async function handleDeleteSource(videoId: string) {
		const result = await deleteContentVideoAction({
			videoId,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		if (selectedVideoId === videoId) {
			setSelectedVideoId(null);
		}
		setDeleteSourceId(null);
		toast.success(t("workspace.toasts.sourceDeleted"));
		await refreshDashboard();
	}

	async function handleSaveClip(input: {
		id: string;
		title: string;
		hook: string;
		summary: string;
		startSeconds: number;
		endSeconds: number;
	}) {
		const result = await updateContentClipAction(input);
		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.clipTimingSaved"));
		await refreshDashboard();
	}

	async function handleGenerateClipMetadata(input: {
		clipId: string;
		startSeconds: number;
		endSeconds: number;
	}): Promise<GeneratedClipMetadataResult | undefined> {
		const result = await generateContentClipMetadataAction(input);
		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.clipMetadataGenerated"));
		await refreshDashboard();
		return result.data;
	}

	async function handleRenderClip(clipId: string) {
		const result = await queueContentClipRenderAction({
			clipId,
			...renderOptions,
			focusMode:
				renderOptions.aspectMode === "vertical9x16"
					? "auto-speaker"
					: undefined,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.renderJobQueued"));
		await refreshDashboard();
	}

	async function handleRenderAllClips(videoId: string) {
		const result = await queueContentVideoClipRendersAction({
			videoId,
			...renderOptions,
			focusMode:
				renderOptions.aspectMode === "vertical9x16"
					? "auto-speaker"
					: undefined,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(
			t("workspace.toasts.renderJobsQueued", {
				count: result.data.queuedCount,
			}),
		);
		await refreshDashboard();
	}

	async function handleClearFinishedJobs(videoId: string) {
		const result = await clearFinishedContentJobsAction({
			videoId,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(
			t("workspace.toasts.finishedJobsCleared", {
				count: result.data.clearedCount,
			}),
		);
		await refreshDashboard();
	}

	async function handleAddManualClip() {
		if (!selectedVideo) {
			return;
		}

		const { startSeconds, endSeconds } = getManualClipTiming({
			currentTime,
			durationSeconds: selectedVideo.video.durationSeconds,
			frameRate: selectedVideo.video.frameRate,
		});

		const result = await createContentClipAction({
			videoId: selectedVideo.video.id,
			title: t("workspace.toasts.manualClipTitle", {
				count: selectedVideo.clips.length + 1,
			}),
			hook: "",
			summary: "",
			startSeconds,
			endSeconds,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.manualClipAdded"));
		await refreshDashboard();
	}

	async function handleDeleteClip(clipId: string) {
		const result = await deleteContentClipAction({
			clipId,
		});

		if (!result.success) {
			toast.error(result.error);
			return;
		}

		toast.success(t("workspace.toasts.clipDeleted"));
		await refreshDashboard();
	}

	function seekVideo(seconds: number) {
		if (!videoRef.current) {
			return;
		}

		videoRef.current.currentTime = Math.max(0, seconds);
		void videoRef.current.play().catch(() => undefined);
	}

	const renderableClipCount =
		selectedVideo?.clips.filter(
			(clip) => clip.status !== "queued" && clip.status !== "rendering",
		).length ?? 0;

	const modelOptions = aiModelsQuery.data ?? [];
	const whisperModelOptions = getWhisperModelOptions(t);
	const selectedWhisperModelOption =
		whisperModelOptions.find((option) => option.value === whisperModel) ??
		whisperModelOptions[0];
	const audioLanguageOptions = getAudioLanguageOptions(t);
	const selectedChannelName =
		selectedChannel?.name ?? t("workspace.channels.select");
	const handleFloatingJobClick = () => {
		if (workspaceTab === "media") {
			setJobQueueOpen((open) => !open);
			return;
		}

		const targetVideo = primaryActiveVideoJob?.video;
		if (!targetVideo) {
			return;
		}

		setSelectedVideoId(targetVideo.id);
		setSelectedVideoChannelId(targetVideo.channelId);
		setWorkspaceTab("media");
		setJobQueueOpen(false);
	};
	const renderJobQueuePanel = () => (
		<div className="flex max-h-[min(72vh,36rem)] w-full flex-col overflow-hidden rounded-md border border-white/10 bg-slate-950/95 shadow-2xl shadow-black/40 backdrop-blur-xl">
			<div className="flex items-start justify-between gap-3 border-white/10 border-b p-4">
				<div className="min-w-0">
					<h2 className="font-semibold text-sm text-white">
						{t("workspace.queue.title")}
					</h2>
					<p className="text-slate-400 text-xs">
						{t("workspace.queue.description")}
					</p>
				</div>
				<Button
					aria-label={t("workspace.queue.clearFinished")}
					className="h-8 w-8 shrink-0 border-white/10 bg-white/5 p-0 text-slate-300 hover:bg-white/10 hover:text-white"
					disabled={
						!selectedVideo || !clearableSelectedVideoJobCount || isPending
					}
					onClick={() => {
						if (!selectedVideo) {
							return;
						}

						startTransition(() => {
							void handleClearFinishedJobs(selectedVideo.video.id);
						});
					}}
					size="icon"
					title={t("workspace.queue.clearFinished")}
					variant="outline"
				>
					<Trash2 className="h-4 w-4" />
				</Button>
			</div>
			<ScrollArea className="min-h-0 flex-1 overflow-y-auto">
				<div className="space-y-3 p-3">
					{selectedVideoJobs.length ? (
						selectedVideoJobs.map((job) => {
							const jobSubtitle = getJobSubtitle(
								job,
								selectedVideo?.clips ?? [],
							);
							const jobMessage = getJobMessage(job, t);
							const jobTimestamp = formatJobTimestamp(job.createdAt);

							return (
								<div
									className="rounded-md border border-white/8 bg-white/4 p-4"
									key={job.id}
								>
									<div className="flex min-w-0 items-start justify-between gap-3">
										<div className="min-w-0">
											<p className="font-medium text-slate-100 text-sm">
												{getJobLabel(job, t)}
											</p>
											{jobSubtitle ? (
												<p className="line-clamp-2 text-slate-400 text-xs">
													{jobSubtitle}
												</p>
											) : null}
										</div>
										<Badge className="shrink-0 border-white/10 bg-white/6 text-slate-200">
											{getStatusLabel(job.status, t)}
										</Badge>
									</div>
									<p className="mt-2 text-slate-500 text-xs">{jobTimestamp}</p>
									<div className="mt-3 space-y-2">
										<Progress value={job.progress} />
										<p className="text-right text-slate-500 text-xs">
											{job.progress}%
										</p>
										{jobMessage ? (
											<p className="line-clamp-2 text-slate-400 text-xs">
												{jobMessage}
											</p>
										) : null}
									</div>
								</div>
							);
						})
					) : activeVideoJobs.length ? (
						activeVideoJobs.map(({ job, video }) => (
							<button
								className="w-full rounded-md border border-white/8 bg-white/4 p-4 text-left transition hover:border-orange-300/30 hover:bg-orange-300/10"
								key={job.id}
								onClick={() => {
									setSelectedVideoId(video.id);
									setSelectedVideoChannelId(video.channelId);
									setJobQueueOpen(false);
								}}
								type="button"
							>
								<div className="flex min-w-0 items-start justify-between gap-3">
									<div className="min-w-0">
										<p className="truncate font-medium text-slate-100 text-sm">
											{video.title}
										</p>
										<p className="mt-1 text-slate-400 text-xs">
											{getJobLabel(job, t)}
										</p>
									</div>
									<Badge className="shrink-0 border-white/10 bg-white/6 text-slate-200">
										{getStatusLabel(job.status, t)}
									</Badge>
								</div>
								<div className="mt-3 space-y-2">
									<Progress value={job.progress} />
									<p className="text-right text-slate-500 text-xs">
										{job.progress}%
									</p>
								</div>
							</button>
						))
					) : (
						<div className="rounded-md border border-white/10 border-dashed bg-white/4 p-5 text-slate-400 text-sm">
							{t("workspace.queue.empty")}
						</div>
					)}
				</div>
			</ScrollArea>
		</div>
	);
	const floatingJobButton = shouldShowFloatingJobButton ? (
		<div className="fixed right-4 bottom-4 z-50 sm:right-6 sm:bottom-6">
			{workspaceTab === "media" ? (
				<>
					<AnimatePresence>
						{jobQueueOpen ? (
							<motion.div
								animate={{ opacity: 1, scale: 1, y: 0 }}
								className="absolute right-0 bottom-20 w-[calc(100vw-2rem)] max-w-[25rem] origin-bottom-right"
								exit={{ opacity: 0, scale: 0.96, y: 10 }}
								initial={{ opacity: 0, scale: 0.96, y: 10 }}
								transition={{ duration: 0.18, ease: "easeOut" }}
							>
								{renderJobQueuePanel()}
							</motion.div>
						) : null}
					</AnimatePresence>
					<Button
						aria-label={t("workspace.queue.title")}
						className="relative h-16 w-16 rounded-full border border-white/15 bg-slate-950 p-0 text-white shadow-2xl shadow-black/40 hover:bg-slate-900"
						onClick={handleFloatingJobClick}
						style={{
							background: hasActiveVideoJobs
								? `conic-gradient(rgb(251 146 60) ${floatingJobProgress * 3.6}deg, rgb(30 41 59) 0deg)`
								: "rgb(15 23 42)",
						}}
						type="button"
					>
						<span className="absolute inset-1 rounded-full bg-slate-950" />
						<span className="relative flex flex-col items-center justify-center leading-none">
							{hasActiveVideoJobs ? (
								<LoaderCircle
									className={cn(
										"h-5 w-5 text-orange-200",
										activeVideoJobs.length > 0 && "animate-spin",
									)}
								/>
							) : (
								<Clipboard className="h-5 w-5 text-slate-300" />
							)}
							{hasActiveVideoJobs ? (
								<span className="mt-1 font-semibold text-[0.68rem]">
									{floatingJobProgress}%
								</span>
							) : null}
						</span>
						{activeVideoJobs.length > 1 ? (
							<span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-950 bg-orange-300 px-1 font-semibold text-slate-950 text-xs">
								{activeVideoJobs.length}
							</span>
						) : null}
					</Button>
				</>
			) : (
				<Button
					aria-label={t("workspace.queue.title")}
					className="relative h-16 w-16 rounded-full border border-white/15 bg-slate-950 p-0 text-white shadow-2xl shadow-black/40 hover:bg-slate-900"
					onClick={handleFloatingJobClick}
					style={{
						background: `conic-gradient(rgb(251 146 60) ${floatingJobProgress * 3.6}deg, rgb(30 41 59) 0deg)`,
					}}
					type="button"
				>
					<span className="absolute inset-1 rounded-full bg-slate-950" />
					<span className="relative flex flex-col items-center justify-center leading-none">
						<LoaderCircle className="h-5 w-5 animate-spin text-orange-200" />
						<span className="mt-1 font-semibold text-[0.68rem]">
							{floatingJobProgress}%
						</span>
					</span>
					{activeVideoJobs.length > 1 ? (
						<span className="absolute -top-1 -right-1 flex h-6 min-w-6 items-center justify-center rounded-full border border-slate-950 bg-orange-300 px-1 font-semibold text-slate-950 text-xs">
							{activeVideoJobs.length}
						</span>
					) : null}
				</Button>
			)}
		</div>
	) : null;

	return (
		<div className="min-h-screen bg-slate-950 text-white">
			<div className="mx-auto flex max-w-[1680px] flex-col gap-4 px-4 py-4 sm:px-5">
				<header className="flex flex-wrap items-center justify-between gap-3 border-white/10 border-b pb-3">
					<div>
						<h1 className="font-semibold text-lg text-white">
							{t("workspace.header.title")}
						</h1>
						<p className="text-slate-400 text-sm">
							{t("workspace.header.subtitle")}
						</p>
					</div>
					<div className="flex flex-wrap items-center gap-3">
						<LanguageSwitcher />
						<div className="flex items-center gap-2">
							<Select
								onValueChange={(value) => {
									if (value === "__add_channel__") {
										setChannelDialogOpen(true);
										return;
									}
									setSelectedChannelId(value);
									setSelectedVideoId(null);
									setSelectedVideoChannelId(null);
									setLibraryPage(1);
									clearSelectedBumperFiles();
								}}
								value={selectedChannel?.id ?? selectedChannelId ?? ""}
							>
								<SelectTrigger className="w-[190px] border-white/10 bg-slate-900/75 text-white">
									<SelectValue placeholder={selectedChannelName} />
								</SelectTrigger>
								<SelectContent>
									{dashboardQuery.data?.channels.map((channel) => (
										<SelectItem key={channel.id} value={channel.id}>
											<span className="flex min-w-0 items-center gap-2">
												{channel.logoUrl ? (
													<>
														{/* biome-ignore lint/performance/noImgElement: small authenticated channel logo served by app route */}
														<img
															alt=""
															className="h-5 w-5 shrink-0 rounded-sm border border-white/10 bg-black object-contain"
															src={channel.logoUrl}
														/>
													</>
												) : (
													<span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-sm border border-white/10 bg-white/6">
														<Video className="h-3 w-3 text-slate-300" />
													</span>
												)}
												<span className="truncate">{channel.name}</span>
											</span>
										</SelectItem>
									))}
									<SelectItem value="__add_channel__">
										<span className="flex items-center gap-2">
											<Plus className="h-4 w-4" />
											{t("workspace.channels.add")}
										</span>
									</SelectItem>
								</SelectContent>
							</Select>
							<Dialog
								onOpenChange={setChannelDialogOpen}
								open={channelDialogOpen}
							>
								<DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-md">
									<DialogHeader>
										<DialogTitle>
											{t("workspace.channels.addTitle")}
										</DialogTitle>
										<DialogDescription className="text-slate-400">
											{t("workspace.channels.addDescription")}
										</DialogDescription>
									</DialogHeader>
									<div className="space-y-4">
										<Input
											className="border-white/10 bg-slate-900/75 text-white"
											onChange={(event) => setChannelName(event.target.value)}
											placeholder={t("workspace.channels.namePlaceholder")}
											value={channelName}
										/>
										<input
											accept="image/*"
											className="sr-only"
											onChange={(event) =>
												selectChannelLogo(
													event.currentTarget.files?.[0] ?? null,
												)
											}
											ref={channelLogoInputRef}
											type="file"
										/>
										{channelLogo && channelLogoPreviewUrl ? (
											<div className="rounded-md border border-white/10 bg-slate-900/60 p-3">
												<div className="flex items-center gap-3">
													{/* biome-ignore lint/performance/noImgElement: blob URL preview for a local file selected before upload */}
													<img
														alt={channelLogo.name}
														className="h-16 w-16 rounded-md border border-white/10 bg-black object-contain"
														src={channelLogoPreviewUrl}
													/>
													<div className="min-w-0 flex-1">
														<p className="truncate font-medium text-slate-100 text-sm">
															{channelLogo.name}
														</p>
														<p className="text-slate-500 text-xs">
															{formatFileSize(channelLogo.size)}
														</p>
													</div>
													<Button
														className="h-9 border-rose-300/25 bg-rose-300/10 px-3 text-rose-50 hover:bg-rose-300/15"
														onClick={removeChannelLogo}
														type="button"
														variant="outline"
													>
														<Trash2 className="h-4 w-4" />
														{t("common.remove")}
													</Button>
												</div>
											</div>
										) : (
											<button
												className={cn(
													"flex min-h-32 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed p-4 text-center transition",
													isChannelLogoDragActive
														? "border-orange-300/60 bg-orange-300/10"
														: "border-white/10 bg-slate-900/60 hover:bg-slate-900/85",
												)}
												onClick={() => channelLogoInputRef.current?.click()}
												onDragEnter={(event) => {
													event.preventDefault();
													setIsChannelLogoDragActive(true);
												}}
												onDragLeave={(event) => {
													event.preventDefault();
													setIsChannelLogoDragActive(false);
												}}
												onDragOver={(event) => {
													event.preventDefault();
													event.dataTransfer.dropEffect = "copy";
												}}
												onDrop={(event) => {
													event.preventDefault();
													setIsChannelLogoDragActive(false);
													selectChannelLogo(event.dataTransfer.files.item(0));
												}}
												type="button"
											>
												<div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/6">
													<Upload className="h-5 w-5 text-orange-200" />
												</div>
												<div className="space-y-1">
													<p className="font-medium text-slate-100 text-sm">
														{t("workspace.channels.logoDropTitle")}
													</p>
													<p className="text-slate-400 text-sm">
														{t("workspace.channels.logoDropDescription")}
													</p>
												</div>
											</button>
										)}
										<Button
											className="w-full bg-orange-400 text-slate-950 hover:bg-orange-300"
											disabled={isPending}
											onClick={() =>
												startTransition(() => {
													void handleCreateChannel();
												})
											}
										>
											{t("workspace.channels.create")}
										</Button>
									</div>
								</DialogContent>
							</Dialog>
						</div>
						<div className="grid grid-cols-3 overflow-hidden rounded-md border border-white/10 bg-slate-900/80 text-sm">
							<div className="border-white/10 border-r px-4 py-2">
								<p className="font-semibold text-white">
									{libraryVideos.length}
								</p>
								<p className="text-slate-500 text-xs">
									{t("workspace.header.sources")}
								</p>
							</div>
							<div className="border-white/10 border-r px-4 py-2">
								<p className="font-semibold text-white">
									{libraryVideos.reduce(
										(total, video) => total + video.clipCount,
										0,
									)}
								</p>
								<p className="text-slate-500 text-xs">
									{t("workspace.header.drafts")}
								</p>
							</div>
							<div className="px-4 py-2">
								<p className="font-semibold text-white">
									{dashboardQuery.data?.jobs.filter(
										(job) =>
											job.status === "pending" || job.status === "running",
									).length ?? 0}
								</p>
								<p className="text-slate-500 text-xs">
									{t("workspace.header.active")}
								</p>
							</div>
						</div>
						<Dialog onOpenChange={setAiSettingsOpen} open={aiSettingsOpen}>
							<DialogTrigger asChild>
								<Button
									className="border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
									variant="outline"
								>
									<Settings2 className="h-4 w-4" />
									{t("workspace.header.settings")}
								</Button>
							</DialogTrigger>
							<DialogContent className="border-white/10 bg-slate-950 text-white sm:max-w-2xl">
								<DialogHeader>
									<DialogTitle>{t("workspace.settings.title")}</DialogTitle>
									<DialogDescription className="text-slate-400">
										{t("workspace.settings.description")}
									</DialogDescription>
								</DialogHeader>
								<div className="space-y-4">
									<div className="space-y-2">
										<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
											{t("workspace.settings.provider")}
										</p>
										<Select
											onValueChange={(value) => {
												const nextProvider = value as ContentAiProvider;
												setAiProvider(nextProvider);
											}}
											value={aiProvider}
										>
											<SelectTrigger className="border-white/10 bg-slate-900/75 text-white">
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="openai">
													{t("workspace.settings.openAiCompatible")}
												</SelectItem>
												<SelectItem value="gemini">Gemini</SelectItem>
												<SelectItem value="openrouter">OpenRouter</SelectItem>
											</SelectContent>
										</Select>
									</div>
									{aiProvider === "openai" ? (
										<div className="space-y-3">
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) =>
													setOpenaiApiKey(event.target.value)
												}
												placeholder={t("workspace.settings.openAiApiKey")}
												type="password"
												value={openaiApiKey}
											/>
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) =>
													setOpenaiBaseUrl(event.target.value)
												}
												placeholder={t("workspace.settings.openAiBaseUrl")}
												value={openaiBaseUrl}
											/>
											<ModelCombobox
												isLoading={aiModelsQuery.isLoading}
												onChange={setOpenaiModel}
												options={modelOptions}
												value={openaiModel}
											/>
										</div>
									) : aiProvider === "gemini" ? (
										<div className="space-y-3">
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) =>
													setGeminiApiKey(event.target.value)
												}
												placeholder={t("workspace.settings.geminiApiKey")}
												type="password"
												value={geminiApiKey}
											/>
											<ModelCombobox
												isLoading={aiModelsQuery.isLoading}
												onChange={setGeminiModel}
												options={modelOptions}
												value={geminiModel}
											/>
										</div>
									) : (
										<div className="space-y-3">
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) =>
													setOpenrouterApiKey(event.target.value)
												}
												placeholder={t("workspace.settings.openRouterApiKey")}
												type="password"
												value={openrouterApiKey}
											/>
											<ModelCombobox
												isLoading={aiModelsQuery.isLoading}
												onChange={setOpenrouterModel}
												options={modelOptions}
												value={openrouterModel}
											/>
										</div>
									)}
									{aiModelsQuery.error ? (
										<p className="rounded-md border border-rose-400/20 bg-rose-400/10 p-3 text-rose-100 text-sm">
											{aiModelsQuery.error.message}
										</p>
									) : null}
									<div className="space-y-3 border-white/10 border-t pt-4">
										<div className="space-y-1">
											<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
												{t("workspace.settings.whisperTitle")}
											</p>
											<p className="text-slate-400 text-sm">
												{t("workspace.settings.whisperDescription")}
											</p>
										</div>
										<Tabs
											className="w-full"
											onValueChange={(value) =>
												setWhisperModel(value as WhisperModel)
											}
											value={whisperModel}
										>
											<TabsList className="grid w-full grid-cols-2 border border-white/10 bg-slate-900/75">
												{whisperModelOptions.map((option) => (
													<TabsTrigger key={option.value} value={option.value}>
														{option.label}
													</TabsTrigger>
												))}
											</TabsList>
											<p className="mt-2 min-h-5 text-slate-400 text-xs">
												{selectedWhisperModelOption?.description}
											</p>
										</Tabs>
									</div>
									<Button
										className="w-full border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
										disabled={isPending}
										onClick={() =>
											startTransition(() => {
												void handleSaveAiSettings();
											})
										}
										variant="outline"
									>
										{t("workspace.settings.save")}
									</Button>
								</div>
							</DialogContent>
						</Dialog>
					</div>
				</header>
				<Tabs
					className="space-y-4"
					onValueChange={(value) => setWorkspaceTab(value as WorkspaceTab)}
					value={workspaceTab}
				>
					<TabsList className="grid w-full max-w-xl grid-cols-3 border border-white/10 bg-slate-900/75">
						<TabsTrigger value="media">
							<Film className="h-4 w-4" />
							{t("workspace.tabs.media")}
						</TabsTrigger>
						<TabsTrigger value="bumpers">
							<Clapperboard className="h-4 w-4" />
							{t("workspace.tabs.bumpers")}
						</TabsTrigger>
						<TabsTrigger value="intake">
							<Upload className="h-4 w-4" />
							{t("workspace.tabs.intake")}
						</TabsTrigger>
					</TabsList>
					<TabsContent className="mt-0" value="intake">
						<motion.section
							animate={{ opacity: 1, y: 0 }}
							className="rounded-md border border-white/10 bg-slate-900/60 p-4"
							initial={{ opacity: 0, y: 18 }}
							transition={{ duration: 0.35 }}
						>
							<Card className="border-white/10 bg-slate-950/70 shadow-none">
								<CardHeader>
									<CardTitle className="flex items-center gap-2 text-base text-white">
										<Upload className="h-5 w-5 text-orange-300" />
										{t("workspace.intake.title")}
									</CardTitle>
									<CardDescription className="text-slate-300">
										{t("workspace.intake.description")}
									</CardDescription>
								</CardHeader>
								<CardContent className="space-y-4">
									<Tabs
										onValueChange={(value) =>
											setIntakeSourceTab(value as IntakeSourceTab)
										}
										value={intakeSourceTab}
									>
										<TabsList className="grid w-full grid-cols-2 border border-white/10 bg-slate-900/75">
											<TabsTrigger value="file">
												<Upload className="h-4 w-4" />
												{t("common.file")}
											</TabsTrigger>
											<TabsTrigger value="url">
												<Link className="h-4 w-4" />
												{t("common.url")}
											</TabsTrigger>
										</TabsList>
										<TabsContent className="mt-4 space-y-2" value="file">
											<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
												{t("workspace.intake.sourceFile")}
											</p>
											<input
												accept="video/*"
												className="sr-only"
												onChange={(event) =>
													selectUploadFile(event.target.files?.[0] ?? null)
												}
												ref={fileInputRef}
												type="file"
											/>
											<button
												className={cn(
													"flex min-h-44 w-full flex-col items-center justify-center gap-3 rounded-md border border-dashed p-6 text-center transition",
													isFileDragActive
														? "border-orange-300/60 bg-orange-300/10"
														: "border-white/10 bg-slate-900/60 hover:bg-slate-900/85",
												)}
												onClick={() => fileInputRef.current?.click()}
												onDragEnter={(event) => {
													event.preventDefault();
													setIsFileDragActive(true);
												}}
												onDragLeave={(event) => {
													event.preventDefault();
													setIsFileDragActive(false);
												}}
												onDragOver={(event) => {
													event.preventDefault();
													event.dataTransfer.dropEffect = "copy";
												}}
												onDrop={(event) => {
													event.preventDefault();
													setIsFileDragActive(false);
													selectUploadFile(event.dataTransfer.files.item(0));
												}}
												type="button"
											>
												<div className="flex h-10 w-10 items-center justify-center rounded-md border border-white/10 bg-white/6">
													<Upload className="h-5 w-5 text-orange-200" />
												</div>
												<div className="space-y-1">
													<p className="font-medium text-slate-100 text-sm">
														{t("workspace.intake.dropTitle")}
													</p>
													<p className="text-slate-400 text-sm">
														{t("workspace.intake.dropDescription")}
													</p>
												</div>
											</button>
											{uploadFileValue ? (
												<div className="flex items-center justify-between rounded-md border border-white/10 bg-white/4 px-3 py-2 text-sm">
													<p className="truncate text-slate-200">
														{uploadFileValue.name}
													</p>
													<p className="ml-3 shrink-0 text-slate-400">
														{formatFileSize(uploadFileValue.size)}
													</p>
												</div>
											) : null}
										</TabsContent>
										<TabsContent className="mt-4 space-y-2" value="url">
											<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
												{t("workspace.intake.videoUrl")}
											</p>
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) => setSourceUrl(event.target.value)}
												placeholder={t("workspace.intake.urlPlaceholder")}
												value={sourceUrl}
											/>
											<p className="text-slate-400 text-sm">
												{t("workspace.intake.urlDescription")}
											</p>
										</TabsContent>
									</Tabs>
									<div className="grid gap-4 md:grid-cols-2">
										<div className="space-y-2">
											<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
												{t("workspace.intake.displayTitle")}
											</p>
											<Input
												className="border-white/10 bg-slate-900/75 text-white"
												onChange={(event) => setUploadTitle(event.target.value)}
												placeholder={t(
													"workspace.intake.displayTitlePlaceholder",
												)}
												value={uploadTitle}
											/>
										</div>
										<div className="space-y-2">
											<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
												{t("workspace.intake.audioLanguage")}
											</p>
											<Select
												onValueChange={setUploadLanguage}
												value={uploadLanguage}
											>
												<SelectTrigger className="border-white/10 bg-slate-900/75 text-white">
													<SelectValue placeholder={t("common.autoDetect")} />
												</SelectTrigger>
												<SelectContent>
													{audioLanguageOptions.map((option) => (
														<SelectItem key={option.value} value={option.value}>
															{option.label}
														</SelectItem>
													))}
												</SelectContent>
											</Select>
										</div>
									</div>
									<div className="space-y-3 rounded-md border border-white/8 bg-white/4 p-4">
										<div className="flex items-center justify-between">
											<p className="text-slate-200 text-sm">
												{t(uploadMessageKey)}
											</p>
											<p className="text-slate-400 text-xs">
												{uploadProgress}%
											</p>
										</div>
										<Progress value={uploadProgress} />
									</div>
									{intakeSourceTab === "file" ? (
										<Button
											className="h-11 w-full bg-orange-400 text-slate-950 hover:bg-orange-300"
											disabled={!uploadFileValue || isPending}
											onClick={() =>
												startTransition(() => {
													void handleUpload();
												})
											}
											size="lg"
										>
											<ArrowRight className="h-4 w-4" />
											{t("workspace.intake.uploadFile")}
										</Button>
									) : (
										<Button
											className="h-11 w-full border-teal-300/20 bg-teal-300/10 text-teal-100 hover:bg-teal-300/15"
											disabled={!sourceUrl.trim() || isPending}
											onClick={() =>
												startTransition(() => {
													void handleUrlImport();
												})
											}
											size="lg"
										>
											<Link className="h-4 w-4" />
											{t("workspace.intake.downloadUrl")}
										</Button>
									)}
								</CardContent>
							</Card>
						</motion.section>
					</TabsContent>

					<TabsContent className="mt-0" value="bumpers">
						<motion.section
							animate={{ opacity: 1, y: 0 }}
							className="grid gap-4 rounded-md border border-white/10 bg-slate-900/60 p-4 lg:grid-cols-2"
							initial={{ opacity: 0, y: 18 }}
							transition={{ duration: 0.35 }}
						>
							{(["intro", "outro"] as const).map((position) => {
								const file = position === "intro" ? introFile : outroFile;
								const savedPreviewUrl =
									position === "intro"
										? selectedChannel?.introStorageKey
											? `/api/content/channels/${selectedChannel.id}/bumpers/intro`
											: null
										: selectedChannel?.outroStorageKey
											? `/api/content/channels/${selectedChannel.id}/bumpers/outro`
											: null;
								const localPreviewUrl = bumperPreviewUrls[position];
								const previewUrl = localPreviewUrl ?? savedPreviewUrl;
								const isDropActive = activeBumperDropTarget === position;
								const isBumperMutating =
									bumperMutationPosition === position || isPending;
								const showUploadControls = !previewUrl || Boolean(file);
								const label =
									position === "intro"
										? t("workspace.bumpers.startVideo")
										: t("workspace.bumpers.endVideo");
								const inputId = `bumper-${position}-file`;

								return (
									<Card
										className="border-white/10 bg-slate-950/70"
										key={position}
									>
										<CardHeader>
											<CardTitle className="text-white">{label}</CardTitle>
											<CardDescription className="text-slate-300">
												{position === "intro"
													? t("workspace.bumpers.startVideoDescription")
													: t("workspace.bumpers.endVideoDescription")}
											</CardDescription>
										</CardHeader>
										<CardContent className="space-y-4">
											{previewUrl ? (
												<ReactPlayer
													className="aspect-video overflow-hidden rounded-md border border-white/10 bg-black"
													controls
													preload="metadata"
													src={previewUrl}
													style={{ width: "100%", height: "auto" }}
													width="100%"
												/>
											) : null}
											{showUploadControls ? (
												<div className="space-y-2">
													<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
														{t("workspace.bumpers.uploadLabel", { label })}
													</p>
													{file ? null : (
														<label
															className={cn(
																"flex aspect-video cursor-pointer flex-col items-center justify-center rounded-md border border-white/10 border-dashed bg-white/4 px-4 text-center text-slate-400 text-sm transition",
																"hover:border-teal-300/40 hover:bg-teal-300/10 hover:text-teal-100",
																isDropActive &&
																	"border-teal-300/60 bg-teal-300/15 text-teal-50",
																(!selectedChannel || isBumperMutating) &&
																	"pointer-events-none cursor-not-allowed opacity-50",
															)}
															htmlFor={inputId}
															onDragEnter={(event) => {
																event.preventDefault();
																setActiveBumperDropTarget(position);
															}}
															onDragLeave={(event) => {
																event.preventDefault();
																setActiveBumperDropTarget(null);
															}}
															onDragOver={(event) => event.preventDefault()}
															onDrop={(event) => {
																event.preventDefault();
																setActiveBumperDropTarget(null);
																selectBumperFile(
																	position,
																	event.dataTransfer.files?.[0] ?? null,
																);
															}}
														>
															<Upload className="mb-3 h-7 w-7 text-teal-200" />
															<span className="font-medium text-slate-100">
																{t("workspace.bumpers.dropTitle", { label })}
															</span>
															<span className="mt-1 text-slate-400 text-xs">
																{t("workspace.bumpers.dropDescription")}
															</span>
															<Input
																accept="video/*"
																className="sr-only"
																disabled={!selectedChannel || isBumperMutating}
																id={inputId}
																onChange={(event) =>
																	selectBumperFile(
																		position,
																		event.currentTarget.files?.[0] ?? null,
																	)
																}
																type="file"
															/>
														</label>
													)}
													{file ? (
														<div className="flex items-center justify-between gap-3 rounded-md border border-white/10 bg-white/5 px-3 py-2">
															<p className="min-w-0 truncate text-slate-300 text-xs">
																{t("workspace.bumpers.selectedFile", {
																	name: file.name,
																})}
															</p>
															<Button
																className="h-8 shrink-0 border-white/10"
																disabled={isBumperMutating}
																onClick={() => clearBumperFile(position)}
																size="sm"
																type="button"
																variant="outline"
															>
																{t("common.remove")}
															</Button>
														</div>
													) : null}
												</div>
											) : null}
											<div className="grid gap-2 sm:grid-cols-2">
												{showUploadControls ? (
													<Button
														className="border-teal-300/20 bg-teal-300/10 text-teal-100 hover:bg-teal-300/15"
														disabled={
															!selectedChannel || !file || isBumperMutating
														}
														onClick={() =>
															startTransition(() => {
																void handleUploadBumper(position);
															})
														}
													>
														{isBumperMutating ? (
															<LoaderCircle className="h-4 w-4 animate-spin" />
														) : (
															<Upload className="h-4 w-4" />
														)}
														{t("workspace.bumpers.saveLabel", { label })}
													</Button>
												) : null}
												<Button
													className="border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
													disabled={
														!selectedChannel ||
														!savedPreviewUrl ||
														isBumperMutating
													}
													onClick={() =>
														startTransition(() => {
															void handleDeleteBumper(position);
														})
													}
													variant="outline"
												>
													{isBumperMutating ? (
														<LoaderCircle className="h-4 w-4 animate-spin" />
													) : (
														<Trash2 className="h-4 w-4" />
													)}
													{t("common.remove")}
												</Button>
											</div>
										</CardContent>
									</Card>
								);
							})}
						</motion.section>
					</TabsContent>

					<TabsContent className="mt-0" value="media">
						<div className="grid gap-6 xl:grid-cols-[340px_minmax(0,1fr)]">
							<div className="space-y-6">
								<Card className="border-white/10 bg-slate-950/70">
									<CardHeader>
										<CardTitle className="text-white">
											{t("workspace.library.title")}
										</CardTitle>
										<CardDescription className="text-slate-300">
											{t("workspace.library.description")}
										</CardDescription>
									</CardHeader>
									<CardContent>
										<div className="space-y-3">
											<div className="relative">
												<Search className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
												<Input
													className="h-10 border-white/10 bg-slate-900/70 pl-9 text-white"
													onChange={(event) => {
														setLibrarySearch(event.target.value);
														setLibraryPage(1);
													}}
													placeholder={t("workspace.library.search")}
													value={librarySearch}
												/>
											</div>
											{!dashboardQuery.data && dashboardQuery.isLoading ? (
												<div className="space-y-3">
													<div className="h-24 rounded-md bg-white/6" />
													<div className="h-24 rounded-md bg-white/6" />
												</div>
											) : filteredLibraryVideos.length ? (
												paginatedLibraryVideos.map((video) => (
													<div
														className={`w-full rounded-md border p-4 text-left transition ${
															selectedVideoId === video.id
																? "border-orange-300/35 bg-orange-300/10"
																: "border-white/8 bg-white/4 hover:bg-white/6"
														}`}
														key={video.id}
														onClick={() => {
															setSelectedVideoId(video.id);
															setSelectedVideoChannelId(video.channelId);
														}}
													>
														<div className="flex items-center justify-between gap-3">
															<p className="font-semibold text-white">
																{video.title}
															</p>
															<Badge
																className={getStageClasses(
																	video.processingStage,
																)}
															>
																{getStageLabel(video.processingStage, t)}
															</Badge>
														</div>
														<div className="mt-2 flex flex-wrap items-center justify-between gap-2">
															<p className="text-slate-400 text-sm">
																{formatDuration(
																	video.durationSeconds,
																	t("common.pending"),
																)}{" "}
																• {formatFileSize(video.sizeBytes)}
															</p>
															<Button
																className="h-8 border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
																disabled={isPending}
																onClick={(event) => {
																	event.stopPropagation();
																	setDeleteSourceId(video.id);
																}}
																size="sm"
																variant="outline"
															>
																<Trash2 className="h-3.5 w-3.5" />
															</Button>
														</div>
														<div className="mt-3 flex items-center gap-2 text-slate-300 text-xs">
															<Film className="h-3.5 w-3.5" />
															{t("workspace.library.drafts", {
																count: video.clipCount,
															})}
															<span className="text-slate-500">/</span>
															{t("workspace.library.rendered", {
																count: video.readyClipCount,
															})}
														</div>
														{video.processingStage === "failed" &&
														(video.sourceType === "url" || video.storageKey) ? (
															<div className="mt-3 space-y-3 rounded-md border border-rose-400/20 bg-rose-400/10 p-3">
																<p className="line-clamp-2 text-rose-100 text-xs">
																	{video.latestError ??
																		t("workspace.library.downloadFailed")}
																</p>
																<Button
																	className="h-8 border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
																	disabled={isPending}
																	onClick={(event) => {
																		event.stopPropagation();
																		startTransition(() => {
																			void handleRetryVideo(video.id);
																		});
																	}}
																	size="sm"
																	variant="outline"
																>
																	<RotateCcw className="h-3.5 w-3.5" />
																	{t("workspace.library.retryDownload")}
																</Button>
															</div>
														) : null}
													</div>
												))
											) : libraryVideos.length ? (
												<div className="rounded-md border border-white/10 border-dashed bg-white/4 p-6 text-center text-slate-400 text-sm">
													{t("workspace.library.noMatches")}
												</div>
											) : (
												<div className="rounded-md border border-white/10 border-dashed bg-white/4 p-6 text-center text-slate-400 text-sm">
													{t("workspace.library.empty")}
												</div>
											)}
											{filteredLibraryVideos.length >
											LIBRARY_VIDEOS_PER_PAGE ? (
												<div className="flex items-center justify-between gap-3 border-white/10 border-t pt-3">
													<p className="text-slate-400 text-xs">
														{t("workspace.library.pageStatus", {
															page: boundedLibraryPage,
															total: libraryPageCount,
														})}
													</p>
													<div className="flex items-center gap-2">
														<Button
															aria-label={t("workspace.library.previousPage")}
															className="h-8 w-8 border-white/10 bg-white/6 p-0 text-slate-200 hover:bg-white/10"
															disabled={boundedLibraryPage <= 1}
															onClick={() =>
																setLibraryPage((page) => Math.max(1, page - 1))
															}
															size="icon"
															title={t("workspace.library.previousPage")}
															variant="outline"
														>
															<ChevronLeft className="h-4 w-4" />
														</Button>
														<Button
															aria-label={t("workspace.library.nextPage")}
															className="h-8 w-8 border-white/10 bg-white/6 p-0 text-slate-200 hover:bg-white/10"
															disabled={boundedLibraryPage >= libraryPageCount}
															onClick={() =>
																setLibraryPage((page) =>
																	Math.min(libraryPageCount, page + 1),
																)
															}
															size="icon"
															title={t("workspace.library.nextPage")}
															variant="outline"
														>
															<ChevronRight className="h-4 w-4" />
														</Button>
													</div>
												</div>
											) : null}
										</div>
									</CardContent>
								</Card>
							</div>

							<div className="space-y-6">
								{selectedVideo ? (
									<>
										<Card className="border-white/10 bg-slate-950/70">
											<CardHeader className="border-white/10 border-b px-4">
												<div className="flex flex-wrap items-center justify-between gap-3">
													<div className="flex flex-wrap items-center gap-2">
														<Badge
															className={getStageClasses(
																selectedVideo.video.processingStage,
															)}
														>
															{getStageLabel(
																selectedVideo.video.processingStage,
																t,
															)}
														</Badge>
														<Badge className="border-white/10 bg-white/6 text-slate-200">
															<Clock3 className="mr-1 h-3.5 w-3.5" />
															{formatDuration(
																selectedVideo.video.durationSeconds,
																t("common.pending"),
															)}
														</Badge>
														{selectedVideo.video.detectedLanguage ? (
															<Badge className="border-teal-300/20 bg-teal-300/10 text-teal-100">
																<Languages className="mr-1 h-3.5 w-3.5" />
																{selectedVideo.video.detectedLanguage}
															</Badge>
														) : null}
													</div>
													<div className="flex gap-2">
														<Button
															aria-label={t(
																"workspace.sourceDetail.saveBriefAria",
															)}
															className="h-9 w-9 border-white/10 bg-white/6 p-0 text-slate-100 hover:bg-white/10"
															disabled={isPending}
															onClick={() =>
																startTransition(() => {
																	void handleSaveVideoSettings();
																})
															}
															variant="outline"
														>
															<Save className="h-4 w-4" />
														</Button>
														<Dialog
															onOpenChange={setAiGenerateOpen}
															open={aiGenerateOpen}
														>
															<DialogTrigger asChild>
																<Button
																	className="border-orange-300/20 bg-orange-300/10 text-orange-100 hover:bg-orange-300/15"
																	disabled={
																		isPending || !selectedVideo.transcription
																	}
																>
																	<RefreshCcw className="h-4 w-4" />
																	{t("workspace.sourceDetail.aiGenerate")}
																</Button>
															</DialogTrigger>
															<DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-md">
																<DialogHeader>
																	<DialogTitle>
																		{t("workspace.generateDialog.title")}
																	</DialogTitle>
																	<DialogDescription className="text-slate-300">
																		{t("workspace.generateDialog.description")}
																	</DialogDescription>
																</DialogHeader>
																<div className="space-y-3">
																	<button
																		className="flex w-full items-start gap-3 rounded-md border border-white/10 bg-white/4 p-3 text-left transition hover:bg-white/6"
																		onClick={() =>
																			setGenerateClips((value) => !value)
																		}
																		type="button"
																	>
																		<Checkbox
																			checked={generateClips}
																			onCheckedChange={(checked) =>
																				setGenerateClips(checked === true)
																			}
																			onClick={(event) =>
																				event.stopPropagation()
																			}
																		/>
																		<span>
																			<span className="block font-medium text-sm text-white">
																				{t(
																					"workspace.generateDialog.clipsTitle",
																				)}
																			</span>
																			<span className="block text-slate-400 text-xs leading-5">
																				{t(
																					"workspace.generateDialog.clipsDescription",
																				)}
																			</span>
																		</span>
																	</button>
																	<button
																		className="flex w-full items-start gap-3 rounded-md border border-white/10 bg-white/4 p-3 text-left transition hover:bg-white/6"
																		onClick={() =>
																			setGenerateChapters((value) => !value)
																		}
																		type="button"
																	>
																		<Checkbox
																			checked={generateChapters}
																			onCheckedChange={(checked) =>
																				setGenerateChapters(checked === true)
																			}
																			onClick={(event) =>
																				event.stopPropagation()
																			}
																		/>
																		<span>
																			<span className="block font-medium text-sm text-white">
																				{t(
																					"workspace.generateDialog.chaptersTitle",
																				)}
																			</span>
																			<span className="block text-slate-400 text-xs leading-5">
																				{t(
																					"workspace.generateDialog.chaptersDescription",
																				)}
																			</span>
																		</span>
																	</button>
																	<Button
																		className="w-full border-orange-300/20 bg-orange-300/10 text-orange-100 hover:bg-orange-300/15"
																		disabled={
																			isPending ||
																			(!generateClips && !generateChapters)
																		}
																		onClick={() =>
																			startTransition(() => {
																				void handleAiGenerate();
																			})
																		}
																		type="button"
																	>
																		<RefreshCcw className="h-4 w-4" />
																		{t("workspace.generateDialog.generate")}
																	</Button>
																</div>
															</DialogContent>
														</Dialog>
													</div>
												</div>
											</CardHeader>
											<CardContent className="grid gap-4 px-4 py-4 xl:grid-cols-[1.2fr_0.8fr]">
												<div className="space-y-4">
													{selectedVideo.sourceUrl ? (
														<div className="space-y-3">
															<ReactPlayer
																className="aspect-video overflow-hidden rounded-md border border-white/10 bg-black"
																controls
																onTimeUpdate={(event) =>
																	setCurrentTime(
																		event.currentTarget.currentTime,
																	)
																}
																preload="metadata"
																ref={videoRef}
																src={selectedVideo.sourceUrl}
																style={{ width: "100%", height: "auto" }}
																width="100%"
															/>
														</div>
													) : (
														<div className="flex aspect-video items-center justify-center rounded-md border border-white/10 border-dashed bg-white/4 text-slate-400 text-sm">
															{t(
																"workspace.sourceDetail.sourcePlaybackPending",
															)}
														</div>
													)}
													<div className="grid gap-4 md:grid-cols-2">
														<div className="space-y-2">
															<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
																{t("workspace.sourceDetail.sourceTitle")}
															</p>
															<Input
																className="border-white/10 bg-slate-900/70 text-white"
																onChange={(event) => {
																	setVideoTitleDraft(event.target.value);
																	setVideoTitleDraftDirty(true);
																}}
																value={videoTitleDraft}
															/>
														</div>
														<div className="space-y-2">
															<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
																{t("workspace.sourceDetail.originalFile")}
															</p>
															<Input
																className="border-white/10 bg-slate-900/70 text-slate-400"
																readOnly
																value={selectedVideo.video.originalFilename}
															/>
														</div>
													</div>
													<div className="space-y-2">
														<div className="flex flex-wrap items-center justify-between gap-2">
															<p className="font-medium text-slate-200 text-xs uppercase tracking-[0.18em]">
																{t("workspace.sourceDetail.clipStrategy")}
															</p>
															<Button
																className="h-7 border-white/10 bg-white/6 px-2 text-slate-300 text-xs hover:bg-white/10"
																onClick={() => {
																	setVideoPromptDraft(
																		t("workspace.strategy.defaultExampleText"),
																	);
																	setVideoPromptDraftDirty(true);
																}}
																type="button"
																variant="outline"
															>
																{t("workspace.strategy.useDefaultExample")}
															</Button>
														</div>
														<Textarea
															className="min-h-32 border-white/10 bg-slate-900/70 text-white"
															onChange={(event) => {
																setVideoPromptDraft(event.target.value);
																setVideoPromptDraftDirty(true);
															}}
															placeholder={t("workspace.strategy.example")}
															value={videoPromptDraft}
														/>
													</div>
												</div>
												<div className="space-y-4">
													<Card className="border-white/10 bg-white/4">
														<CardHeader>
															<div className="flex items-start justify-between gap-3">
																<div>
																	<CardTitle className="text-base text-white">
																		{t("workspace.transcriptPanel.title")}
																	</CardTitle>
																	<CardDescription className="text-slate-300">
																		{t("workspace.transcriptPanel.description")}
																	</CardDescription>
																</div>
																<Button
																	className="border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
																	disabled={!youtubeChapterText}
																	onClick={() => void copyYoutubeChapters()}
																	size="sm"
																	variant="outline"
																>
																	<Clipboard className="h-4 w-4" />
																	{t("common.copy")}
																</Button>
															</div>
														</CardHeader>
														<CardContent className="space-y-3">
															<Tabs defaultValue="transcript">
																<TabsList className="grid w-full grid-cols-2 border border-white/10 bg-slate-900/80">
																	<TabsTrigger value="transcript">
																		{t("workspace.transcriptPanel.transcript")}
																	</TabsTrigger>
																	<TabsTrigger value="chapters">
																		{t("workspace.transcriptPanel.chapters")}
																	</TabsTrigger>
																</TabsList>
																<TabsContent
																	className="mt-3 space-y-3"
																	value="transcript"
																>
																	<div className="relative">
																		<Search className="absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-500" />
																		<Input
																			className="border-white/10 bg-slate-900/70 pl-9 text-white"
																			onChange={(event) =>
																				setTranscriptSearch(event.target.value)
																			}
																			placeholder={t(
																				"workspace.transcriptPanel.searchTranscript",
																			)}
																			value={transcriptSearch}
																		/>
																	</div>
																	<ScrollArea className="h-120 pr-3">
																		<div className="space-y-3">
																			{filteredTranscriptSegments.length ? (
																				filteredTranscriptSegments.map(
																					(segment) => (
																						<button
																							className="w-full rounded-md border border-white/8 bg-slate-950/45 p-3 text-left transition hover:bg-slate-900/70"
																							key={`${segment.start}-${segment.end}-${segment.text}`}
																							onClick={() =>
																								seekVideo(segment.start)
																							}
																							type="button"
																						>
																							<p className="font-medium text-orange-200 text-xs uppercase tracking-[0.18em]">
																								{formatTimecode(segment.start)}
																							</p>
																							<p className="mt-2 text-slate-200 text-sm leading-6">
																								{segment.text}
																							</p>
																						</button>
																					),
																				)
																			) : transcriptSegments.length ? (
																				<p className="rounded-md border border-white/10 border-dashed bg-slate-950/45 p-4 text-slate-400 text-sm">
																					{t(
																						"workspace.transcriptPanel.noTranscriptMatches",
																					)}
																				</p>
																			) : (
																				<p className="text-slate-400 text-sm">
																					{t(
																						"workspace.transcriptPanel.transcriptPending",
																					)}
																				</p>
																			)}
																		</div>
																	</ScrollArea>
																</TabsContent>
																<TabsContent className="mt-3" value="chapters">
																	<ScrollArea className="h-120 pr-3">
																		<div className="space-y-3">
																			{selectedVideo.chapters.length ? (
																				selectedVideo.chapters.map(
																					(chapter) => (
																						<button
																							className="w-full rounded-md border border-white/8 bg-slate-950/45 p-3 text-left transition hover:bg-slate-900/70"
																							key={chapter.id}
																							onClick={() =>
																								seekVideo(chapter.startSeconds)
																							}
																							type="button"
																						>
																							<div className="flex items-center justify-between gap-3">
																								<p className="font-medium text-orange-200 text-xs uppercase tracking-[0.18em]">
																									{formatTimecode(
																										chapter.startSeconds,
																									)}
																								</p>
																								<p className="text-slate-500 text-xs">
																									{Math.round(
																										chapter.confidence * 100,
																									)}
																									%
																								</p>
																							</div>
																							<p className="mt-2 font-medium text-slate-100 text-sm">
																								{chapter.title}
																							</p>
																							{chapter.summary ? (
																								<p className="mt-2 text-slate-400 text-xs leading-5">
																									{chapter.summary}
																								</p>
																							) : null}
																						</button>
																					),
																				)
																			) : (
																				<p className="rounded-md border border-white/10 border-dashed bg-slate-950/45 p-4 text-slate-400 text-sm">
																					{t(
																						"workspace.transcriptPanel.chaptersPending",
																					)}
																				</p>
																			)}
																		</div>
																	</ScrollArea>
																</TabsContent>
															</Tabs>
														</CardContent>
													</Card>
												</div>
											</CardContent>
										</Card>

										<div className="space-y-6">
											<div className="flex items-center justify-between">
												<div>
													<p className="font-medium text-orange-200 text-xs uppercase tracking-[0.18em]">
														{t("workspace.clipList.eyebrow")}
													</p>
													<h2 className="mt-1 font-semibold text-xl">
														{t("workspace.clipList.title")}
													</h2>
												</div>
												<div className="flex flex-wrap items-center justify-end gap-2">
													<div className="flex items-center gap-2 text-slate-400 text-sm">
														<Scissors className="h-4 w-4" />
														{t("workspace.clipList.candidates", {
															count: selectedVideo.clips.length,
														})}
													</div>
													<Select
														onValueChange={(value) =>
															setRenderOptions((current) => ({
																...current,
																aspectMode:
																	value === "vertical9x16"
																		? "vertical9x16"
																		: "source",
															}))
														}
														value={renderOptions.aspectMode}
													>
														<SelectTrigger className="h-9 w-[150px] border-white/10 bg-slate-900/75 text-white">
															<SelectValue />
														</SelectTrigger>
														<SelectContent>
															<SelectItem value="source">
																{t("workspace.renderOptions.source")}
															</SelectItem>
															<SelectItem value="vertical9x16">
																{t("workspace.renderOptions.vertical")}
															</SelectItem>
														</SelectContent>
													</Select>
													<button
														className="flex h-9 items-center gap-2 rounded-md border border-white/10 bg-slate-900/75 px-3 text-slate-200 text-sm transition hover:bg-slate-900"
														onClick={() =>
															setRenderOptions((current) => ({
																...current,
																burnSubtitles: !current.burnSubtitles,
															}))
														}
														type="button"
													>
														<Checkbox
															checked={renderOptions.burnSubtitles}
															onCheckedChange={(checked) =>
																setRenderOptions((current) => ({
																	...current,
																	burnSubtitles: checked === true,
																}))
															}
															onClick={(event) => event.stopPropagation()}
														/>
														{t("workspace.renderOptions.subtitles")}
													</button>
													<Button
														className="border-teal-300/20 bg-teal-300/10 text-teal-100 hover:bg-teal-300/15"
														disabled={isPending}
														onClick={() =>
															startTransition(() => {
																void handleAddManualClip();
															})
														}
														size="sm"
														variant="outline"
													>
														<Plus className="h-4 w-4" />
														{t("workspace.clipList.addClip")}
													</Button>
													<Button
														className="border-orange-300/25 bg-orange-400/15 text-orange-50 hover:bg-orange-400/20"
														disabled={
															isPending ||
															!selectedVideo.clips.length ||
															renderableClipCount === 0
														}
														onClick={() =>
															startTransition(() => {
																void handleRenderAllClips(
																	selectedVideo.video.id,
																);
															})
														}
														size="sm"
													>
														<Scissors className="h-4 w-4" />
														{t("workspace.clipList.exportAll")}
													</Button>
												</div>
											</div>
											{selectedVideo.clips.length ? (
												selectedVideo.clips.map((clip) => (
													<ClipEditorCard
														clip={clip}
														currentTime={currentTime}
														frameRate={selectedVideo.video.frameRate}
														key={clip.id}
														maxDurationSeconds={
															selectedVideo.video.durationSeconds ??
															clip.endSeconds
														}
														mutationPending={isPending}
														onAiGenerate={async (input) => {
															return await handleGenerateClipMetadata(input);
														}}
														onDelete={async (clipId) => {
															await handleDeleteClip(clipId);
														}}
														onRender={async (clipId) => {
															await handleRenderClip(clipId);
														}}
														onSave={async (input) => {
															await handleSaveClip(input);
														}}
														sourceUrl={selectedVideo.sourceUrl}
													/>
												))
											) : (
												<Card className="border-white/10 border-dashed bg-white/4">
													<CardContent className="py-10 text-center text-slate-400">
														<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-white/6">
															<Clapperboard className="h-7 w-7" />
														</div>
														<p className="font-medium text-slate-200">
															{t("workspace.clipList.emptyTitle")}
														</p>
														<p className="mx-auto mt-2 max-w-xl text-sm leading-6">
															{t("workspace.clipList.emptyDescription")}
														</p>
													</CardContent>
												</Card>
											)}
										</div>
									</>
								) : (
									<Card className="border-white/10 border-dashed bg-white/4">
										<CardContent className="py-20 text-center">
											<h2 className="font-semibold text-white text-xl">
												{t("workspace.clipList.noSourceTitle")}
											</h2>
											<p className="mx-auto mt-2 max-w-xl text-slate-400 leading-6">
												{t("workspace.clipList.noSourceDescription")}
											</p>
										</CardContent>
									</Card>
								)}
							</div>
						</div>
					</TabsContent>
				</Tabs>
				{floatingJobButton}
				<Dialog
					onOpenChange={(open) => {
						if (!open) {
							setDeleteSourceId(null);
						}
					}}
					open={Boolean(deleteSource)}
				>
					<DialogContent className="border-white/10 bg-slate-950 text-slate-100 sm:max-w-md">
						<DialogHeader>
							<DialogTitle>
								{t("workspace.deleteSourceDialog.title")}
							</DialogTitle>
							<DialogDescription className="text-slate-300">
								{t("workspace.deleteSourceDialog.description")}
							</DialogDescription>
						</DialogHeader>
						<div className="space-y-4">
							{deleteSource ? (
								<div className="rounded-md border border-rose-300/20 bg-rose-300/10 p-3">
									<p className="font-medium text-rose-50">
										{deleteSource.title}
									</p>
									<p className="mt-1 text-rose-100/80 text-sm">
										{t("workspace.deleteSourceDialog.summary", {
											clips: deleteSource.clipCount,
											rendered: deleteSource.readyClipCount,
										})}
									</p>
								</div>
							) : null}
							<div className="grid gap-2 sm:grid-cols-2">
								<Button
									className="border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
									disabled={isPending}
									onClick={() => setDeleteSourceId(null)}
									variant="outline"
								>
									{t("common.cancel")}
								</Button>
								<Button
									className="border-rose-300/25 bg-rose-300/10 text-rose-50 hover:bg-rose-300/15"
									disabled={isPending || !deleteSource}
									onClick={() => {
										if (!deleteSource) {
											return;
										}

										startTransition(() => {
											void handleDeleteSource(deleteSource.id);
										});
									}}
									variant="outline"
								>
									<Trash2 className="h-4 w-4" />
									{t("workspace.deleteSourceDialog.deleteEverything")}
								</Button>
							</div>
						</div>
					</DialogContent>
				</Dialog>
			</div>
		</div>
	);
}
