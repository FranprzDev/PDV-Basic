import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { NextIntlClientProvider } from "next-intl";
import { getLocale, getMessages } from "next-intl/server";
import { Toaster } from "sonner";
import { TRPCReactProvider } from "@/components/trpc-provider";
import { APP_NAME } from "@/lib/config";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
	title: APP_NAME,
	description: "Punto de venta para almacenes de barrio",
};

export default async function RootLayout({
	children,
}: {
	children: React.ReactNode;
}) {
	const locale = await getLocale();
	const messages = await getMessages();

	return (
		<html lang={locale}>
			<body className={inter.className}>
				<NextIntlClientProvider locale={locale} messages={messages}>
					<TRPCReactProvider>
						<main>{children}</main>
						<Toaster richColors position="bottom-right" />
					</TRPCReactProvider>
				</NextIntlClientProvider>
			</body>
		</html>
	);
}
