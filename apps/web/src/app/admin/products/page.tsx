"use client";

import { Button } from "@finopenpos/ui/components/button";
import { Card, CardContent, CardHeader } from "@finopenpos/ui/components/card";
import {
	type Column,
	DataTable,
	type ExportColumn,
	TableActionButton,
	TableActions,
} from "@finopenpos/ui/components/data-table";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@finopenpos/ui/components/dialog";
import { Input } from "@finopenpos/ui/components/input";
import { Label } from "@finopenpos/ui/components/label";
import {
	type FilterOption,
	SearchFilter,
} from "@finopenpos/ui/components/search-filter";
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from "@finopenpos/ui/components/select";
import { Skeleton } from "@finopenpos/ui/components/skeleton";
import { useForm } from "@tanstack/react-form";
import { useMutation, useQuery } from "@tanstack/react-query";
import {
	FilePenIcon,
	PackageIcon,
	PlusIcon,
	TagsIcon,
	TrashIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { useCrudMutation } from "@/hooks/use-crud-mutation";
import { isBelowMinimum } from "@/lib/es/products";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";
import { formatCurrency } from "@/lib/utils";

type Product = RouterOutputs["products"]["list"][number];
type PriceChange = RouterOutputs["products"]["bulkAdjust"]["changes"][number];

export default function Products() {
	const trpc = useTRPC();
	const { data: products = [], isLoading } = useQuery(
		trpc.products.list.queryOptions(),
	);
	const t = useTranslations("products");
	const tc = useTranslations("common");
	const locale = useLocale();

	const productFormSchema = z.object({
		name: z.string().min(1, t("nameRequired")),
		description: z.string(),
		price: z.number().min(0, t("priceMustBePositive")),
		in_stock: z.number().int().min(0, t("stockMustBeNonNegative")),
		min_stock: z.number().int().min(0, t("stockMustBeNonNegative")),
		wholesale_price: z.number().min(0, t("priceMustBePositive")),
		wholesale_min_qty: z.number().int().min(0, t("stockMustBeNonNegative")),
		barcode: z.string(),
		category: z.string(),
		unit_of_measure: z.string(),
	});

	const categoryFilterOptions: FilterOption[] = [
		{ label: tc("all"), value: "all" },
		{ label: t("electronics"), value: "electronics" },
		{ label: t("home"), value: "home" },
		{ label: t("health"), value: "health" },
	];

	const stockFilterOptions: FilterOption[] = [
		{ label: t("allStock"), value: "all" },
		{ label: t("inStock"), value: "in-stock", variant: "success" },
		{ label: t("outOfStock"), value: "out-of-stock", variant: "danger" },
		{ label: t("lowStock"), value: "low-stock", variant: "warning" },
	];

	const columns: Column<Product>[] = [
		{
			key: "name",
			header: t("product"),
			sortable: true,
			className: "font-medium",
		},
		{ key: "description", header: tc("description"), hideOnMobile: true },
		{
			key: "price",
			header: tc("price"),
			sortable: true,
			accessorFn: (row) => row.price,
			render: (row) => formatCurrency(row.price, locale),
		},
		{
			key: "wholesale_price",
			header: t("wholesalePrice"),
			sortable: true,
			hideOnMobile: true,
			accessorFn: (row) => row.wholesale_price ?? 0,
			render: (row) =>
				row.wholesale_price === null
					? "—"
					: formatCurrency(row.wholesale_price, locale),
		},
		{ key: "in_stock", header: t("stock"), sortable: true },
		{
			key: "min_stock",
			header: t("minStock"),
			sortable: true,
			hideOnMobile: true,
		},
	];

	const exportColumns: ExportColumn<Product>[] = [
		{ key: "name", header: tc("name"), getValue: (p) => p.name },
		{
			key: "description",
			header: tc("description"),
			getValue: (p) => p.description ?? "",
		},
		{
			key: "price",
			header: tc("price"),
			getValue: (p) => (p.price / 100).toFixed(2),
		},
		{ key: "in_stock", header: t("stock"), getValue: (p) => p.in_stock },
		{
			key: "min_stock",
			header: t("minStock"),
			getValue: (p) => p.min_stock,
		},
		{ key: "barcode", header: t("barcode"), getValue: (p) => p.barcode ?? "" },
		{
			key: "category",
			header: tc("category"),
			getValue: (p) => p.category ?? "",
		},
	];

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [isBulkOpen, setIsBulkOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [categoryFilter, setCategoryFilter] = useState("all");
	const [stockFilter, setStockFilter] = useState("all");
	const [bulkScope, setBulkScope] = useState<"all" | "category">("all");
	const [bulkCategory, setBulkCategory] = useState("");
	const [bulkPercent, setBulkPercent] = useState("");
	const [bulkRoundTo, setBulkRoundTo] = useState("0");
	const [bulkPreview, setBulkPreview] = useState<PriceChange[] | null>(null);

	const isEditing = editingId !== null;
	const invalidateKeys = trpc.products.list.queryOptions().queryKey;

	const createMutation = useCrudMutation({
		mutationOptions: trpc.products.create.mutationOptions(),
		invalidateKeys,
		successMessage: t("created"),
		errorMessage: t("createError"),
		onSuccess: () => setIsDialogOpen(false),
	});

	const updateMutation = useCrudMutation({
		mutationOptions: trpc.products.update.mutationOptions(),
		invalidateKeys,
		successMessage: t("updated"),
		errorMessage: t("updateError"),
		onSuccess: () => setIsDialogOpen(false),
	});

	const deleteMutation = useCrudMutation({
		mutationOptions: trpc.products.delete.mutationOptions(),
		invalidateKeys,
		successMessage: t("deleted"),
		errorMessage: t("deleteError"),
	});

	const previewMutation = useMutation(
		trpc.products.bulkAdjust.mutationOptions({
			onSuccess: (data) => setBulkPreview(data.changes),
			onError: (err) => toast.error(err.message || t("bulkError")),
		}),
	);

	const applyMutation = useCrudMutation({
		mutationOptions: trpc.products.bulkAdjust.mutationOptions(),
		invalidateKeys,
		successMessage: t("bulkApplied"),
		errorMessage: t("bulkError"),
		onSuccess: () => {
			setIsBulkOpen(false);
			setBulkPreview(null);
			setBulkPercent("");
		},
	});

	const form = useForm({
		defaultValues: {
			name: "",
			description: "",
			price: 0,
			in_stock: 0,
			min_stock: 0,
			wholesale_price: 0,
			wholesale_min_qty: 0,
			barcode: "",
			category: "",
			unit_of_measure: "UN",
		},
		validators: {
			onSubmit: productFormSchema,
		},
		onSubmit: ({ value }) => {
			const payload = {
				name: value.name,
				description: value.description || undefined,
				price: Math.round(value.price * 100),
				in_stock: value.in_stock,
				min_stock: value.min_stock,
				wholesale_price:
					value.wholesale_price > 0
						? Math.round(value.wholesale_price * 100)
						: null,
				wholesale_min_qty:
					value.wholesale_price > 0 && value.wholesale_min_qty > 0
						? value.wholesale_min_qty
						: null,
				barcode: value.barcode || undefined,
				category: value.category || undefined,
				unit_of_measure: value.unit_of_measure || undefined,
			};
			if (isEditing) {
				updateMutation.mutate({ id: editingId, ...payload });
			} else {
				createMutation.mutate(payload);
			}
		},
	});

	const filteredProducts = useMemo(() => {
		return products.filter((p) => {
			if (categoryFilter !== "all" && p.category !== categoryFilter)
				return false;
			if (stockFilter === "in-stock" && p.in_stock === 0) return false;
			if (stockFilter === "out-of-stock" && p.in_stock > 0) return false;
			if (stockFilter === "low-stock" && !isBelowMinimum(p)) return false;
			return p.name.toLowerCase().includes(searchTerm.toLowerCase());
		});
	}, [products, categoryFilter, stockFilter, searchTerm]);

	const openCreate = () => {
		setEditingId(null);
		form.reset();
		setIsDialogOpen(true);
	};

	const openEdit = (p: Product) => {
		setEditingId(p.id);
		form.reset();
		form.setFieldValue("name", p.name);
		form.setFieldValue("description", p.description ?? "");
		form.setFieldValue("price", p.price / 100);
		form.setFieldValue("in_stock", p.in_stock);
		form.setFieldValue("min_stock", p.min_stock);
		form.setFieldValue("wholesale_price", (p.wholesale_price ?? 0) / 100);
		form.setFieldValue("wholesale_min_qty", p.wholesale_min_qty ?? 0);
		form.setFieldValue("barcode", p.barcode ?? "");
		form.setFieldValue("category", p.category ?? "");
		form.setFieldValue("unit_of_measure", p.unit_of_measure ?? "");
		setIsDialogOpen(true);
	};

	const handleDelete = () => {
		if (deleteId !== null) {
			deleteMutation.mutate({ id: deleteId });
			setIsDeleteOpen(false);
			setDeleteId(null);
		}
	};

	const categoryOptions = useMemo(
		() =>
			[
				...new Set(products.map((p) => p.category).filter(Boolean)),
			].sort() as string[],
		[products],
	);

	const openBulk = () => {
		setBulkPreview(null);
		setBulkPercent("");
		setBulkScope("all");
		setBulkCategory("");
		setBulkRoundTo("0");
		setIsBulkOpen(true);
	};

	const bulkInput = () => ({
		scope: bulkScope,
		category: bulkScope === "category" ? bulkCategory : undefined,
		percent: Number(bulkPercent),
		roundTo: Number(bulkRoundTo) || 0,
	});

	const bulkPercentIsValid = () => {
		const percent = Number(bulkPercent);
		return bulkPercent.trim() !== "" && !Number.isNaN(percent) && percent !== 0;
	};

	const handlePreview = () => {
		if (!bulkPercentIsValid()) {
			toast.error(t("bulkPercentRequired"));
			return;
		}
		previewMutation.mutate({ ...bulkInput(), dryRun: true });
	};

	const handleApply = () => {
		if (!bulkPercentIsValid()) {
			toast.error(t("bulkPercentRequired"));
			return;
		}
		applyMutation.mutate(bulkInput());
	};

	const actionsColumn: Column<Product> = {
		key: "actions",
		header: tc("actions"),
		render: (row) => (
			<TableActions>
				<TableActionButton
					onClick={() => openEdit(row)}
					icon={<FilePenIcon className="h-4 w-4" />}
					label={tc("edit")}
				/>
				<TableActionButton
					variant="danger"
					onClick={() => {
						setDeleteId(row.id);
						setIsDeleteOpen(true);
					}}
					icon={<TrashIcon className="h-4 w-4" />}
					label={tc("delete")}
				/>
			</TableActions>
		),
	};

	if (isLoading) {
		return (
			<Card className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
				<CardHeader className="p-0">
					<div className="flex items-center justify-between">
						<Skeleton className="h-10 w-48" />
						<Skeleton className="h-9 w-32" />
					</div>
				</CardHeader>
				<CardContent className="space-y-3 p-0">
					{Array.from({ length: 5 }).map((_, i) => (
						<div key={i} className="flex items-center gap-4">
							<Skeleton className="h-4 w-32" />
							<Skeleton className="h-4 w-48" />
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-4 w-12" />
							<Skeleton className="h-8 w-20" />
						</div>
					))}
				</CardContent>
			</Card>
		);
	}

	return (
		<>
			<Card className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
				<CardHeader className="p-0">
					<SearchFilter
						search={searchTerm}
						onSearchChange={setSearchTerm}
						searchPlaceholder={t("searchPlaceholder")}
						filters={[
							{
								options: categoryFilterOptions,
								value: categoryFilter,
								onChange: setCategoryFilter,
							},
							{
								options: stockFilterOptions,
								value: stockFilter,
								onChange: setStockFilter,
							},
						]}
					>
						<Button size="sm" variant="outline" onClick={openBulk}>
							<TagsIcon className="mr-2 h-4 w-4" />
							{t("bulkAdjust")}
						</Button>
						<Button size="sm" onClick={openCreate}>
							<PlusIcon className="mr-2 h-4 w-4" />
							{t("addProduct")}
						</Button>
					</SearchFilter>
				</CardHeader>
				<CardContent className="p-0">
					<DataTable
						data={filteredProducts}
						columns={[...columns, actionsColumn]}
						exportColumns={exportColumns}
						exportFilename="products"
						emptyMessage={t("noProducts")}
						emptyIcon={<PackageIcon className="h-8 w-8" />}
						defaultSort={[{ id: "name", desc: false }]}
					/>
				</CardContent>
			</Card>

			<Dialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) setIsDialogOpen(false);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{isEditing ? t("editProduct") : t("addNewProduct")}
						</DialogTitle>
						<DialogDescription>
							{isEditing ? t("editDescription") : t("addDescription")}
						</DialogDescription>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							form.handleSubmit();
						}}
					>
						<div className="grid gap-4 py-4">
							<form.Field name="name">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="name" className="sm:text-right">
											{tc("name")}
										</Label>
										<div className="col-span-3">
											<Input
												id="name"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="description">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="description" className="sm:text-right">
											{tc("description")}
										</Label>
										<Input
											id="description"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											className="col-span-3"
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="price">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="price" className="sm:text-right">
											{tc("price")}
										</Label>
										<div className="col-span-3">
											<Input
												id="price"
												type="number"
												step="0.01"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="in_stock">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="in_stock" className="sm:text-right">
											{t("inStock")}
										</Label>
										<div className="col-span-3">
											<Input
												id="in_stock"
												type="number"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="min_stock">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="min_stock" className="sm:text-right">
											{t("minStock")}
										</Label>
										<div className="col-span-3">
											<Input
												id="min_stock"
												type="number"
												min="0"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="wholesale_price">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="wholesale_price" className="sm:text-right">
											{t("wholesalePrice")}
										</Label>
										<div className="col-span-3">
											<Input
												id="wholesale_price"
												type="number"
												step="0.01"
												min="0"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="wholesale_min_qty">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label
											htmlFor="wholesale_min_qty"
											className="sm:text-right"
										>
											{t("wholesaleMinQty")}
										</Label>
										<div className="col-span-3">
											<Input
												id="wholesale_min_qty"
												type="number"
												min="0"
												value={field.state.value}
												onChange={(e) =>
													field.handleChange(Number(e.target.value))
												}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
											<p className="mt-1 text-muted-foreground text-xs">
												{t("wholesaleHint")}
											</p>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="barcode">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="barcode" className="sm:text-right">
											{t("barcode")}
										</Label>
										<div className="col-span-3">
											<Input
												id="barcode"
												placeholder="7798145678903"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												error={
													field.state.meta.errors.length > 0
														? field.state.meta.errors
																.map((e) => e?.message ?? e)
																.join(", ")
														: undefined
												}
											/>
											<p className="mt-1 text-muted-foreground text-xs">
												{t("barcodeHint")}
											</p>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="category">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="category" className="sm:text-right">
											{tc("category")}
										</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) => field.handleChange(value)}
										>
											<SelectTrigger className="col-span-3">
												<SelectValue placeholder={t("selectCategory")} />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="electronics">
													{t("electronics")}
												</SelectItem>
												<SelectItem value="clothing">
													{t("clothing")}
												</SelectItem>
												<SelectItem value="books">{t("books")}</SelectItem>
												<SelectItem value="home">{t("home")}</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
							{/* Unidad de venta */}
							<form.Field name="unit_of_measure">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="unit_of_measure" className="sm:text-right">
											{t("unitOfMeasure")}
										</Label>
										<div className="col-span-3">
											<Input
												id="unit_of_measure"
												placeholder="UN"
												value={field.state.value}
												onChange={(e) => field.handleChange(e.target.value)}
												onBlur={field.handleBlur}
												maxLength={6}
												className="h-8 text-sm"
											/>
										</div>
									</div>
								)}
							</form.Field>
						</div>
						<DialogFooter>
							<form.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button
										type="submit"
										disabled={
											isSubmitting ||
											createMutation.isPending ||
											updateMutation.isPending
										}
									>
										{isEditing ? t("updateProduct") : t("addProduct")}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<DeleteConfirmationDialog
				open={isDeleteOpen}
				onOpenChange={setIsDeleteOpen}
				onConfirm={handleDelete}
				description={t("deleteMessage")}
			/>

			<Dialog
				open={isBulkOpen}
				onOpenChange={(open) => {
					if (!open) setIsBulkOpen(false);
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("bulkTitle")}</DialogTitle>
						<DialogDescription>{t("bulkDescription")}</DialogDescription>
					</DialogHeader>
					<div className="space-y-4 py-4">
						<div className="grid gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label className="sm:text-right">{t("bulkScope")}</Label>
							<Select
								value={bulkScope}
								onValueChange={(value) => {
									setBulkScope(value as "all" | "category");
									setBulkPreview(null);
								}}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">{t("bulkScopeAll")}</SelectItem>
									<SelectItem value="category">
										{t("bulkScopeCategory")}
									</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{bulkScope === "category" && (
							<div className="grid gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
								<Label className="sm:text-right">{tc("category")}</Label>
								<Select
									value={bulkCategory}
									onValueChange={(value) => {
										setBulkCategory(value);
										setBulkPreview(null);
									}}
								>
									<SelectTrigger className="col-span-3">
										<SelectValue placeholder={t("selectCategory")} />
									</SelectTrigger>
									<SelectContent>
										{categoryOptions.map((category) => (
											<SelectItem key={category} value={category}>
												{category}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</div>
						)}

						<div className="grid gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label htmlFor="bulk_percent" className="sm:text-right">
								{t("bulkPercent")}
							</Label>
							<div className="col-span-3">
								<Input
									id="bulk_percent"
									type="number"
									step="0.1"
									placeholder="10"
									value={bulkPercent}
									onChange={(e) => {
										setBulkPercent(e.target.value);
										setBulkPreview(null);
									}}
								/>
							</div>
						</div>

						<div className="grid gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
							<Label className="sm:text-right">{t("bulkRoundTo")}</Label>
							<Select
								value={bulkRoundTo}
								onValueChange={(value) => {
									setBulkRoundTo(value);
									setBulkPreview(null);
								}}
							>
								<SelectTrigger className="col-span-3">
									<SelectValue />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="0">{t("bulkRoundNone")}</SelectItem>
									<SelectItem value="100">$1</SelectItem>
									<SelectItem value="500">$5</SelectItem>
									<SelectItem value="1000">$10</SelectItem>
								</SelectContent>
							</Select>
						</div>

						{bulkPreview !== null && (
							<div className="rounded-md border p-3 text-sm">
								<p className="mb-2 font-medium">
									{bulkPreview.length === 0
										? t("bulkNoChanges")
										: t("bulkChanges", { count: bulkPreview.length })}
								</p>
								{bulkPreview.length > 0 && (
									<div className="max-h-56 space-y-1 overflow-y-auto">
										{bulkPreview.map((change) => (
											<div
												key={change.product_id}
												className="flex items-center justify-between gap-4"
											>
												<span className="truncate">{change.name}</span>
												<span className="shrink-0 text-muted-foreground tabular-nums">
													{formatCurrency(change.before, locale)} →{" "}
													{formatCurrency(change.after, locale)}
												</span>
											</div>
										))}
									</div>
								)}
							</div>
						)}
					</div>
					<DialogFooter>
						<Button
							variant="secondary"
							onClick={() => setIsBulkOpen(false)}
							disabled={applyMutation.isPending}
						>
							{tc("cancel")}
						</Button>
						<Button
							variant="outline"
							onClick={handlePreview}
							disabled={previewMutation.isPending || applyMutation.isPending}
						>
							{t("bulkPreview")}
						</Button>
						<Button
							onClick={handleApply}
							disabled={
								applyMutation.isPending ||
								bulkPreview === null ||
								bulkPreview.length === 0
							}
						>
							{t("bulkApply")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
