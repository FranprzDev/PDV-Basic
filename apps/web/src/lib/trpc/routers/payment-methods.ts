import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import {
	createPaymentMethod,
	deletePaymentMethod,
	listPaymentMethods,
	renamePaymentMethod,
} from "@/lib/es";
import { protectedProcedure, router } from "../init";

const paymentMethodSchema = z.object({
	id: z.number(),
	name: z.string(),
	is_account: z.boolean(),
	created_at: z.date().nullable(),
});

export const paymentMethodsRouter = router({
	list: protectedProcedure
		.input(z.void())
		.output(z.array(paymentMethodSchema))
		.query(async () => {
			return listPaymentMethods();
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				is_account: z.boolean().optional(),
			}),
		)
		.output(paymentMethodSchema)
		.mutation(async ({ ctx, input }) => {
			return createPaymentMethod(
				ctx.user.id,
				input.name.trim(),
				input.is_account ?? false,
			);
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1),
				is_account: z.boolean().optional(),
			}),
		)
		.output(paymentMethodSchema)
		.mutation(async ({ ctx, input }) => {
			const updated = await renamePaymentMethod(
				ctx.user.id,
				input.id,
				input.name.trim(),
				input.is_account,
			);
			if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await deletePaymentMethod(ctx.user.id, input.id);
			return { success: true };
		}),
});
