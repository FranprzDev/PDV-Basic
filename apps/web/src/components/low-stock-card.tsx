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
import { useTranslations } from "next-intl";
import { useTRPC } from "@/lib/trpc/client";

export function LowStockCard() {
	const trpc = useTRPC();
	const { data = [], isLoading } = useQuery(
		trpc.products.lowStock.queryOptions(),
	);
	const t = useTranslations("dashboard");

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="font-medium text-sm">{t("lowStock")}</CardTitle>
				<PackageSearch className="h-4 w-4 text-muted-foreground" />
			</CardHeader>
			<CardContent>
				{isLoading ? (
					<p className="text-muted-foreground text-sm">{t("loading")}</p>
				) : data.length === 0 ? (
					<p className="text-muted-foreground text-sm">{t("stockOk")}</p>
				) : (
					<>
						<div className="font-bold text-2xl">{data.length}</div>
						<ul className="mt-2 space-y-1 text-sm">
							{data.slice(0, 5).map((p) => (
								<li key={p.id} className="flex justify-between gap-2">
									<Link
										href="/admin/products"
										className="truncate underline-offset-2 hover:underline"
									>
										{p.name}
									</Link>
									<span className="shrink-0 tabular-nums">
										{p.in_stock} / {p.min_stock}
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
