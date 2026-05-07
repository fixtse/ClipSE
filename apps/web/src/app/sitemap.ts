import type { MetadataRoute } from "next";
import { locales } from "~/i18n/config";

export default function sitemap(): MetadataRoute.Sitemap {
	const baseUrl = process.env.NEXT_PUBLIC_BASE_URL ?? "http://localhost:3000";
	const paths = locales.map((locale) => `/${locale}`);

	return paths.map((path) => ({
		url: `${baseUrl}${path}`,
		lastModified: new Date(),
		changeFrequency: "monthly",
		priority: path.split("/").length === 2 ? 1 : 0.3,
	}));
}
