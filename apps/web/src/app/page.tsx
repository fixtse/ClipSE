import { redirect } from "next/navigation";
import { localizePath } from "~/i18n/path";
import { getRequestLocale } from "~/i18n/server";

export default async function Home() {
	const locale = await getRequestLocale();
	redirect(localizePath(locale, "/"));
}
