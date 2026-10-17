import type {
	DomainEvent,
	StoredEvent,
	StreamAppend,
} from "@finopenpos/event-sourcing";
import { foldStream, foldStreams } from "@finopenpos/event-sourcing";
import { customerMap } from "./customers";
import {
	loadProduct,
	type ProductEvent,
	productMap,
	unitPriceFor,
} from "./products";
import { eventStore, STREAM } from "./store";
import { listTransactions, type TransactionEvent } from "./transactions";

// ── Eventos ─────────────────────────────────────────────────────────────────
export interface OrderItemData {
	product_id: number;
	quantity: number;
	price: number;
}

export interface OrderPlacedData {
	customer_id: number | null;
	total_amount: number;
	status: string;
	items: OrderItemData[];
}

export interface OrderUpdatedData {
	total_amount?: number;
	status?: string;
}

export type OrderEvent =
	| DomainEvent<"OrderPlaced", OrderPlacedData>
	| DomainEvent<"OrderUpdated", OrderUpdatedData>
	| DomainEvent<"OrderCancelled", Record<string, never>>
	| DomainEvent<"OrderDeleted", Record<string, never>>;

// ── Estado ──────────────────────────────────────────────────────────────────
export interface Order {
	id: number;
	customer_id: number | null;
	total_amount: number;
	status: string | null;
	user_uid: string;
	created_at: Date;
	items: OrderItemData[];
}

export function orderReducer(
	state: Order | undefined,
	event: StoredEvent<OrderEvent>,
): Order | undefined {
	switch (event.type) {
		case "OrderPlaced": {
			const d = event.data as OrderPlacedData;
			return {
				id: event.streamId,
				customer_id: d.customer_id,
				total_amount: d.total_amount,
				status: d.status,
				user_uid: event.userUid,
				created_at: event.occurredAt,
				items: d.items,
			};
		}
		case "OrderUpdated": {
			if (!state) return state;
			const d = event.data as OrderUpdatedData;
			return {
				...state,
				...(d.total_amount !== undefined
					? { total_amount: d.total_amount }
					: {}),
				...(d.status !== undefined ? { status: d.status } : {}),
			};
		}
		case "OrderCancelled":
			return state ? { ...state, status: "cancelled" } : state;
		case "OrderDeleted":
			return undefined;
		default:
			return state;
	}
}

// ── Proyecciones ────────────────────────────────────────────────────────────
export async function orderMap(userUid: string): Promise<Map<number, Order>> {
	const events = await eventStore.readAll<OrderEvent>([STREAM.order], {
		userUid,
	});
	return foldStreams(events, orderReducer);
}

export interface OrderWithCustomer extends Omit<Order, "items"> {
	customer: { name: string } | null;
}

function toOrderWithCustomer(
	order: Order,
	customers: Map<number, { name: string }>,
): OrderWithCustomer {
	const { items: _items, ...rest } = order;
	const customer = order.customer_id
		? (customers.get(order.customer_id) ?? null)
		: null;
	return { ...rest, customer: customer ? { name: customer.name } : null };
}

export async function listOrders(
	userUid: string,
): Promise<OrderWithCustomer[]> {
	const [ordersMap, customers] = await Promise.all([
		orderMap(userUid),
		customerMap(userUid),
	]);
	return [...ordersMap.values()].map((o) => toOrderWithCustomer(o, customers));
}

export interface OrderDetail extends OrderWithCustomer {
	orderItems: {
		id: number;
		product_id: number | null;
		quantity: number;
		price: number;
		product: { name: string; category: string | null } | null;
	}[];
}

export async function getOrderDetail(
	userUid: string,
	id: number,
): Promise<OrderDetail | null> {
	const events = await eventStore.readStream<OrderEvent>(STREAM.order, id);
	const { state } = foldStream(events, orderReducer);
	if (!state || state.user_uid !== userUid) return null;

	const [customers, products] = await Promise.all([
		customerMap(userUid),
		productMap(userUid),
	]);

	return {
		...toOrderWithCustomer(state, customers),
		orderItems: state.items.map((item, idx) => {
			const product = products.get(item.product_id);
			return {
				// los ítems viven dentro del evento OrderPlaced; id sintético estable
				id: state.id * 1000 + idx + 1,
				product_id: item.product_id,
				quantity: item.quantity,
				price: item.price,
				product: product
					? { name: product.name, category: product.category }
					: null,
			};
		}),
	};
}

export async function loadOrder(
	id: number,
): Promise<{ state: Order | undefined; version: number }> {
	const events = await eventStore.readStream<OrderEvent>(STREAM.order, id);
	return foldStream(events, orderReducer);
}

// ── Comandos ────────────────────────────────────────────────────────────────
export interface PlaceOrderItemInput {
	product_id: number;
	quantity: number;
}

export interface PlaceOrderInput {
	/** null en compra de mostrador, sin cliente registrado. */
	customerId: number | null;
	paymentMethodId: number;
	products: PlaceOrderItemInput[];
}

export type OrderErrorCode =
	| "invalid_quantity"
	| "product_not_found"
	| "insufficient_stock"
	| "not_cancellable";

/** Error de negocio de una venta: el router lo traduce a un código tRPC. */
export class OrderError extends Error {
	constructor(
		readonly code: OrderErrorCode,
		message: string,
	) {
		super(message);
		this.name = "OrderError";
	}
}

/**
 * Flujo de venta del POS: un pedido es un solo hecho que toca tres agregados —
 * `OrderPlaced` (pedido), `StockDecremented` por ítem (stock) y
 * `TransactionRecorded` (pago) — grabados en un único append atómico.
 *
 * El precio y el total salen del catálogo del servidor: el cliente solo manda qué y
 * cuánto. El stock se valida y se descuenta acá, no en el navegador.
 */
export async function placeOrder(
	userUid: string,
	input: PlaceOrderInput,
): Promise<OrderWithCustomer> {
	if (input.products.length === 0) {
		throw new OrderError(
			"invalid_quantity",
			"La venta necesita al menos un producto.",
		);
	}

	// Cantidad por producto: el POS no manda duplicados, pero la API es pública.
	const requested = new Map<number, number>();
	for (const p of input.products) {
		if (!Number.isInteger(p.quantity) || p.quantity <= 0) {
			throw new OrderError(
				"invalid_quantity",
				`Cantidad inválida para el producto ${p.product_id}.`,
			);
		}
		requested.set(
			p.product_id,
			(requested.get(p.product_id) ?? 0) + p.quantity,
		);
	}

	const catalog = await productMap(userUid);
	const items: OrderItemData[] = [];
	const stockStreams: StreamAppend<
		OrderEvent | TransactionEvent | ProductEvent
	>[] = [];

	for (const [productId, quantity] of requested) {
		const product = catalog.get(productId);
		if (!product) {
			throw new OrderError(
				"product_not_found",
				`El producto ${productId} no existe.`,
			);
		}
		if (quantity > product.in_stock) {
			throw new OrderError(
				"insufficient_stock",
				`Stock insuficiente de ${product.name}: quedan ${product.in_stock}.`,
			);
		}

		const { version } = await loadProduct(productId);
		items.push({
			product_id: productId,
			quantity,
			price: unitPriceFor(product, quantity),
		});
		stockStreams.push({
			streamType: STREAM.product,
			streamId: productId,
			expectedVersion: version,
			events: [{ type: "StockDecremented", data: { quantity } }],
		});
	}

	const total = items.reduce(
		(sum, item) => sum + item.price * item.quantity,
		0,
	);
	const orderId = await eventStore.nextStreamId(STREAM.order);
	const transactionId = await eventStore.nextStreamId(STREAM.transaction);

	// Un solo INSERT: pedido + baja de stock + pago. Todo se graba o nada se graba.
	const stored = await eventStore.appendMany<
		OrderEvent | TransactionEvent | ProductEvent
	>(
		[
			{
				streamType: STREAM.order,
				streamId: orderId,
				expectedVersion: 0,
				events: [
					{
						type: "OrderPlaced",
						data: {
							customer_id: input.customerId,
							total_amount: total,
							status: "completed",
							items,
						},
					},
				],
			},
			...stockStreams,
			{
				streamType: STREAM.transaction,
				streamId: transactionId,
				expectedVersion: 0,
				events: [
					{
						type: "TransactionRecorded",
						data: {
							order_id: orderId,
							payment_method_id: input.paymentMethodId,
							amount: total,
							status: "completed",
							category: "selling",
							type: "income",
							description: `Payment for order #${orderId}`,
						},
					},
				],
			},
		],
		{ userUid },
	);

	const placed = stored.find(
		(event) => event.streamType === STREAM.order && event.streamId === orderId,
	);
	if (!placed) throw new Error("unreachable: order event was not stored");
	const state = orderReducer(undefined, placed as StoredEvent<OrderEvent>);
	if (!state) throw new Error("unreachable: create produced no state");
	const customers = await customerMap(userUid);
	return toOrderWithCustomer(state, customers);
}

export async function updateOrder(
	userUid: string,
	id: number,
	data: OrderUpdatedData,
): Promise<OrderWithCustomer | undefined> {
	const { state, version } = await loadOrder(id);
	if (!state || state.user_uid !== userUid) return undefined;

	const changes = Object.fromEntries(
		Object.entries(data).filter(([, v]) => v !== undefined),
	) as OrderUpdatedData;

	const [stored] = await eventStore.append<OrderEvent>({
		streamType: STREAM.order,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "OrderUpdated", data: changes }],
	});
	const next = orderReducer(state, stored as StoredEvent<OrderEvent>);
	if (!next) throw new Error("unreachable: update produced no state");
	const customers = await customerMap(userUid);
	return toOrderWithCustomer(next, customers);
}

export async function deleteOrder(userUid: string, id: number): Promise<void> {
	const { state, version } = await loadOrder(id);
	if (!state || state.user_uid !== userUid) return;

	await eventStore.append<OrderEvent>({
		streamType: STREAM.order,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "OrderDeleted", data: {} }],
	});
}

/**
 * Anula una venta como un hecho nuevo (nunca se edita el pasado): en un único
 * append atómico `OrderCancelled` marca el pedido, `StockRestocked` reintegra
 * las unidades que la venta había descontado y `TransactionRecorded` con
 * importe negativo revierte el pago en el mismo medio.
 *
 * A diferencia de borrar, la venta y su pago siguen en el log: queda auditado.
 */
export async function cancelOrder(
	userUid: string,
	id: number,
): Promise<OrderWithCustomer | undefined> {
	const { state, version } = await loadOrder(id);
	if (!state || state.user_uid !== userUid) return undefined;
	if (state.status === "cancelled") {
		throw new OrderError("not_cancellable", `La venta #${id} ya está anulada.`);
	}

	// Se devuelve exactamente lo que la venta descontó, agregado por producto.
	const restock = new Map<number, number>();
	for (const item of state.items) {
		restock.set(
			item.product_id,
			(restock.get(item.product_id) ?? 0) + item.quantity,
		);
	}

	const stockStreams: StreamAppend<
		OrderEvent | TransactionEvent | ProductEvent
	>[] = [];
	for (const [productId, quantity] of restock) {
		const { state: product, version: productVersion } =
			await loadProduct(productId);
		// Si el producto ya no existe no hay dónde reintegrar: se omite.
		if (!product || product.user_uid !== userUid) continue;
		stockStreams.push({
			streamType: STREAM.product,
			streamId: productId,
			expectedVersion: productVersion,
			events: [{ type: "StockRestocked", data: { quantity } }],
		});
	}

	// El reintegro va al mismo medio de pago que cobró la venta original.
	const transactions = await listTransactions(userUid);
	const original = transactions.find(
		(t) => t.order_id === id && t.category !== "refund",
	);

	const streams: StreamAppend<OrderEvent | TransactionEvent | ProductEvent>[] =
		[
			{
				streamType: STREAM.order,
				streamId: id,
				expectedVersion: version,
				events: [{ type: "OrderCancelled", data: {} }],
			},
			...stockStreams,
		];

	// Si la venta nunca generó una transacción (p. ej. un pedido pendiente), no
	// hay dinero que revertir: sólo se anula y se reintegra el stock.
	if (original) {
		streams.push({
			streamType: STREAM.transaction,
			streamId: await eventStore.nextStreamId(STREAM.transaction),
			expectedVersion: 0,
			events: [
				{
					type: "TransactionRecorded",
					data: {
						order_id: id,
						payment_method_id: original.payment_method_id ?? undefined,
						amount: -state.total_amount,
						status: "completed",
						category: "refund",
						type: "income",
						description: `Anulación de venta #${id}`,
					},
				},
			],
		});
	}

	const stored = await eventStore.appendMany<
		OrderEvent | TransactionEvent | ProductEvent
	>(streams, { userUid });

	const cancelled = stored.find(
		(event) => event.streamType === STREAM.order && event.streamId === id,
	);
	if (!cancelled) throw new Error("unreachable: cancel event was not stored");
	const next = orderReducer(state, cancelled as StoredEvent<OrderEvent>);
	if (!next) throw new Error("unreachable: cancel produced no state");
	const customers = await customerMap(userUid);
	return toOrderWithCustomer(next, customers);
}
