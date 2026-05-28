import type { Locale } from "./config";
import { enMessages } from "./messages/en";
import { esMessages } from "./messages/es";

export const messages = {
	en: enMessages,
	es: esMessages,
} as const;

export type Messages = (typeof messages)[Locale];
