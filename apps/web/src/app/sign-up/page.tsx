import { redirect } from "next/navigation";
import { defaultLocale } from "~/i18n/config";
import { localizePath } from "~/i18n/path";

interface SignUpRedirectPageProps {
	searchParams?: Promise<{ returnTo?: string }>;
}

export default async function SignUpRedirectPage({
	searchParams,
}: SignUpRedirectPageProps) {
	const returnTo = (await searchParams)?.returnTo;
	const target = localizePath(defaultLocale, "/sign-up");
	redirect(
		returnTo ? `${target}?returnTo=${encodeURIComponent(returnTo)}` : target,
	);
}
