import { redirect } from "next/navigation";
import { defaultLocale } from "~/i18n/config";
import { localizePath } from "~/i18n/path";

interface SignInRedirectPageProps {
	searchParams?: Promise<{ returnTo?: string }>;
}

export default async function SignInRedirectPage({
	searchParams,
}: SignInRedirectPageProps) {
	const returnTo = (await searchParams)?.returnTo;
	const target = localizePath(defaultLocale, "/sign-in");
	redirect(returnTo ? `${target}?returnTo=${encodeURIComponent(returnTo)}` : target);
}
