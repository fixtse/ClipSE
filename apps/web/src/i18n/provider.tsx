"use client";

import { createContext, type ReactNode, useContext, useMemo } from "react";
import type { Locale } from "./config";
import type { Messages } from "./messages";
import { createTranslator } from "./translate";

interface I18nContextValue {
	locale: Locale;
	messages: Messages;
	translate: ReturnType<typeof createTranslator>;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export interface I18nProviderProps {
	children: ReactNode;
	locale: Locale;
	messages: Messages;
}

export function I18nProvider({
	children,
	locale,
	messages,
}: I18nProviderProps) {
	const value = useMemo(
		() => ({
			locale,
			messages,
			translate: createTranslator(locale),
		}),
		[locale, messages],
	);

	return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
	const context = useContext(I18nContext);
	if (!context) {
		throw new Error("useI18n must be used within an I18nProvider");
	}

	return context;
}

export function useLocale() {
	return useI18n().locale;
}

export function useTranslations() {
	return useI18n().translate;
}
