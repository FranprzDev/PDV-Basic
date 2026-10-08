"use client";

import {
	Card,
	CardContent,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import { useQuery } from "@tanstack/react-query";
import { PackageSearch } from "lucide-react";
import Link from "next/link";
import { useLocale, useTranslations } from "next-intl";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";
import { formatCurrency } from "@/lib/utils";

type Product = RouterOutputs["products"]["list"][number];

export function LowStockCard() {
	const trpc = useTRPC();
	const { data = [], isLoading } = useQuery(
		trpc.products.lowStock.queryOptions(),
	);
	const t = useTranslations("dashboard");
	const locale = useLocale();

	if (isLoading) {
		return (
			<Card>
				<CardHeader>
					<CardTitle className="text-sm">{t("lowStock")}</CardTitle>
				</CardHeader>
				<CardContent className="text-muted-foreground text-sm">
					{t("loading")}
				</CardContent>
			</Card>
		);
	}

	const products: Product[] = data;

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="font-medium text-sm">{t("lowStock")}</CardTitle>
				<PackageSearch className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{products.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("stockOk")}</p>
				) : (
					<>
						<div className="font-bold text-2xl">{products.length}</div>
						<ul className="mt-2 space-y-1 text-sm">
							{products.slice(0, 5).map((p) => (
								<li key={p.id} className="flex justify-between gap-2">
									<Link
										href="/admin/products"
										className="truncate underline-offset-2 hover:underline"
									>
										{p.name}
									</Link>
									<span className="tabular-nums">
										{p.in_stock} / {formatCurrency(p.price, locale)}
									</span>
								</li>
							))}
						</ul>
						<p className="mt-2 text-muted-foreground text-xs">
							{t("replenishHint")}
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}
