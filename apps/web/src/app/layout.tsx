import "~/styles/globals.css";

import type { Metadata } from "next";
import { Bricolage_Grotesque, IBM_Plex_Mono } from "next/font/google";
import { Toaster } from "react-hot-toast";

import { defaultLocale } from "~/i18n/config";
import { messages } from "~/i18n/messages";
import { getRequestLocale } from "~/i18n/server";
import { TRPCReactProvider } from "~/trpc/react";

const defaultMessages = messages[defaultLocale];

export const metadata: Metadata = {
	title: {
		default: defaultMessages.metadata.title,
		template: "%s | ClipSE",
	},
	description: defaultMessages.metadata.description,
	keywords: [...defaultMessages.metadata.keywords],
	authors: [{ name: "Fixt" }],
	creator: "Fixt",
	publisher: "ClipSE",
	icons: [{ rel: "icon", url: "/favicon.ico" }],
	metadataBase: new URL(
		process.env.NEXT_PUBLIC_BASE_URL ??
			process.env.VERCEL_URL ??
			"http://localhost:3000",
	),
	openGraph: {
		title: defaultMessages.metadata.title,
		description: defaultMessages.metadata.description,
		type: "website",
		locale: "en_US",
		siteName: "ClipSE",
		url: "./",
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
	},
	robots: {
		index: true,
		follow: true,
	},
};

const bricolage = Bricolage_Grotesque({
	subsets: ["latin"],
	variable: "--font-bricolage",
});

const ibmPlexMono = IBM_Plex_Mono({
	subsets: ["latin"],
	variable: "--font-ibm-plex-mono",
	weight: ["400", "500"],
});

export default async function RootLayout({
	children,
}: Readonly<{ children: React.ReactNode }>) {
	const locale = await getRequestLocale();

	return (
		<html
			className={`dark ${bricolage.variable} ${ibmPlexMono.variable}`}
			lang={locale}
			suppressHydrationWarning
		>
			<body>
				<TRPCReactProvider>{children}</TRPCReactProvider>
				<Toaster
					position="bottom-left"
					toastOptions={{
						className: "dark:bg-slate-800 dark:text-slate-100",
						duration: 4000,
					}}
				/>
			</body>
		</html>
	);
}
