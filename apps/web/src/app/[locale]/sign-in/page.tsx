import { redirect } from "next/navigation";
import { AuthForm } from "~/components/auth/AuthForm";
import { defaultLocale, type Locale } from "~/i18n/config";
import { isLocale, localizePath } from "~/i18n/path";
import { getSession, hasExistingUser } from "~/server/auth";

interface SignInPageProps {
	params: Promise<{ locale: string }>;
	searchParams?: Promise<{ returnTo?: string }>;
}

export default async function SignInPage({
	params,
	searchParams,
}: SignInPageProps) {
	const { locale: rawLocale } = await params;
	const locale: Locale = isLocale(rawLocale) ? rawLocale : defaultLocale;
	const returnTo = (await searchParams)?.returnTo ?? localizePath(locale, "/");
	const session = await getSession();

	if (session?.session) {
		redirect(returnTo);
	}

	const switchHref = `${localizePath(locale, "/sign-up")}?returnTo=${encodeURIComponent(returnTo)}`;
	const canCreateAccount = !(await hasExistingUser());

	return (
		<AuthForm
			mode="sign-in"
			returnTo={returnTo}
			switchHref={canCreateAccount ? switchHref : undefined}
		/>
	);
}
