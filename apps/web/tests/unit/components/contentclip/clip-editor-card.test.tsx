import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ClipEditorCard } from "~/components/contentclip/clip-editor/ClipEditorCard";
import { DashboardClipMother } from "../../../mothers/domain-mothers";

vi.mock("~/i18n/provider", () => ({
	useTranslations:
		() => (key: string, values?: Record<string, string | number>) =>
			values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("react-player", () => ({
	default: () => null,
}));

const handlers = {
	onAiGenerate: vi.fn(async () => undefined),
	onDelete: vi.fn(async () => undefined),
	onRender: vi.fn(async () => undefined),
	onSave: vi.fn(async () => undefined),
};

describe("ClipEditorCard", () => {
	it("renders source-pending state and disables save when there are no draft changes", () => {
		const clip = DashboardClipMother.create({
			title: "Manual clip",
			hook: "Manual hook",
			rationale: "Manual clip",
			sourceUrl: null,
			downloadUrl: null,
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={0}
				frameRate={30}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl={null}
				{...handlers}
			/>,
		);

		expect(markup).toContain("Manual clip");
		expect(markup).toContain("Manual hook");
		expect(markup).toContain("workspace.clipEditor.editorNotes");
		expect(markup).toContain("Clip summary");
		expect(markup).toContain("workspace.clipEditor.sourcePending");
		expect(markup).toContain('aria-label="workspace.clipEditor.copyTitle"');
		expect(markup).toContain("workspace.clipEditor.aiGenerate");
	});

	it("renders render progress and disables destructive/render actions while rendering", () => {
		const clip = DashboardClipMother.create({
			status: "rendering",
			renderJob: {
				id: "job-id",
				status: "running",
				progress: 64,
				message: "Encoding clip",
			},
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={15}
				frameRate={24}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl="https://media.test/source.mp4"
				{...handlers}
			/>,
		);

		expect(markup).toContain("workspace.clipEditor.exporting");
		expect(markup).toContain("workspace.clipEditor.renderStatus");
		expect(markup).toContain("64%");
		expect(markup).toContain("Encoding clip");
		expect(markup).toContain("disabled=");
	});

	it("renders source and clip controls when source media is available", () => {
		const clip = DashboardClipMother.create({
			startSeconds: 5,
			endSeconds: 12,
			sourceUrl: null,
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={7}
				frameRate={30}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl="https://media.test/source.mp4"
				{...handlers}
			/>,
		);

		expect(markup).toContain("workspace.clipEditor.source");
		expect(markup).toContain("workspace.clipEditor.clip");
		expect(markup).toContain("workspace.clipEditor.setIn");
		expect(markup).toContain("workspace.clipEditor.setOut");
		expect(markup).toContain("workspace.clipEditor.playerToStart");
		expect(markup).toContain("0:05");
		expect(markup).toContain("0:12");
	});

	it("renders render status without an optional worker message", () => {
		const clip = DashboardClipMother.create({
			renderJob: {
				id: "job-id",
				status: "pending",
				progress: 0,
				message: null,
			},
			status: "queued",
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={15}
				frameRate={24}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl="https://media.test/source.mp4"
				{...handlers}
			/>,
		);

		expect(markup).toContain("workspace.clipEditor.renderStatus");
		expect(markup).toContain("0%");
		expect(markup).not.toContain("Encoding clip");
	});

	it("renders download state and download link for rendered clips", () => {
		const clip = DashboardClipMother.create({
			status: "ready",
			downloadUrl: "/api/content/clips/clip-id/download",
			downloadedAt: null,
			sourceUrl: "/api/content/clips/clip-id/source",
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={20}
				frameRate={null}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl="https://media.test/source.mp4"
				{...handlers}
			/>,
		);

		expect(markup).toContain("workspace.clipEditor.mp4File");
		expect(markup).toContain("workspace.clipEditor.notDownloaded");
		expect(markup).toContain('href="/api/content/clips/clip-id/download"');
		expect(markup).toContain("workspace.clipEditor.downloadMp4");
	});

	it("renders downloaded state for clips already marked downloaded", () => {
		const clip = DashboardClipMother.create({
			downloadUrl: "/api/content/clips/clip-id/download",
			downloadedAt: new Date("2026-01-02T00:00:00.000Z"),
			status: "ready",
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={20}
				frameRate={null}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl="https://media.test/source.mp4"
				{...handlers}
			/>,
		);

		expect(markup).toContain("workspace.clipEditor.downloaded");
		expect(markup).not.toContain("workspace.clipEditor.notDownloaded");
	});

	it("hides AI generation for AI-generated clips", () => {
		const clip = DashboardClipMother.create({
			rationale: "AI selected this clip",
		});

		const markup = renderToStaticMarkup(
			<ClipEditorCard
				clip={clip}
				currentTime={0}
				frameRate={30}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl={null}
				{...handlers}
			/>,
		);

		expect(markup).not.toContain("workspace.clipEditor.aiGenerate");
	});

	it("disables AI generation for too-short manual ranges and pending mutations", () => {
		const shortClip = DashboardClipMother.create({
			endSeconds: 10.5,
			rationale: "Manual clip",
			startSeconds: 10,
		});

		const shortMarkup = renderToStaticMarkup(
			<ClipEditorCard
				clip={shortClip}
				currentTime={0}
				frameRate={30}
				maxDurationSeconds={120}
				mutationPending={false}
				sourceUrl={null}
				{...handlers}
			/>,
		);
		const pendingMarkup = renderToStaticMarkup(
			<ClipEditorCard
				clip={DashboardClipMother.create({ rationale: "Manual clip" })}
				currentTime={0}
				frameRate={30}
				maxDurationSeconds={120}
				mutationPending
				sourceUrl={null}
				{...handlers}
			/>,
		);

		expect(shortMarkup).toContain("workspace.clipEditor.aiGenerate");
		expect(shortMarkup).toContain("disabled=");
		expect(pendingMarkup).toContain("workspace.clipEditor.aiGenerate");
		expect(pendingMarkup).toContain("disabled=");
	});
});
