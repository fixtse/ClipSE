import { cookies, headers } from "next/headers";
import { type Locale, localeCookieName } from "./config";
import { messages } from "./messages";
import { isLocale, resolvePreferredLocale } from "./path";

export { createTranslator } from "./translate";

export async function getRequestLocale(): Promise<Locale> {
	const headerStore = await headers();
	const headerLocale = headerStore.get("x-locale");
	if (isLocale(headerLocale)) {
		return headerLocale;
	}

	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get(localeCookieName)?.value;
	if (isLocale(cookieLocale)) {
		return cookieLocale;
	}

	return resolvePreferredLocale(headerStore.get("accept-language") ?? "");
}

export async function getMessages(locale?: Locale) {
	const requestLocale = locale ?? (await getRequestLocale());
	return messages[requestLocale];
}
