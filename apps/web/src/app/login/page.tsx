"use client";

import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent, CardFooter } from "@finopenpos/ui/components/card";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import { MountainIcon } from "lucide-react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { useRef } from "react";
import { LocaleSwitcher } from "@/components/locale-switcher";
import { login } from "./actions";

export default function LoginPage() {
	const emailRef = useRef<HTMLInputElement>(null);
	const passwordRef = useRef<HTMLInputElement>(null);
	const t = useTranslations("login");

	function fillDemo() {
		if (emailRef.current) emailRef.current.value = "test@example.com";
		if (passwordRef.current) passwordRef.current.value = "test1234";
	}

	return (
		<div className="flex min-h-screen flex-col items-center justify-center bg-background">
			<div className="absolute top-4 right-4">
				<LocaleSwitcher />
			</div>
			<div className="mx-auto w-full max-w-md space-y-6">
				<div className="flex flex-col items-center space-y-2">
					<MountainIcon className="h-10 w-10" />
					<h2 className="font-bold text-2xl">{t("title")}</h2>
					<p className="text-muted-foreground text-sm">{t("subtitle")}</p>
				</div>
				<Card>
					<form>
						<CardContent className="mt-4 space-y-4">
							<div className="grid gap-2">
								<Label htmlFor="email">{t("email")}</Label>
								<Input
									ref={emailRef}
									id="email"
									name="email"
									type="email"
									placeholder={t("emailPlaceholder")}
									required
									autoComplete="email"
								/>
							</div>
							<div className="grid gap-2">
								<Label htmlFor="password">{t("password")}</Label>
								<Input
									ref={passwordRef}
									id="password"
									name="password"
									type="password"
									required
									autoComplete="current-password"
								/>
							</div>
						</CardContent>
						<CardFooter className="flex flex-col gap-4">
							<Button className="w-full" formAction={login}>
								{t("submit")}
							</Button>
							<Button
								type="button"
								variant="outline"
								className="w-full"
								onClick={fillDemo}
							>
								{t("fillDemo")}
							</Button>
							<p className="text-center text-muted-foreground text-sm">
								{t("noAccount")}{" "}
								<Link
									href="/signup"
									className="text-primary underline-offset-4 hover:underline"
								>
									{t("signUp")}
								</Link>
							</p>
						</CardFooter>
					</form>
				</Card>
			</div>
		</div>
	);
}
