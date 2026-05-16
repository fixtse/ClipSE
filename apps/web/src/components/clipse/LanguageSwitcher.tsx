"use client";

import { Globe2 } from "lucide-react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { type Locale, locales } from "~/i18n/config";
import { localizePath } from "~/i18n/path";
import { useLocale, useTranslations } from "~/i18n/provider";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "../ui/select";

export function LanguageSwitcher() {
	const locale = useLocale();
	const translate = useTranslations();
	const pathname = usePathname();
	const router = useRouter();
	const searchParams = useSearchParams();

	function handleChange(nextLocale: string) {
		if (nextLocale === locale) {
			return;
		}

		const resolvedLocale = nextLocale as Locale;
		const localizedPath = localizePath(resolvedLocale, pathname || "/");
		const queryString = searchParams.toString();

		router.replace(
			queryString ? `${localizedPath}?${queryString}` : localizedPath,
		);
	}

	return (
		<Select onValueChange={handleChange} value={locale}>
			<SelectTrigger
				aria-label={translate("localeSwitcher.ariaLabel")}
				className="w-[156px] border-white/10 bg-white/6 text-slate-100 hover:bg-white/10"
			>
				<SelectValue>
					<span className="flex items-center gap-2">
						<Globe2 className="h-4 w-4" />
						{translate(`localeSwitcher.${locale}`)}
					</span>
				</SelectValue>
			</SelectTrigger>
			<SelectContent>
				{locales.map((supportedLocale) => (
					<SelectItem key={supportedLocale} value={supportedLocale}>
						{translate(`localeSwitcher.${supportedLocale}`)}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
