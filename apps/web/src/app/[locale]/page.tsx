import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { ClipSEWorkspace } from "~/components/clipse/ClipSEWorkspace";
import { type Locale, locales } from "~/i18n/config";
import { messages } from "~/i18n/messages";
import { isLocale, localizePath } from "~/i18n/path";
import { getSession, isLocalAnonymousAccessAllowed } from "~/server/auth";
import { api, HydrateClient } from "~/trpc/server";

interface LocaleHomePageProps {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<{
		videoId?: string;
	}>;
}

export async function generateMetadata({
	params,
}: LocaleHomePageProps): Promise<Metadata> {
	const { locale } = await params;
	if (!isLocale(locale)) {
		return {};
	}
	const requestLocale = locale as Locale;
	const dictionary = messages[requestLocale];
	const title = dictionary.metadata.title;
	const description = dictionary.metadata.description;
	const canonicalPath = localizePath(requestLocale, "/");

	return {
		title,
		description,
		keywords: [...dictionary.metadata.keywords],
		alternates: {
			canonical: canonicalPath,
			languages: Object.fromEntries(
				locales.map((supportedLocale) => [
					supportedLocale,
					localizePath(supportedLocale, "/"),
				]),
			),
		},
		openGraph: {
			title,
			description,
			type: "website",
			url: canonicalPath,
			siteName: "ClipSE",
			locale: requestLocale === "es" ? "es_ES" : "en_US",
			alternateLocale: locales
				.filter((supportedLocale) => supportedLocale !== requestLocale)
				.map((supportedLocale) =>
					supportedLocale === "es" ? "es_ES" : "en_US",
				),
			images: [
				{
					url: "/opengraph-image",
					width: 1200,
					height: 630,
					alt: process.env.NEXT_PUBLIC_SITE_URL,
				},
			],
		},
		twitter: {
			card: "summary_large_image",
			title,
			description,
			images: [
				{
					url: "/opengraph-image",
					width: 1200,
					height: 630,
					alt: process.env.NEXT_PUBLIC_SITE_URL,
				},
			],
		},
		robots: {
			index: true,
			follow: true,
		},
	};
}

export default async function LocaleHomePage({
	params,
	searchParams,
}: LocaleHomePageProps) {
	const { locale } = await params;
	if (!isLocale(locale)) {
		redirect(localizePath("en", "/"));
	}
	const requestLocale = locale as Locale;
	const requestedVideoId = (await searchParams)?.videoId ?? null;
	const session = await getSession();
	const hasWorkspaceAccess =
		!!session?.session || (await isLocalAnonymousAccessAllowed());

	if (!hasWorkspaceAccess) {
		const returnTo = requestedVideoId
			? `${localizePath(requestLocale, "/")}?videoId=${encodeURIComponent(requestedVideoId)}`
			: localizePath(requestLocale, "/");
		redirect(
			`${localizePath(requestLocale, "/sign-in")}?returnTo=${encodeURIComponent(returnTo)}`,
		);
	}

	void api.contentClip.dashboard.prefetch({
		selectedVideoId: requestedVideoId ?? undefined,
	});

	return (
		<HydrateClient>
			<ClipSEWorkspace
				isAuthenticated={!!session?.session}
				requestedVideoId={requestedVideoId}
			/>
		</HydrateClient>
	);
}
