import type * as React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	onValueChange: null as null | ((value: string) => void),
	routerReplace: vi.fn(),
}));

vi.mock("~/i18n/provider", () => ({
	useLocale: () => "en",
	useTranslations:
		() => (key: string, values?: Record<string, string | number>) =>
			values ? `${key}:${Object.values(values).join(",")}` : key,
}));

vi.mock("next/navigation", () => ({
	usePathname: () => "/en/workspace",
	useRouter: () => ({
		replace: mocks.routerReplace,
	}),
	useSearchParams: () => new URLSearchParams("videoId=video-1"),
}));

vi.mock("~/components/ui/select", () => ({
	Select: ({
		children,
		onValueChange,
		value,
	}: {
		children: React.ReactNode;
		onValueChange: (value: string) => void;
		value: string;
	}) => {
		mocks.onValueChange = onValueChange;
		return (
			<div data-slot="select" data-value={value}>
				{children}
			</div>
		);
	},
	SelectContent: ({ children }: { children: React.ReactNode }) => (
		<div data-slot="select-content">{children}</div>
	),
	SelectItem: ({
		children,
		value,
	}: {
		children: React.ReactNode;
		value: string;
	}) => (
		<div data-slot="select-item" data-value={value}>
			{children}
		</div>
	),
	SelectTrigger: ({ children, ...props }: React.ComponentProps<"button">) => (
		<button data-slot="select-trigger" type="button" {...props}>
			{children}
		</button>
	),
	SelectValue: ({ children }: { children: React.ReactNode }) => (
		<span data-slot="select-value">{children}</span>
	),
}));

vi.mock("react-player", () => ({
	default: () => null,
}));

import { ModelCombobox } from "~/components/contentclip/clip-editor/ClipEditorCard";
import { LanguageSwitcher } from "~/components/contentclip/LanguageSwitcher";

describe("contentclip components", () => {
	it("renders the language switcher with the active locale and accessible label", () => {
		const markup = renderToStaticMarkup(<LanguageSwitcher />);

		expect(markup).toContain('aria-label="localeSwitcher.ariaLabel"');
		expect(markup).toContain("localeSwitcher.en");
		expect(markup).toContain('data-value="es"');
	});

	it("replaces the localized route when a new locale is selected", () => {
		renderToStaticMarkup(<LanguageSwitcher />);

		mocks.onValueChange?.("en");
		expect(mocks.routerReplace).not.toHaveBeenCalled();

		mocks.onValueChange?.("es");
		expect(mocks.routerReplace).toHaveBeenCalledWith(
			"/es/workspace?videoId=video-1",
		);
	});

	it("renders model combobox labels for selected and custom values", () => {
		const selectedMarkup = renderToStaticMarkup(
			<ModelCombobox
				isLoading={false}
				onChange={vi.fn()}
				options={[
					{ value: "model-a", label: "Model A" },
					{ value: "model-b", label: "Model B" },
				]}
				value="model-b"
			/>,
		);
		const customMarkup = renderToStaticMarkup(
			<ModelCombobox
				isLoading={false}
				onChange={vi.fn()}
				options={[]}
				value="custom/model"
			/>,
		);

		expect(selectedMarkup).toContain("Model B");
		expect(selectedMarkup).toContain('role="combobox"');
		expect(customMarkup).toContain("custom/model");
	});
});
