import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClipSEWorkspace } from "~/components/clipse/ClipSEWorkspace";
import {
	ClipSEAiSettingsMother,
	ClipSEJobMother,
	ClipSEMother,
	ClipSETranscriptionMother,
	ClipSEVideoMother,
	DashboardChapterMother,
	DashboardVideoMother,
} from "../../../mothers/domain-mothers";

const mocks = vi.hoisted(() => ({
	dashboardData: undefined as unknown,
	dashboardIsLoading: false,
	aiSettingsData: undefined as unknown,
	aiModelsData: [] as Array<{ value: string; label: string }>,
}));

vi.mock("~/i18n/provider", () => ({
	useTranslations:
		() => (key: string, values?: Record<string, string | number>) =>
			values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("next/navigation", () => ({
	usePathname: () => "/en",
	useRouter: () => ({ replace: vi.fn() }),
	useSearchParams: () => new URLSearchParams(),
}));

vi.mock("framer-motion", () => ({
	AnimatePresence: ({ children }: { children: React.ReactNode }) => (
		<>{children}</>
	),
	motion: {
		div: ({ children, ...props }: React.ComponentProps<"div">) => (
			<div {...props}>{children}</div>
		),
		section: ({ children, ...props }: React.ComponentProps<"section">) => (
			<section {...props}>{children}</section>
		),
	},
}));

vi.mock("react-player", () => ({
	default: () => null,
}));

vi.mock("~/server/actions/content-channels/create-content-channel", () => ({
	createContentChannelAction: vi.fn(),
}));
vi.mock(
	"~/server/actions/content-channels/update-content-channel-bumper",
	() => ({
		deleteContentChannelBumperAction: vi.fn(),
		updateContentChannelBumperAction: vi.fn(),
	}),
);
vi.mock("~/server/actions/content-clips/create-content-clip", () => ({
	createClipSEAction: vi.fn(),
}));
vi.mock("~/server/actions/content-clips/delete-content-clip", () => ({
	deleteClipSEAction: vi.fn(),
}));
vi.mock(
	"~/server/actions/content-clips/generate-content-clip-metadata",
	() => ({
		generateClipSEMetadataAction: vi.fn(),
	}),
);
vi.mock("~/server/actions/content-clips/queue-content-clip-render", () => ({
	queueClipSERenderAction: vi.fn(),
}));
vi.mock(
	"~/server/actions/content-clips/queue-content-video-clip-renders",
	() => ({
		queueContentVideoClipRendersAction: vi.fn(),
	}),
);
vi.mock("~/server/actions/content-clips/update-content-clip", () => ({
	updateClipSEAction: vi.fn(),
}));
vi.mock("~/server/actions/content-jobs/clear-finished-content-jobs", () => ({
	clearFinishedContentJobsAction: vi.fn(),
}));
vi.mock("~/server/actions/content-settings/update-content-ai-settings", () => ({
	updateContentAiSettingsAction: vi.fn(),
}));
vi.mock("~/server/actions/content-videos/create-content-video-draft", () => ({
	createContentVideoDraftAction: vi.fn(),
}));
vi.mock(
	"~/server/actions/content-videos/create-content-video-url-source",
	() => ({
		createContentVideoUrlSourceAction: vi.fn(),
	}),
);
vi.mock("~/server/actions/content-videos/delete-content-video", () => ({
	deleteContentVideoAction: vi.fn(),
}));
vi.mock("~/server/actions/content-videos/reanalyze-content-video", () => ({
	reanalyzeContentVideoAction: vi.fn(),
}));
vi.mock("~/server/actions/content-videos/retry-content-video-download", () => ({
	retryContentVideoDownloadAction: vi.fn(),
}));
vi.mock("~/server/actions/content-videos/update-content-video", () => ({
	updateContentVideoAction: vi.fn(),
}));
vi.mock(
	"~/modules/content-videos/application/upload-content-video-file",
	() => ({
		uploadContentVideoFile: vi.fn(),
	}),
);

vi.mock("~/components/clipse/LanguageSwitcher", () => ({
	LanguageSwitcher: () => <div data-testid="language-switcher" />,
}));

vi.mock("~/components/clipse/clip-editor/ClipEditorCard", () => ({
	ClipEditorCard: ({ clip }: { clip: { title: string } }) => (
		<div data-testid="clip-editor-card">{clip.title}</div>
	),
	ModelCombobox: ({ value }: { value: string }) => (
		<div data-testid="model-combobox">{value}</div>
	),
}));

vi.mock("~/trpc/react", () => ({
	api: {
		contentClip: {
			aiModels: {
				useQuery: () => ({
					data: mocks.aiModelsData,
					error: null,
					isLoading: false,
				}),
			},
			aiSettings: {
				useQuery: () => ({
					data: mocks.aiSettingsData,
				}),
				invalidate: vi.fn(),
			},
			whisperBackend: {
				useQuery: () => ({
					data: {
						providers: {
							hailo: {
								available: false,
								devices: [],
							},
						},
					},
					error: null,
				}),
			},
			dashboard: {
				useQuery: () => ({
					data: mocks.dashboardData,
					isLoading: mocks.dashboardIsLoading,
				}),
				invalidate: vi.fn(),
			},
		},
		useUtils: () => ({
			contentClip: {
				aiModels: { invalidate: vi.fn() },
				aiSettings: { invalidate: vi.fn() },
				dashboard: { invalidate: vi.fn() },
			},
		}),
	},
}));

function setDashboardData(input: {
	withSelectedVideo: boolean;
	withActiveJob?: boolean;
	emptySelectedVideo?: boolean;
	failedLibraryVideo?: boolean;
}) {
	mocks.dashboardIsLoading = false;
	const channel = {
		id: "22222222-2222-4222-8222-222222222222",
		name: "Main channel",
		logoStorageKey: null,
		logoMimeType: null,
		introStorageKey: null,
		introMimeType: null,
		outroStorageKey: null,
		outroMimeType: null,
		verticalIntroStorageKey: null,
		verticalIntroMimeType: null,
		verticalOutroStorageKey: null,
		verticalOutroMimeType: null,
		createdAt: new Date(0),
		updatedAt: new Date(0),
		logoUrl: null,
	};
	const video = ClipSEVideoMother.create({
		channelId: channel.id,
		...(input.failedLibraryVideo
			? {
					latestError: "Source download timed out",
					processingStage: "failed" as const,
					sourceType: "url" as const,
					sourceUrl: "https://video.test/watch",
					storageKey: null,
				}
			: {}),
		title: "Launch source",
	});
	const clip = ClipSEMother.create({
		title: "Launch clip",
		videoId: video.id,
	});
	const job = ClipSEJobMother.create({
		status: "running",
		progress: 42,
		videoId: video.id,
	});

	mocks.dashboardData = {
		channels: [channel],
		jobs: input.withActiveJob ? [job] : [],
		selectedChannel: channel,
		selectedVideo: input.withSelectedVideo
			? {
					chapters: input.emptySelectedVideo
						? []
						: [DashboardChapterMother.create({ videoId: video.id })],
					clips: input.emptySelectedVideo
						? []
						: [
								{
									...clip,
									downloadUrl: null,
									renderJob: null,
									sourceUrl: null,
								},
							],
					introUrl: null,
					jobs: input.withActiveJob ? [job] : [],
					outroUrl: null,
					sourceUrl: input.emptySelectedVideo
						? null
						: "/api/content/videos/video/source",
					transcription: input.emptySelectedVideo
						? null
						: ClipSETranscriptionMother.create({
								videoId: video.id,
							}),
					video,
				}
			: null,
		videos: [
			DashboardVideoMother.create({
				...video,
				activeJob: input.withActiveJob
					? {
							id: job.id,
							type: job.type,
							status: job.status,
							progress: job.progress,
							payload: job.payload,
							clipId: job.clipId,
							attempts: job.attempts,
							message: null,
						}
					: null,
				clipCount: input.emptySelectedVideo ? 0 : 1,
				readyClipCount: 0,
			}),
		],
	};
	mocks.aiSettingsData = ClipSEAiSettingsMother.create();
}

function setEmptyChannelDashboardData() {
	mocks.dashboardIsLoading = false;
	mocks.dashboardData = {
		channels: [],
		jobs: [],
		selectedChannel: null,
		selectedVideo: null,
		videos: [],
	};
	mocks.aiSettingsData = ClipSEAiSettingsMother.create();
}

describe("ClipSEWorkspace", () => {
	it("renders loading placeholders before dashboard data is available", () => {
		mocks.dashboardData = undefined;
		mocks.dashboardIsLoading = true;
		mocks.aiSettingsData = ClipSEAiSettingsMother.create();

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain("workspace.library.title");
		expect(markup).toContain("workspace.clipList.noSourceTitle");
		expect(markup).toContain("h-24 rounded-md bg-white/6");
	});

	it("renders the workspace shell and empty-source state", () => {
		setDashboardData({ withSelectedVideo: false });

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain("workspace.header.title");
		expect(markup).toContain("workspace.tabs.media");
		expect(markup).toContain("workspace.tabs.bumpers");
		expect(markup).toContain("workspace.tabs.intake");
		expect(markup).toContain("workspace.clipList.noSourceTitle");
		expect(markup).toContain('data-testid="language-switcher"');
	});

	it("requires the first channel before the workspace can be used", () => {
		setEmptyChannelDashboardData();

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain('data-requires-initial-channel="true"');
	});

	it("renders selected video details, transcript, chapters, and clip editor cards", () => {
		setDashboardData({ withSelectedVideo: true });

		const markup = renderToStaticMarkup(
			<ClipSEWorkspace requestedVideoId="11111111-1111-4111-8111-111111111111" />,
		);

		expect(markup).toContain("workspace.sourceDetail.originalFile");
		expect(markup).toContain("source-video.mp4");
		expect(markup).toContain("workspace.clipList.title");
		expect(markup).toContain('data-testid="clip-editor-card"');
		expect(markup).toContain("Launch clip");
		expect(markup).toContain("Opening hook");
		expect(markup).toContain("workspace.transcriptPanel.chapters");
	});

	it("renders floating job status when active jobs exist", () => {
		setDashboardData({ withActiveJob: true, withSelectedVideo: true });

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain('aria-label="workspace.queue.title"');
		expect(markup).toContain("42%");
	});

	it("renders failed selected sources without enabling generation", () => {
		setDashboardData({
			failedLibraryVideo: true,
			withSelectedVideo: true,
		});

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain("workspace.status.failed");
		expect(markup).toContain("workspace.sourceDetail.aiGenerate");
		expect(markup).toContain("workspace.sourceDetail.originalFile");
	});

	it("renders pending media, transcript, chapters, and empty clip states", () => {
		setDashboardData({
			emptySelectedVideo: true,
			withSelectedVideo: true,
		});

		const markup = renderToStaticMarkup(<ClipSEWorkspace />);

		expect(markup).toContain("workspace.sourceDetail.sourcePlaybackPending");
		expect(markup).toContain("workspace.transcriptPanel.transcriptPending");
		expect(markup).toContain("workspace.transcriptPanel.chapters");
		expect(markup).toContain("workspace.clipList.emptyTitle");
		expect(markup).not.toContain('data-testid="clip-editor-card"');
	});
});
