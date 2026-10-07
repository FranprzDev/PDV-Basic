import { NextResponse } from "next/server";
import { getAuthUser } from "@/lib/auth-guard";
import { findProductByBarcode } from "@/lib/es";

/**
 * Búsqueda de producto por código de barras, como REST plano.
 *
 * El router tRPC ya expone `products.lookup`, pero trpc-to-openapi solo genera la
 * especificación: no sirve las rutas. Esta route es el handler real, para que
 * un cliente externo (bot de WhatsApp, app móvil, caja secondary) pueda
 * consultar sin depender de tRPC.
 *
 * GET /api/products/lookup?barcode=7798145678903
 */
export async function GET(request: Request) {
	const user = await getAuthUser();
	if (!user) {
		return NextResponse.json({ error: "No autorizado" }, { status: 401 });
	}

	const { searchParams } = new URL(request.url);
	const barcode = searchParams.get("barcode")?.trim();
	if (!barcode) {
		return NextResponse.json(
			{ error: "Falta el parámetro barcode" },
			{ status: 400 },
		);
	}

	const product = await findProductByBarcode(user.id, barcode);

	if (!product) {
		return NextResponse.json({ found: false, product: null });
	}

	return NextResponse.json({
		found: true,
		product: {
			id: product.id,
			name: product.name,
			price: product.price,
			in_stock: product.in_stock,
			category: product.category,
			barcode: product.barcode,
			unit_of_measure: product.unit_of_measure,
		},
	});
}