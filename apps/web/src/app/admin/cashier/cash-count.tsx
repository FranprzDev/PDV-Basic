"use client";

import { Badge } from "@finopenpos/ui/components/badge";
import {
	Card,
	CardContent,
	CardDescription,
	CardHeader,
	CardTitle,
} from "@finopenpos/ui/components/card";
import {
	type ChartConfig,
	ChartContainer,
	ChartLegend,
	ChartLegendContent,
	ChartTooltip,
	ChartTooltipContent,
} from "@finopenpos/ui/components/chart";
import { Input } from "@finopenpos/ui/components/input";
import { useState } from "react";
import { Bar, BarChart, CartesianGrid, XAxis, YAxis } from "recharts";
import {
	type CountableTransaction,
	countDifference,
	expectedByMethod,
	totalDifference,
} from "@/lib/cash-count/cash-count";
import { formatCurrency, formatDate } from "@/lib/utils";

interface CashCountProps {
	transactions: CountableTransaction[];
	methodNames: Map<number, string>;
	labels: {
		title: string;
		subtitle: string;
		expected: string;
		counted: string;
		difference: string;
		exact: string;
		short: string;
		over: string;
		noMethod: string;
		total: string;
		empty: string;
	};
	locale: string;
}

export function CashCount({
	transactions,
	methodNames,
	labels,
	locale,
}: CashCountProps) {
	const today = new Date();
	const expected = expectedByMethod(transactions, today);
	const [counts, setCounts] = useState<Record<string, number>>({});

	const total = totalDifference(counts, expected);
	const rows = expected.map((m) => {
		const counted = counts[String(m.methodId)] ?? 0;
		return {
			methodId: m.methodId,
			name:
				m.methodId === null
					? labels.noMethod
					: (methodNames.get(m.methodId) ?? `#${m.methodId}`),
			expected: m.expected,
			counted,
			diff: countDifference(counted, m.expected),
		};
	});

	const chartConfig = {
		expected: { label: labels.expected, color: "hsl(var(--chart-1))" },
		counted: { label: labels.counted, color: "hsl(var(--chart-2))" },
	} satisfies ChartConfig;

	return (
		<Card className="w-full">
			<CardHeader>
				<CardTitle>{labels.title}</CardTitle>
				<CardDescription>
					{labels.subtitle} · {formatDate(today.toISOString(), locale)}
				</CardDescription>
			</CardHeader>
			<CardContent className="space-y-4">
				{rows.length === 0 ? (
					<p className="text-muted-foreground text-sm">{labels.empty}</p>
				) : (
					<>
						<div className="space-y-2">
							{rows.map((row) => (
								<div
									key={String(row.methodId)}
									className="flex flex-wrap items-center gap-2 rounded-md border p-2"
								>
									<span className="min-w-28 flex-1 font-medium text-sm">
										{row.name}
									</span>
									<span className="text-muted-foreground text-sm tabular-nums">
										{labels.expected}: {formatCurrency(row.expected, locale)}
									</span>
									<Input
										type="number"
										min="0"
										step="0.01"
										className="h-8 w-28"
										aria-label={`${labels.counted} ${row.name}`}
										value={row.counted || ""}
										placeholder="0.00"
										onChange={(e) =>
											setCounts({
												...counts,
												[String(row.methodId)]: Math.round(
													Number(e.target.value) * 100,
												),
											})
										}
									/>
									<Badge
										variant={
											row.diff === 0
												? "default"
												: row.diff < 0
													? "destructive"
													: "secondary"
										}
									>
										{row.diff === 0
											? labels.exact
											: `${row.diff < 0 ? labels.short : labels.over} ${formatCurrency(row.diff, locale)}`}
									</Badge>
								</div>
							))}
						</div>
						<ChartContainer config={chartConfig} className="h-[220px] w-full">
							<BarChart
								accessibilityLayer
								data={rows.map((r) => ({
									name: r.name,
									expected: r.expected / 100,
									counted: r.counted / 100,
								}))}
							>
								<CartesianGrid vertical={false} strokeDasharray="3 3" />
								<XAxis
									dataKey="name"
									tickLine={false}
									tickMargin={10}
									axisLine={false}
								/>
								<YAxis tickLine={false} axisLine={false} width={50} />
								<ChartTooltip content={<ChartTooltipContent />} />
								<ChartLegend content={<ChartLegendContent />} />
								<Bar
									dataKey="expected"
									fill="var(--color-expected)"
									radius={[4, 4, 0, 0]}
								/>
								<Bar
									dataKey="counted"
									fill="var(--color-counted)"
									radius={[4, 4, 0, 0]}
								/>
							</BarChart>
						</ChartContainer>
						<p className="font-medium text-sm">
							{labels.total}:{" "}
							<span
								className={
									total === 0
										? "text-green-600"
										: total < 0
											? "text-destructive"
											: undefined
								}
							>
								{formatCurrency(total, locale)}
							</span>
						</p>
					</>
				)}
			</CardContent>
		</Card>
	);
}
