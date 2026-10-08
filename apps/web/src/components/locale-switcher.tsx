"use client";

import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import { useRouter } from "next/navigation";
import { useLocale } from "next-intl";
import { type Locale, locales } from "@/i18n/config";
import { setLocale } from "@/i18n/locale";

const localeNames: Record<Locale, string> = {
	es: "Español",
	en: "English",
	"pt-BR": "Português",
};

export function LocaleSwitcher() {
	const locale = useLocale();
	const router = useRouter();

	async function onChange(value: string) {
		await setLocale(value as Locale);
		router.refresh();
	}

	return (
		<Select value={locale} onValueChange={onChange}>
			<SelectTrigger className="h-8 w-[130px] text-xs">
				<SelectValue />
			</SelectTrigger>
			<SelectContent>
				{locales.map((loc) => (
					<SelectItem key={loc} value={loc}>
						{localeNames[loc]}
					</SelectItem>
				))}
			</SelectContent>
		</Select>
	);
}
