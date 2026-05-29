import { redirect } from "next/navigation";
import { AuthForm } from "~/components/auth/AuthForm";
import { env } from "~/env";
import { defaultLocale, type Locale } from "~/i18n/config";
import { isLocale, localizePath } from "~/i18n/path";
import { getSession, hasExistingUser } from "~/server/auth";

interface SignUpPageProps {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<{ returnTo?: string }>;
}

export default async function SignUpPage({
	params,
	searchParams,
}: SignUpPageProps) {
	const { locale: rawLocale } = await params;
	const locale: Locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
	const returnTo = (await searchParams)?.returnTo ?? localizePath(locale, "/");
	const session = await getSession();

	if (session?.session) {
		redirect(returnTo);
	}
	if (env.CLIPSE_DISABLE_AUTH === "true") {
		redirect(returnTo);
	}

	const switchHref = `${localizePath(locale, "/sign-in")}?returnTo=${encodeURIComponent(returnTo)}`;

	if (await hasExistingUser()) {
		redirect(switchHref);
	}

	return (
		<AuthForm
			allowAnonymousMode
			mode="sign-up"
			returnTo={returnTo}
			switchHref={switchHref}
		/>
	);
}
