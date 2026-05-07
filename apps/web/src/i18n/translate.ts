import type { Locale } from "./config";
import { messages } from "./messages";

export function createTranslator(locale: Locale) {
	const dictionary = messages[locale];

	return function translate(
		key: string,
		values?: Record<string, string | number>,
	): string {
		const resolved = key.split(".").reduce<unknown>((current, segment) => {
			if (current && typeof current === "object" && segment in current) {
				return (current as Record<string, unknown>)[segment];
			}
			return undefined;
		}, dictionary);

		if (typeof resolved !== "string") {
			return key;
		}

		return resolved.replace(/\{(\w+)\}/g, (match, token) => {
			const replacement = values?.[token];
			return replacement === undefined ? match : String(replacement);
		});
	};
}
