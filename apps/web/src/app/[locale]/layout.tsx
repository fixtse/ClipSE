import { notFound } from "next/navigation";

import { locales } from "~/i18n/config";
import { isLocale } from "~/i18n/path";
import { I18nProvider } from "~/i18n/provider";
import { getMessages } from "~/i18n/server";

export function generateStaticParams() {
	return locales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({
	children,
	params,
}: Readonly<{
	children: React.ReactNode;
	params: Promise<{ locale: string }>;
}>) {
	const { locale } = await params;
	if (!isLocale(locale)) {
		notFound();
	}

	const messages = await getMessages(locale);

	return (
		<I18nProvider locale={locale} messages={messages}>
			{children}
		</I18nProvider>
	);
}
