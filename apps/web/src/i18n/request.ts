import { cookies } from "next/headers";
import { getRequestConfig } from "next-intl/server";
import { defaultLocale, type Locale, locales } from "./config";

const messageImports = {
	es: () => import("../messages/es"),
	en: () => import("../messages/en"),
	"pt-BR": () => import("../messages/pt-BR"),
} as const;

export default getRequestConfig(async () => {
	const cookieStore = await cookies();
	const cookieLocale = cookieStore.get("locale")?.value;
	const locale: Locale =
		cookieLocale && locales.includes(cookieLocale as Locale)
			? (cookieLocale as Locale)
			: defaultLocale;

	return {
		locale,
		messages: (await messageImports[locale]()).default,
	};
});
