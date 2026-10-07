import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import {
	deleteOrder,
	getOrderDetail,
	listOrders,
	placeOrder,
	updateOrder,
} from "@/lib/es";
import { protectedProcedure, router } from "../init";

const orderWithCustomerSchema = z.object({
	id: z.number(),
	customer_id: z.number().nullable(),
	total_amount: z.number(),
	status: z.string().nullable(),
	user_uid: z.string(),
	created_at: z.date().nullable(),
	customer: z.object({ name: z.string() }).nullable(),
});

const orderDetailSchema = z.object({
	id: z.number(),
	customer_id: z.number().nullable(),
	total_amount: z.number(),
	status: z.string().nullable(),
	user_uid: z.string(),
	created_at: z.date().nullable(),
	customer: z.object({ name: z.string() }).nullable(),
	orderItems: z.array(
		z.object({
			id: z.number(),
			product_id: z.number().nullable(),
			quantity: z.number(),
			price: z.number(),
			product: z
				.object({ name: z.string(), category: z.string().nullable() })
				.nullable(),
		}),
	),
});

export const ordersRouter = router({
	get: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(orderDetailSchema.nullable())
		.query(async ({ ctx, input }) => {
			return getOrderDetail(ctx.user.id, input.id);
		}),

	list: protectedProcedure
		.input(z.void())
		.output(z.array(orderWithCustomerSchema))
		.query(async ({ ctx }) => {
			return listOrders(ctx.user.id);
		}),

	create: protectedProcedure
		.input(
			z.object({
				customerId: z.number().nullable().optional(),
				paymentMethodId: z.number(),
				products: z.array(
					z.object({
						id: z.number(),
						quantity: z.number().int().positive(),
						price: z.number().int(),
					}),
				),
				total: z.number().int(),
			}),
		)
		.output(orderWithCustomerSchema)
		.mutation(async ({ ctx, input }) => {
			return placeOrder(ctx.user.id, {
				customerId: input.customerId ?? null,
				paymentMethodId: input.paymentMethodId,
				products: input.products.map((p) => ({
					product_id: p.id,
					quantity: p.quantity,
					price: p.price,
				})),
				total: input.total,
			});
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				total_amount: z.number().int().optional(),
				status: z.enum(["completed", "pending", "cancelled"]).optional(),
			}),
		)
		.output(orderWithCustomerSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const updated = await updateOrder(ctx.user.id, id, data);
			if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await deleteOrder(ctx.user.id, input.id);
			return { success: true };
		}),
});
