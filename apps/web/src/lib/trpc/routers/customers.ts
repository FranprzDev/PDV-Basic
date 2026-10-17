import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import {
	AccountError,
	accountBalances,
	createCustomer,
	deleteCustomer,
	getAccount,
	listCustomers,
	payAccount,
	updateCustomer,
} from "@/lib/es";
import { protectedProcedure, router } from "../init";

const customerSchema = z.object({
	id: z.number(),
	name: z.string(),
	email: z.string(),
	phone: z.string().nullable(),
	status: z.string().nullable(),
	credit_limit: z.number().nullable(),
	user_uid: z.string(),
	created_at: z.date().nullable(),
});

const accountMovementSchema = z.object({
	id: z.number(),
	type: z.enum(["charge", "payment", "cancellation"]),
	amount: z.number(),
	order_id: z.number().nullable(),
	payment_method_id: z.number().nullable(),
	note: z.string().nullable(),
	date: z.date(),
});

const accountSchema = z.object({
	customer_id: z.number(),
	balance: z.number(),
	movements: z.array(accountMovementSchema),
});

const ACCOUNT_ERROR_CODES = {
	customer_not_found: "NOT_FOUND",
	invalid_amount: "BAD_REQUEST",
	overpayment: "CONFLICT",
} as const;

const creditLimit = z.number().int().min(0).nullable().optional();

export const customersRouter = router({
	list: protectedProcedure
		.input(z.void())
		.output(z.array(customerSchema))
		.query(async ({ ctx }) => {
			return listCustomers(ctx.user.id);
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				email: z.string().email(),
				phone: z.string().optional(),
				status: z.enum(["active", "inactive"]).optional(),
				credit_limit: creditLimit,
			}),
		)
		.output(customerSchema)
		.mutation(async ({ ctx, input }) => {
			return createCustomer(ctx.user.id, input);
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				email: z.string().email().optional(),
				phone: z.string().optional(),
				status: z.enum(["active", "inactive"]).optional(),
				credit_limit: creditLimit,
			}),
		)
		.output(customerSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const updated = await updateCustomer(ctx.user.id, id, data);
			if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await deleteCustomer(ctx.user.id, input.id);
			return { success: true };
		}),

	/** Saldo de todos los clientes con cuenta (para la columna de la lista). */
	balances: protectedProcedure
		.input(z.void())
		.output(z.array(z.object({ customer_id: z.number(), balance: z.number() })))
		.query(async ({ ctx }) => {
			const balances = await accountBalances(ctx.user.id);
			return [...balances].map(([customer_id, balance]) => ({
				customer_id,
				balance,
			}));
		}),

	/** Estado de cuenta de un cliente: saldo actual y movimientos. */
	account: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(accountSchema)
		.query(async ({ ctx, input }) => {
			return getAccount(ctx.user.id, input.id);
		}),

	/** Pago a cuenta: registra el ingreso y baja el saldo, atómico. */
	pay: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				amount: z.number().int().positive(),
				paymentMethodId: z.number(),
				note: z.string().optional(),
			}),
		)
		.output(accountSchema)
		.mutation(async ({ ctx, input }) => {
			try {
				return await payAccount(ctx.user.id, input.id, {
					amount: input.amount,
					paymentMethodId: input.paymentMethodId,
					note: input.note,
				});
			} catch (err) {
				if (err instanceof AccountError) {
					throw new TRPCError({
						code: ACCOUNT_ERROR_CODES[err.code],
						message: err.message,
					});
				}
				throw err;
			}
		}),
});
