import type {
	DomainEvent,
	StoredEvent,
	StreamAppend,
} from "@finopenpos/event-sourcing";
import { foldStream, foldStreams } from "@finopenpos/event-sourcing";
import { findByBarcode } from "@/lib/scanner/barcode";
import { eventStore, STREAM } from "./store";

// ── Eventos ─────────────────────────────────────────────────────────────────
export interface ProductCreatedData {
	name: string;
	description?: string;
	price: number;
	in_stock: number;
	min_stock?: number;
	category?: string;
	barcode?: string;
	unit_of_measure?: string;
	/** Precio por cantidad a partir de `wholesale_min_qty`. */
	wholesale_price?: number | null;
	/** Cantidad desde la que aplica el precio mayorista. */
	wholesale_min_qty?: number | null;
}

export type ProductUpdatedData = Partial<ProductCreatedData>;

/** Baja de stock: unidades que salen por una venta. */
export interface StockDecrementedData {
	quantity: number;
}

/** Alta de stock: unidades que vuelven por una anulación. */
export interface StockRestockedData {
	quantity: number;
}

export type ProductEvent =
	| DomainEvent<"ProductCreated", ProductCreatedData>
	| DomainEvent<"ProductUpdated", ProductUpdatedData>
	| DomainEvent<"StockDecremented", StockDecrementedData>
	| DomainEvent<"StockRestocked", StockRestockedData>
	| DomainEvent<"ProductDeleted", Record<string, never>>;

// ── Estado (misma forma del contrato de la API) ─────────────────────────────
export interface Product {
	id: number;
	name: string;
	description: string | null;
	price: number;
	in_stock: number;
	min_stock: number;
	category: string | null;
	barcode: string | null;
	user_uid: string;
	unit_of_measure: string | null;
	wholesale_price: number | null;
	wholesale_min_qty: number | null;
	created_at: Date;
}

function definedOnly<T extends object>(data: T): Partial<T> {
	return Object.fromEntries(
		Object.entries(data).filter(([, v]) => v !== undefined),
	) as Partial<T>;
}

/** ¿Está en o por debajo del mínimo? Sin mínimo configurado nunca activa. */
export function isBelowMinimum(product: {
	min_stock: number;
	in_stock: number;
}): boolean {
	return product.min_stock > 0 && product.in_stock <= product.min_stock;
}

/**
 * Precio unitario vigente: mayorista si la cantidad alcanza el mínimo
 * configurado, si no minorista. Es la regla que usan tanto el servidor
 * (para cobrar) como el POS (para mostrar), así no se desincronizan.
 */
export function unitPriceFor(
	product: Pick<Product, "price" | "wholesale_price" | "wholesale_min_qty">,
	quantity: number,
): number {
	if (
		product.wholesale_price !== null &&
		product.wholesale_min_qty !== null &&
		product.wholesale_min_qty > 0 &&
		quantity >= product.wholesale_min_qty
	) {
		return product.wholesale_price;
	}
	return product.price;
}

export function productReducer(
	state: Product | undefined,
	event: StoredEvent<ProductEvent>,
): Product | undefined {
	switch (event.type) {
		case "ProductCreated": {
			const d = event.data as ProductCreatedData;
			return {
				id: event.streamId,
				name: d.name,
				description: d.description ?? null,
				price: d.price,
				in_stock: d.in_stock,
				min_stock: d.min_stock ?? 0,
				category: d.category ?? null,
				barcode: d.barcode ?? null,
				user_uid: event.userUid,
				unit_of_measure: d.unit_of_measure ?? "UN",
				wholesale_price: d.wholesale_price ?? null,
				wholesale_min_qty: d.wholesale_min_qty ?? null,
				created_at: event.occurredAt,
			};
		}
		case "ProductUpdated":
			return state
				? { ...state, ...definedOnly(event.data as ProductUpdatedData) }
				: state;
		case "StockDecremented": {
			if (!state) return state;
			const d = event.data as StockDecrementedData;
			return { ...state, in_stock: Math.max(0, state.in_stock - d.quantity) };
		}
		case "StockRestocked": {
			if (!state) return state;
			const d = event.data as StockRestockedData;
			return { ...state, in_stock: state.in_stock + d.quantity };
		}
		case "ProductDeleted":
			return undefined;
		default:
			return state;
	}
}

// ── Proyecciones (estado siempre reconstruido de los eventos) ───────────────
export async function listProducts(userUid: string): Promise<Product[]> {
	const events = await eventStore.readAll<ProductEvent>([STREAM.product], {
		userUid,
	});
	return [...foldStreams(events, productReducer).values()];
}

export async function productMap(
	userUid: string,
): Promise<Map<number, Product>> {
	const events = await eventStore.readAll<ProductEvent>([STREAM.product], {
		userUid,
	});
	return foldStreams(events, productReducer);
}

export async function loadProduct(
	id: number,
): Promise<{ state: Product | undefined; version: number }> {
	const events = await eventStore.readStream<ProductEvent>(STREAM.product, id);
	return foldStream(events, productReducer);
}

// ── Consultas ────────────────────────────────────────────────────────────────

/** Productos en o por debajo del mínimo: candidatos a reponer. */
export async function listLowStock(userUid: string): Promise<Product[]> {
	const products = await listProducts(userUid);
	return products
		.filter(isBelowMinimum)
		.sort((a, b) => a.in_stock - b.in_stock);
}

export async function findProductByBarcode(
	userUid: string,
	barcode: string,
): Promise<Product | undefined> {
	const products = await listProducts(userUid);
	return findByBarcode(products, barcode);
}

// ── Comandos ────────────────────────────────────────────────────────────────
export async function createProduct(
	userUid: string,
	data: ProductCreatedData,
): Promise<Product> {
	const id = await eventStore.nextStreamId(STREAM.product);
	const [stored] = await eventStore.append<ProductEvent>({
		streamType: STREAM.product,
		streamId: id,
		expectedVersion: 0,
		userUid,
		events: [
			{ type: "ProductCreated", data: definedOnly(data) as ProductCreatedData },
		],
	});
	const state = productReducer(undefined, stored as StoredEvent<ProductEvent>);
	if (!state) throw new Error("unreachable: create produced no state");
	return state;
}

export async function updateProduct(
	userUid: string,
	id: number,
	data: ProductUpdatedData,
): Promise<Product | undefined> {
	const { state, version } = await loadProduct(id);
	if (!state || state.user_uid !== userUid) return undefined;

	const changes = definedOnly(data);
	const [stored] = await eventStore.append<ProductEvent>({
		streamType: STREAM.product,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "ProductUpdated", data: changes }],
	});
	return productReducer(state, stored as StoredEvent<ProductEvent>);
}

export async function deleteProduct(
	userUid: string,
	id: number,
): Promise<void> {
	const { state, version } = await loadProduct(id);
	if (!state || state.user_uid !== userUid) return;

	await eventStore.append<ProductEvent>({
		streamType: STREAM.product,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "ProductDeleted", data: {} }],
	});
}

// ── Ajuste masivo de precios ────────────────────────────────────────────────
export interface BulkPriceAdjustInput {
	scope: "all" | "category";
	category?: string;
	/** Porcentaje a aplicar: 15 = +15%, -10 = -10%. */
	percent: number;
	/** Redondeo del precio resultante, en centavos (100 = al peso). 0 = sin redondeo. */
	roundTo?: number;
}

export interface PriceChange {
	product_id: number;
	name: string;
	before: number;
	after: number;
	wholesale_before: number | null;
	wholesale_after: number | null;
}

function adjustPrice(price: number, percent: number, roundTo?: number): number {
	const raw = price * (1 + percent / 100);
	if (roundTo && roundTo > 0) {
		const rounded = Math.round(raw / roundTo) * roundTo;
		// Un redondeo agresivo no debe dejar un precio en cero.
		return rounded > 0 ? rounded : Math.round(raw);
	}
	return Math.round(raw);
}

/**
 * Calcula qué productos cambiarían y a qué precio, sin grabar nada. El
 * porcentaje se aplica también al precio mayorista para conservar el margen.
 */
export async function previewBulkPriceAdjust(
	userUid: string,
	input: BulkPriceAdjustInput,
): Promise<PriceChange[]> {
	const products = await listProducts(userUid);
	return products
		.filter((p) => input.scope === "all" || p.category === input.category)
		.map((p) => ({
			product_id: p.id,
			name: p.name,
			before: p.price,
			after: adjustPrice(p.price, input.percent, input.roundTo),
			wholesale_before: p.wholesale_price,
			wholesale_after:
				p.wholesale_price === null
					? null
					: adjustPrice(p.wholesale_price, input.percent, input.roundTo),
		}))
		.filter(
			(c) => c.after !== c.before || c.wholesale_after !== c.wholesale_before,
		);
}

/**
 * Aplica el ajuste como `ProductUpdated` nuevos en un único append atómico:
 * o se actualizan todos los productos, o ninguno.
 */
export async function applyBulkPriceAdjust(
	userUid: string,
	input: BulkPriceAdjustInput,
): Promise<PriceChange[]> {
	const changes = await previewBulkPriceAdjust(userUid, input);
	if (changes.length === 0) return [];

	const streams: StreamAppend<ProductEvent>[] = [];
	for (const change of changes) {
		const { version } = await loadProduct(change.product_id);
		const data: ProductUpdatedData = { price: change.after };
		if (change.wholesale_after !== null) {
			data.wholesale_price = change.wholesale_after;
		}
		streams.push({
			streamType: STREAM.product,
			streamId: change.product_id,
			expectedVersion: version,
			events: [{ type: "ProductUpdated", data }],
		});
	}

	await eventStore.appendMany<ProductEvent>(streams, { userUid });
	return changes;
}
