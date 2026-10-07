import { TRPCError } from "@trpc/server";
import { z } from "zod/v4";
import {
	createProduct,
	deleteProduct,
	findProductByBarcode,
	listProducts,
	updateProduct,
} from "@/lib/es";
import { protectedProcedure, router } from "../init";

const productSchema = z.object({
	id: z.number(),
	name: z.string(),
	description: z.string().nullable(),
	price: z.number(),
	in_stock: z.number(),
	category: z.string().nullable(),
	barcode: z.string().nullable(),
	user_uid: z.string(),
	unit_of_measure: z.string().nullable(),
	created_at: z.date().nullable(),
});

export const productsRouter = router({
	list: protectedProcedure
		.input(z.void())
		.output(z.array(productSchema))
		.query(async ({ ctx }) => {
			return listProducts(ctx.user.id);
		}),

	create: protectedProcedure
		.input(
			z.object({
				name: z.string().min(1),
				description: z.string().optional(),
				price: z.number().int(),
				in_stock: z.number().int().min(0),
				category: z.string().optional(),
				barcode: z.string().max(64).optional(),
				unit_of_measure: z.string().max(6).optional(),
			}),
		)
		.output(productSchema)
		.mutation(async ({ ctx, input }) => {
			return createProduct(ctx.user.id, input);
		}),

	update: protectedProcedure
		.input(
			z.object({
				id: z.number(),
				name: z.string().min(1).optional(),
				description: z.string().optional(),
				price: z.number().int().optional(),
				in_stock: z.number().int().min(0).optional(),
				category: z.string().optional(),
				barcode: z.string().max(64).optional(),
				unit_of_measure: z.string().max(6).optional(),
			}),
		)
		.output(productSchema)
		.mutation(async ({ ctx, input }) => {
			const { id, ...data } = input;
			const updated = await updateProduct(ctx.user.id, id, data);
			if (!updated) throw new TRPCError({ code: "NOT_FOUND" });
			return updated;
		}),

	delete: protectedProcedure
		.input(z.object({ id: z.number() }))
		.output(z.object({ success: z.boolean() }))
		.mutation(async ({ ctx, input }) => {
			await deleteProduct(ctx.user.id, input.id);
			return { success: true };
		}),

	/** Busca por código de barras escaneado. Devuelve found:false si aún no está registrado. */
	lookup: protectedProcedure
		.input(z.object({ barcode: z.string().min(1) }))
		.output(z.object({ found: z.boolean(), product: productSchema.nullable() }))
		.query(async ({ ctx, input }) => {
			const product = await findProductByBarcode(ctx.user.id, input.barcode);
			return { found: Boolean(product), product: product ?? null };
		}),
});
