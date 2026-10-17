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
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import {
	BookIcon,
	FilePenIcon,
	PlusCircle,
	TrashIcon,
	UsersIcon,
	WalletIcon,
} from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useMemo, useState } from "react";
import { toast } from "sonner";
import { z } from "zod/v4";
import { DeleteConfirmationDialog } from "@/components/delete-confirmation-dialog";
import { useCrudMutation } from "@/hooks/use-crud-mutation";
import { useTRPC } from "@/lib/trpc/client";
import type { RouterOutputs } from "@/lib/trpc/router";
import { formatCurrency, formatDate } from "@/lib/utils";

type Customer = RouterOutputs["customers"]["list"][number];
type Account = RouterOutputs["customers"]["account"];
type AccountMovement = Account["movements"][number];

export default function CustomersPage() {
	const trpc = useTRPC();
	const queryClient = useQueryClient();
	const locale = useLocale();
	const {
		data: customers = [],
		isLoading,
		error,
	} = useQuery(trpc.customers.list.queryOptions());
	const { data: balances = [] } = useQuery(
		trpc.customers.balances.queryOptions(),
	);
	const { data: paymentMethods = [] } = useQuery(
		trpc.paymentMethods.list.queryOptions(),
	);
	const t = useTranslations("customers");
	const tc = useTranslations("common");

	const balanceMap = useMemo(
		() => new Map(balances.map((b) => [b.customer_id, b.balance])),
		[balances],
	);

	const customerFormSchema = z.object({
		name: z.string().min(1, t("nameRequired")),
		email: z.string().email(t("invalidEmail")),
		phone: z.string(),
		status: z.enum(["active", "inactive"]),
		credit_limit: z
			.string()
			.refine(
				(v) => v === "" || (!Number.isNaN(Number(v)) && Number(v) >= 0),
				t("paymentAmountInvalid"),
			),
	});

	const paySchema = z.object({
		amount: z.string().refine((v) => Number(v) > 0, t("paymentAmountInvalid")),
		paymentMethodId: z.string().min(1, t("selectPaymentMethod")),
		note: z.string(),
	});

	const statusFilterOptions: FilterOption[] = [
		{ label: tc("all"), value: "all" },
		{ label: tc("active"), value: "active", variant: "success" },
		{ label: tc("inactive"), value: "inactive", variant: "danger" },
	];

	const money = (cents: number) => formatCurrency(Math.abs(cents), locale);

	const tableColumns: Column<Customer>[] = [
		{
			key: "name",
			header: tc("name"),
			sortable: true,
			className: "font-medium",
		},
		{ key: "email", header: tc("email"), sortable: true },
		{ key: "phone", header: tc("phone"), hideOnMobile: true },
		{
			key: "status",
			header: tc("status"),
			sortable: true,
			render: (row) => (
				<span
					className={
						row.status === "active" ? "text-green-600" : "text-muted-foreground"
					}
				>
					{row.status === "active" ? tc("active") : tc("inactive")}
				</span>
			),
		},
		{
			key: "credit_limit",
			header: t("creditLimit"),
			hideOnMobile: true,
			render: (row) =>
				row.credit_limit === null ? (
					<span className="text-muted-foreground">{t("noLimit")}</span>
				) : (
					formatCurrency(row.credit_limit, locale)
				),
		},
		{
			key: "balance",
			header: t("balance"),
			render: (row) => {
				const balance = balanceMap.get(row.id) ?? 0;
				if (balance === 0) {
					return <span className="text-muted-foreground">—</span>;
				}
				return (
					<button
						type="button"
						onClick={() => setStatementId(row.id)}
						className={
							balance > 0
								? "font-medium text-amber-600 underline-offset-4 hover:underline"
								: "font-medium text-green-600 underline-offset-4 hover:underline"
						}
					>
						{money(balance)}
						{balance < 0 ? ` ${t("inFavor")}` : ""}
					</button>
				);
			},
		},
	];

	const exportColumns: ExportColumn<Customer>[] = [
		{ key: "name", header: tc("name"), getValue: (c) => c.name },
		{ key: "email", header: tc("email"), getValue: (c) => c.email },
		{ key: "phone", header: tc("phone"), getValue: (c) => c.phone ?? "" },
		{
			key: "status",
			header: tc("status"),
			getValue: (c) => c.status ?? "active",
		},
		{
			key: "balance",
			header: t("balance"),
			getValue: (c) => ((balanceMap.get(c.id) ?? 0) / 100).toFixed(2),
		},
	];

	const [isDialogOpen, setIsDialogOpen] = useState(false);
	const [isDeleteOpen, setIsDeleteOpen] = useState(false);
	const [editingId, setEditingId] = useState<number | null>(null);
	const [deleteId, setDeleteId] = useState<number | null>(null);
	const [statementId, setStatementId] = useState<number | null>(null);
	const [payCustomer, setPayCustomer] = useState<Customer | null>(null);
	const [searchTerm, setSearchTerm] = useState("");
	const [statusFilter, setStatusFilter] = useState("all");

	const isEditing = editingId !== null;
	const invalidateKeys = trpc.customers.list.queryOptions().queryKey;

	const statementQuery = useQuery({
		...trpc.customers.account.queryOptions({ id: statementId ?? 0 }),
		enabled: statementId !== null,
	});
	const statementBalance = statementQuery.data?.balance ?? 0;

	const payBalance = Math.max(
		payCustomer ? (balanceMap.get(payCustomer.id) ?? 0) : 0,
		0,
	);

	const createMutation = useCrudMutation({
		mutationOptions: trpc.customers.create.mutationOptions(),
		invalidateKeys,
		successMessage: t("created"),
		errorMessage: t("createError"),
		onSuccess: () => setIsDialogOpen(false),
	});

	const updateMutation = useCrudMutation({
		mutationOptions: trpc.customers.update.mutationOptions(),
		invalidateKeys,
		successMessage: t("updated"),
		errorMessage: t("updateError"),
		onSuccess: () => setIsDialogOpen(false),
	});

	const deleteMutation = useCrudMutation({
		mutationOptions: trpc.customers.delete.mutationOptions(),
		invalidateKeys,
		successMessage: t("deleted"),
		errorMessage: t("deleteError"),
	});

	const payMutation = useMutation(
		trpc.customers.pay.mutationOptions({
			onSuccess: () => {
				setPayCustomer(null);
				// El pago genera una transacción: se refresca lo que depende del log.
				queryClient.invalidateQueries(trpc.customers.balances.queryOptions());
				queryClient.invalidateQueries(trpc.customers.list.queryOptions());
				queryClient.invalidateQueries(trpc.transactions.list.queryOptions());
				toast.success(t("paid"));
			},
			onError: (err) => toast.error(err.message || t("payError")),
		}),
	);

	const form = useForm({
		defaultValues: {
			name: "",
			email: "",
			phone: "",
			status: "active" as "active" | "inactive",
			credit_limit: "",
		},
		validators: {
			onSubmit: customerFormSchema,
		},
		onSubmit: ({ value }) => {
			const payload = {
				name: value.name,
				email: value.email,
				phone: value.phone || undefined,
				status: value.status,
				credit_limit:
					value.credit_limit === ""
						? null
						: Math.round(Number(value.credit_limit) * 100),
			};
			if (isEditing) {
				updateMutation.mutate({ id: editingId, ...payload });
			} else {
				createMutation.mutate(payload);
			}
		},
	});

	const payForm = useForm({
		defaultValues: { amount: "", paymentMethodId: "", note: "" },
		validators: {
			onSubmit: paySchema,
		},
		onSubmit: ({ value }) => {
			if (!payCustomer) return;
			payMutation.mutate({
				id: payCustomer.id,
				amount: Math.round(Number(value.amount) * 100),
				paymentMethodId: Number(value.paymentMethodId),
				note: value.note || undefined,
			});
		},
	});

	const filteredCustomers = useMemo(() => {
		return customers.filter((c) => {
			if (statusFilter !== "all" && c.status !== statusFilter) return false;
			const q = searchTerm.toLowerCase();
			return (
				c.name.toLowerCase().includes(q) ||
				c.email.toLowerCase().includes(q) ||
				(c.phone ?? "").includes(searchTerm)
			);
		});
	}, [customers, statusFilter, searchTerm]);

	const openCreate = () => {
		setEditingId(null);
		form.reset();
		setIsDialogOpen(true);
	};

	const openEdit = (c: Customer) => {
		setEditingId(c.id);
		form.reset();
		form.setFieldValue("name", c.name);
		form.setFieldValue("email", c.email);
		form.setFieldValue("phone", c.phone ?? "");
		form.setFieldValue(
			"status",
			(c.status ?? "active") as "active" | "inactive",
		);
		form.setFieldValue(
			"credit_limit",
			c.credit_limit === null ? "" : (c.credit_limit / 100).toFixed(2),
		);
		setIsDialogOpen(true);
	};

	const openPay = (c: Customer) => {
		setPayCustomer(c);
		payForm.reset();
		payForm.setFieldValue(
			"amount",
			(((balanceMap.get(c.id) ?? 0) / 100) as number).toFixed(2),
		);
	};

	const movementLabel = (m: AccountMovement) => {
		if (m.type === "charge") {
			return `${t("movementCharge")} #${m.order_id}`;
		}
		if (m.type === "cancellation") {
			return `${t("movementCancellation")} #${m.order_id}`;
		}
		return t("movementPayment");
	};

	const handleDelete = () => {
		if (deleteId !== null) {
			deleteMutation.mutate({ id: deleteId });
			setIsDeleteOpen(false);
			setDeleteId(null);
		}
	};

	const actionsColumn: Column<Customer> = {
		key: "actions",
		header: tc("actions"),
		render: (row) => (
			<TableActions>
				{(balanceMap.get(row.id) ?? 0) > 0 ? (
					<TableActionButton
						onClick={() => openPay(row)}
						icon={<WalletIcon className="h-4 w-4" />}
						label={t("payAccount")}
					/>
				) : null}
				<TableActionButton
					onClick={() => setStatementId(row.id)}
					icon={<BookIcon className="h-4 w-4" />}
					label={t("statement")}
				/>
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
			<Card className="flex flex-col gap-6 p-6">
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
							<Skeleton className="h-4 w-40" />
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-4 w-16" />
							<Skeleton className="h-8 w-20" />
						</div>
					))}
				</CardContent>
			</Card>
		);
	}

	if (error) {
		return (
			<Card>
				<CardContent>
					<p className="text-red-500">{error.message}</p>
				</CardContent>
			</Card>
		);
	}

	return (
		<Card className="flex flex-col gap-4 p-3 sm:gap-6 sm:p-6">
			<CardHeader className="p-0">
				<SearchFilter
					search={searchTerm}
					onSearchChange={setSearchTerm}
					searchPlaceholder={t("searchPlaceholder")}
					filters={[
						{
							options: statusFilterOptions,
							value: statusFilter,
							onChange: setStatusFilter,
						},
					]}
				>
					<Button size="sm" onClick={openCreate}>
						<PlusCircle className="mr-2 h-4 w-4" />
						{t("addCustomer")}
					</Button>
				</SearchFilter>
			</CardHeader>
			<CardContent className="p-0">
				<DataTable
					data={filteredCustomers}
					columns={[...tableColumns, actionsColumn]}
					exportColumns={exportColumns}
					exportFilename="customers"
					emptyMessage={t("noCustomers")}
					emptyIcon={<UsersIcon className="h-8 w-8" />}
					defaultSort={[{ id: "name", desc: false }]}
				/>
			</CardContent>

			<Dialog
				open={isDialogOpen}
				onOpenChange={(open) => {
					if (!open) setIsDialogOpen(false);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{isEditing ? t("editCustomer") : t("createCustomer")}
						</DialogTitle>
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
										<Label htmlFor="name">{tc("name")}</Label>
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
							<form.Field name="email">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="email">{tc("email")}</Label>
										<div className="col-span-3">
											<Input
												id="email"
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
							<form.Field name="phone">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="phone">{tc("phone")}</Label>
										<Input
											id="phone"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
											className="col-span-3"
										/>
									</div>
								)}
							</form.Field>
							<form.Field name="credit_limit">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-start sm:gap-4">
										<Label htmlFor="credit_limit">{t("creditLimit")}</Label>
										<div className="col-span-3 flex flex-col gap-1">
											<Input
												id="credit_limit"
												type="number"
												min="0"
												step="0.01"
												placeholder={t("noLimit")}
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
											<span className="text-muted-foreground text-xs">
												{t("creditLimitHint")}
											</span>
										</div>
									</div>
								)}
							</form.Field>
							<form.Field name="status">
								{(field) => (
									<div className="flex flex-col gap-2 sm:grid sm:grid-cols-4 sm:items-center sm:gap-4">
										<Label htmlFor="status">{tc("status")}</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) =>
												field.handleChange(value as "active" | "inactive")
											}
										>
											<SelectTrigger id="status" className="col-span-3">
												<SelectValue placeholder={t("selectStatus")} />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="active">{tc("active")}</SelectItem>
												<SelectItem value="inactive">
													{tc("inactive")}
												</SelectItem>
											</SelectContent>
										</Select>
									</div>
								)}
							</form.Field>
						</div>
						<DialogFooter>
							<Button
								variant="secondary"
								onClick={() => setIsDialogOpen(false)}
							>
								{tc("cancel")}
							</Button>
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
										{isEditing ? t("updateCustomer") : t("addCustomer")}
									</Button>
								)}
							</form.Subscribe>
						</DialogFooter>
					</form>
				</DialogContent>
			</Dialog>

			<Dialog
				open={statementId !== null}
				onOpenChange={(open) => {
					if (!open) setStatementId(null);
				}}
			>
				<DialogContent className="max-w-2xl">
					<DialogHeader>
						<DialogTitle>{t("statementTitle")}</DialogTitle>
					</DialogHeader>
					{statementQuery.isLoading ? (
						<div className="space-y-3 py-4">
							<Skeleton className="h-14 w-full" />
							<Skeleton className="h-24 w-full" />
						</div>
					) : (
						<div className="flex flex-col gap-4 py-2">
							<div className="flex items-center justify-between rounded-md border p-3">
								<span className="text-muted-foreground text-sm">
									{t("currentBalance")}
								</span>
								<span className="font-medium">
									{statementBalance === 0
										? "—"
										: `${money(statementBalance)}${
												statementBalance < 0 ? ` ${t("inFavor")}` : ""
											}`}
								</span>
							</div>
							<div className="max-h-80 overflow-y-auto">
								{(statementQuery.data?.movements.length ?? 0) === 0 ? (
									<p className="py-6 text-center text-muted-foreground text-sm">
										{t("noMovements")}
									</p>
								) : (
									<ul className="divide-y">
										{statementQuery.data?.movements.map((m) => (
											<li
												key={m.id}
												className="flex items-center justify-between py-2"
											>
												<div className="flex flex-col">
													<span className="font-medium text-sm">
														{movementLabel(m)}
													</span>
													<span className="text-muted-foreground text-xs">
														{formatDate(m.date, locale)}
													</span>
												</div>
												<span
													className={
														m.amount >= 0 ? "text-amber-600" : "text-green-600"
													}
												>
													{m.amount >= 0 ? "+" : "−"}
													{money(m.amount)}
												</span>
											</li>
										))}
									</ul>
								)}
							</div>
						</div>
					)}
					<DialogFooter>
						<Button variant="secondary" onClick={() => setStatementId(null)}>
							{tc("close")}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>

			<Dialog
				open={payCustomer !== null}
				onOpenChange={(open) => {
					if (!open) setPayCustomer(null);
				}}
			>
				<DialogContent>
					<DialogHeader>
						<DialogTitle>
							{t("payTitle")}
							{payCustomer ? ` — ${payCustomer.name}` : ""}
						</DialogTitle>
					</DialogHeader>
					<form
						onSubmit={(e) => {
							e.preventDefault();
							e.stopPropagation();
							payForm.handleSubmit();
						}}
					>
						<div className="grid gap-4 py-4">
							<div className="flex items-center justify-between text-sm">
								<span className="text-muted-foreground">
									{t("currentBalance")}
								</span>
								<span className="font-medium">{money(payBalance)}</span>
							</div>
							<payForm.Field name="amount">
								{(field) => (
									<div className="grid gap-2">
										<Label htmlFor="pay-amount">{t("paymentAmount")}</Label>
										<Input
											id="pay-amount"
											type="number"
											min="0"
											step="0.01"
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
								)}
							</payForm.Field>
							<payForm.Field name="paymentMethodId">
								{(field) => (
									<div className="grid gap-2">
										<Label htmlFor="pay-method">
											{t("selectPaymentMethod")}
										</Label>
										<Select
											value={field.state.value}
											onValueChange={(value) => field.handleChange(value)}
										>
											<SelectTrigger id="pay-method">
												<SelectValue placeholder={t("selectPaymentMethod")} />
											</SelectTrigger>
											<SelectContent>
												{paymentMethods.map((m) => (
													<SelectItem key={m.id} value={String(m.id)}>
														{m.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										{field.state.meta.errors.length > 0 ? (
											<span className="text-red-500 text-xs">
												{field.state.meta.errors
													.map((e) => e?.message ?? e)
													.join(", ")}
											</span>
										) : null}
									</div>
								)}
							</payForm.Field>
							<payForm.Field name="note">
								{(field) => (
									<div className="grid gap-2">
										<Label htmlFor="pay-note">{t("note")}</Label>
										<Input
											id="pay-note"
											value={field.state.value}
											onChange={(e) => field.handleChange(e.target.value)}
										/>
									</div>
								)}
							</payForm.Field>
						</div>
						<DialogFooter>
							<Button variant="secondary" onClick={() => setPayCustomer(null)}>
								{tc("cancel")}
							</Button>
							<payForm.Subscribe selector={(state) => state.isSubmitting}>
								{(isSubmitting) => (
									<Button
										type="submit"
										disabled={isSubmitting || payMutation.isPending}
									>
										{t("payAccount")}
									</Button>
								)}
							</payForm.Subscribe>
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
		</Card>
	);
}
