import { defaultLocale, type Locale, locales } from "./config";

export function isLocale(value: string | null | undefined): value is Locale {
	return !!value && (locales as readonly string[]).includes(value);
}

export function stripLocalePrefix(pathname: string): string {
	const pathnameParts = pathname.split("/").filter(Boolean);
	if (!pathnameParts[0] || !isLocale(pathnameParts[0])) {
		return pathname;
	}

	const remainder = `/${pathnameParts.slice(1).join("/")}`;
	return remainder === "/" ? "/" : remainder || "/";
}

export function localizePath(locale: Locale, pathname: string): string {
	const normalizedPath = pathname.startsWith("/") ? pathname : `/${pathname}`;
	const strippedPath = stripLocalePrefix(normalizedPath);
	return strippedPath === "/" ? `/${locale}` : `/${locale}${strippedPath}`;
}

export function resolveLocaleFromPathname(pathname: string): Locale | null {
	const pathnameParts = pathname.split("/").filter(Boolean);
	const maybeLocale = pathnameParts[0];
	return isLocale(maybeLocale) ? maybeLocale : null;
}

export function normalizeLocale(value: string | null | undefined): Locale {
	return isLocale(value) ? value : defaultLocale;
}

function parseAcceptLanguage(value: string): readonly string[] {
	return value
		.split(",")
		.map((entry) => entry.split(";")[0]?.trim().toLowerCase())
		.filter((entry): entry is string => !!entry);
}

export function resolvePreferredLocale(acceptLanguage: string): Locale {
	const preferredLanguages = parseAcceptLanguage(acceptLanguage);
	for (const language of preferredLanguages) {
		if (language.startsWith("es")) {
			return "es";
		}
		if (language.startsWith("en")) {
			return "en";
		}
	}

	return defaultLocale;
}
