import { type NextRequest, NextResponse } from "next/server";
import { defaultLocale, type Locale, localeCookieName } from "~/i18n/config";
import {
	isLocale,
	resolveLocaleFromPathname,
	resolvePreferredLocale,
	stripLocalePrefix,
} from "~/i18n/path";

function shouldIgnorePath(pathname: string) {
	return (
		pathname.startsWith("/_next") ||
		pathname.startsWith("/api") ||
		pathname.startsWith("/favicon") ||
		pathname.startsWith("/robots.txt") ||
		pathname.startsWith("/sitemap.xml") ||
		pathname.includes(".")
	);
}

function getCookieLocale(request: NextRequest): Locale | null {
	const cookieLocale = request.cookies.get(localeCookieName)?.value;
	return isLocale(cookieLocale) ? cookieLocale : null;
}

function getLocale(request: NextRequest): Locale {
	return (
		getCookieLocale(request) ??
		resolvePreferredLocale(request.headers.get("accept-language") ?? "") ??
		defaultLocale
	);
}

export function proxy(request: NextRequest) {
	const { pathname } = request.nextUrl;

	if (shouldIgnorePath(pathname)) {
		return NextResponse.next();
	}

	const pathnameLocale = resolveLocaleFromPathname(pathname);
	const locale = pathnameLocale ?? getLocale(request);
	const requestHeaders = new Headers(request.headers);
	requestHeaders.set("x-locale", locale);

	if (!pathnameLocale) {
		const localizedUrl = request.nextUrl.clone();
		localizedUrl.pathname = `/${locale}${stripLocalePrefix(pathname)}`;
		const response = NextResponse.redirect(localizedUrl);
		response.cookies.set(localeCookieName, locale, {
			path: "/",
			maxAge: 60 * 60 * 24 * 365,
			sameSite: "lax",
		});
		return response;
	}

	const response = NextResponse.next({
		request: {
			headers: requestHeaders,
		},
	});

	response.cookies.set(localeCookieName, locale, {
		path: "/",
		maxAge: 60 * 60 * 24 * 365,
		sameSite: "lax",
	});

	return response;
}

export const config = {
	matcher: ["/((?!_next|api|favicon.ico|robots.txt|sitemap.xml|.*\\.).*)"],
};
