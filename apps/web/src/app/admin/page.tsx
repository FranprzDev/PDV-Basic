"use client";

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
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import { useQuery } from "@tanstack/react-query";
import { DollarSign, TrendingDown, TrendingUp, Wallet } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import {
	Area,
	AreaChart,
	Bar,
	BarChart,
	CartesianGrid,
	Cell,
	Label,
	Pie,
	PieChart,
	XAxis,
	YAxis,
} from "recharts";
import { LowStockCard } from "@/components/low-stock-card";
import { QuickActions } from "@/components/quick-actions";
import { useTRPC } from "@/lib/trpc/client";
import { formatCurrency, formatShortDate } from "@/lib/utils";

const CHART_COLORS = [
	"hsl(var(--chart-1))",
	"hsl(var(--chart-2))",
	"hsl(var(--chart-3))",
	"hsl(var(--chart-4))",
	"hsl(var(--chart-5))",
];

export default function Page() {
	const trpc = useTRPC();
	const { data, isLoading } = useQuery(trpc.dashboard.stats.queryOptions());
	const t = useTranslations("dashboard");
	const locale = useLocale();

	if (isLoading || !data) {
		return (
			<div className="grid flex-1 items-start gap-6">
				<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
					{Array.from({ length: 3 }).map((_, i) => (
						<Card key={i}>
							<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
								<Skeleton className="h-4 w-24" />
								<Skeleton className="h-4 w-4" />
							</CardHeader>
							<CardContent>
								<Skeleton className="mb-2 h-8 w-28" />
								<Skeleton className="h-3 w-40" />
							</CardContent>
						</Card>
					))}
				</div>
				<div className="grid gap-6 lg:grid-cols-2">
					{Array.from({ length: 4 }).map((_, i) => (
						<Card key={i}>
							<CardHeader className="pb-2">
								<Skeleton className="h-5 w-32" />
								<Skeleton className="h-3 w-48" />
							</CardHeader>
							<CardContent>
								<Skeleton className="h-[280px] w-full" />
							</CardContent>
						</Card>
					))}
				</div>
			</div>
		);
	}

	const profitIsPositive = data.totalProfit >= 0;

	return (
		<div className="grid min-w-0 flex-1 items-start gap-6 overflow-hidden">
			<QuickActions />

			{/* KPI Cards */}
			<div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<LowStockCard />
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							{t("totalRevenue")}
						</CardTitle>
						<DollarSign className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{formatCurrency(data.totalRevenue, locale)}
						</div>
						<p className="text-muted-foreground text-xs">
							{t("completedIncome")}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							{t("totalExpenses")}
						</CardTitle>
						<Wallet className="h-4 w-4 text-muted-foreground" />
					</CardHeader>
					<CardContent>
						<div className="font-bold text-2xl">
							{formatCurrency(data.totalExpenses, locale)}
						</div>
						<p className="text-muted-foreground text-xs">
							{t("completedExpenses")}
						</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
						<CardTitle className="font-medium text-sm">
							{t("netProfit")}
						</CardTitle>
						{profitIsPositive ? (
							<TrendingUp className="h-4 w-4 text-emerald-500" />
						) : (
							<TrendingDown className="h-4 w-4 text-red-500" />
						)}
					</CardHeader>
					<CardContent>
						<div
							className={`font-bold text-2xl ${profitIsPositive ? "text-emerald-600" : "text-red-600"}`}
						>
							{formatCurrency(data.totalProfit, locale)}
						</div>
						<p className="text-muted-foreground text-xs">
							{t("profitDescription")}
						</p>
					</CardContent>
				</Card>
			</div>

			{/* Charts Grid */}
			<div className="grid min-w-0 gap-6 lg:grid-cols-2">
				<CategoryPieChart
					title={t("revenueByCategory")}
					description={t("revenueBreakdown")}
					data={data.revenueByCategory}
				/>

				<CategoryPieChart
					title={t("expensesByCategory")}
					description={t("expensesBreakdown")}
					data={data.expensesByCategory}
				/>

				<ProfitMarginChart data={data.profitMargin} />
				<CashFlowChart data={data.cashFlow} />
			</div>
		</div>
	);
}

/** Reusable donut chart for category breakdowns. */
function CategoryPieChart({
	title,
	description,
	data,
}: {
	title: string;
	description: string;
	data: Record<string, number>;
}) {
	const t = useTranslations("dashboard");
	const tc = useTranslations("common");
	const locale = useLocale();
	const entries = Object.entries(data);
	const total = entries.reduce((sum, [, v]) => sum + v, 0);

	const chartData = entries.map(([category, value], i) => ({
		category,
		value,
		fill: CHART_COLORS[i % CHART_COLORS.length],
	}));

	const chartConfig: ChartConfig = Object.fromEntries(
		entries.map(([category], i) => [
			category,
			{
				label: category.charAt(0).toUpperCase() + category.slice(1),
				color: CHART_COLORS[i % CHART_COLORS.length],
			},
		]),
	);

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader className="pb-2">
				<CardTitle>{title}</CardTitle>
				<CardDescription>{description}</CardDescription>
			</CardHeader>
			<CardContent>
				{entries.length === 0 ? (
					<EmptyState
						message={t("noDataYet", { section: title.toLowerCase() })}
					/>
				) : (
					<ChartContainer
						config={chartConfig}
						className="mx-auto aspect-square max-h-[280px]"
					>
						<PieChart>
							<ChartTooltip
								content={
									<ChartTooltipContent
										nameKey="category"
										formatter={(value) => formatCurrency(Number(value), locale)}
									/>
								}
							/>
							<Pie
								data={chartData}
								dataKey="value"
								nameKey="category"
								innerRadius={60}
								strokeWidth={2}
								stroke="hsl(var(--background))"
							>
								<Label
									content={({ viewBox }) => {
										if (viewBox && "cx" in viewBox && "cy" in viewBox) {
											return (
												<text
													x={viewBox.cx}
													y={viewBox.cy}
													textAnchor="middle"
													dominantBaseline="middle"
												>
													<tspan
														x={viewBox.cx}
														y={viewBox.cy}
														className="fill-foreground font-bold text-xl"
													>
														{formatCurrency(total, locale)}
													</tspan>
													<tspan
														x={viewBox.cx}
														y={(viewBox.cy || 0) + 20}
														className="fill-muted-foreground text-xs"
													>
														{tc("total")}
													</tspan>
												</text>
											);
										}
									}}
								/>
							</Pie>
							<ChartLegend
								content={<ChartLegendContent nameKey="category" />}
							/>
						</PieChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

function ProfitMarginChart({
	data,
}: {
	data: { date: string; margin: number }[];
}) {
	const t = useTranslations("dashboard");
	const locale = useLocale();

	const chartConfig = {
		margin: {
			label: t("marginPercent"),
			color: "hsl(var(--chart-1))",
		},
	} satisfies ChartConfig;

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader className="pb-2">
				<CardTitle>{t("profitMargin")}</CardTitle>
				<CardDescription>{t("dailyProfitMargin")}</CardDescription>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<EmptyState
						message={t("noDataYet", {
							section: t("profitMargin").toLowerCase(),
						})}
					/>
				) : (
					<ChartContainer config={chartConfig} className="h-[280px] w-full">
						<BarChart accessibilityLayer data={data}>
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis
								dataKey="date"
								tickLine={false}
								tickMargin={10}
								axisLine={false}
								tickFormatter={(v) => formatShortDate(v, locale)}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								tickFormatter={(v) => `${v}%`}
								width={50}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										labelFormatter={(label) =>
											formatShortDate(String(label), locale)
										}
										formatter={(value) => `${value}%`}
									/>
								}
							/>
							<Bar dataKey="margin" radius={[4, 4, 0, 0]}>
								{data.map((entry, i) => (
									<Cell
										key={`cell-${i}`}
										fill={
											entry.margin >= 0
												? "hsl(var(--chart-2))"
												: "hsl(var(--chart-5))"
										}
									/>
								))}
							</Bar>
						</BarChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

function CashFlowChart({ data }: { data: { date: string; amount: number }[] }) {
	const t = useTranslations("dashboard");
	const locale = useLocale();

	const chartConfig = {
		amount: {
			label: t("cashFlow"),
			color: "hsl(var(--chart-3))",
		},
	} satisfies ChartConfig;

	return (
		<Card className="min-w-0 overflow-hidden">
			<CardHeader className="pb-2">
				<CardTitle>{t("cashFlow")}</CardTitle>
				<CardDescription>{t("dailyTransactionVolume")}</CardDescription>
			</CardHeader>
			<CardContent>
				{data.length === 0 ? (
					<EmptyState
						message={t("noDataYet", { section: t("cashFlow").toLowerCase() })}
					/>
				) : (
					<ChartContainer config={chartConfig} className="h-[280px] w-full">
						<AreaChart
							accessibilityLayer
							data={data}
							margin={{ left: 12, right: 12 }}
						>
							<CartesianGrid vertical={false} strokeDasharray="3 3" />
							<XAxis
								dataKey="date"
								tickLine={false}
								axisLine={false}
								tickMargin={8}
								tickFormatter={(v) => formatShortDate(v, locale)}
							/>
							<YAxis
								tickLine={false}
								axisLine={false}
								tickFormatter={(v) => formatCurrency(v * 100, locale)}
								width={60}
							/>
							<ChartTooltip
								content={
									<ChartTooltipContent
										labelFormatter={(label) =>
											formatShortDate(String(label), locale)
										}
										formatter={(value) => formatCurrency(Number(value), locale)}
									/>
								}
							/>
							<defs>
								<linearGradient id="fillAmount" x1="0" y1="0" x2="0" y2="1">
									<stop
										offset="5%"
										stopColor="var(--color-amount)"
										stopOpacity={0.8}
									/>
									<stop
										offset="95%"
										stopColor="var(--color-amount)"
										stopOpacity={0.1}
									/>
								</linearGradient>
							</defs>
							<Area
								dataKey="amount"
								type="monotone"
								fill="url(#fillAmount)"
								stroke="var(--color-amount)"
								strokeWidth={2}
							/>
						</AreaChart>
					</ChartContainer>
				)}
			</CardContent>
		</Card>
	);
}

function EmptyState({ message }: { message: string }) {
	return (
		<div className="flex h-[280px] items-center justify-center">
			<p className="text-muted-foreground text-sm">{message}</p>
		</div>
	);
}
