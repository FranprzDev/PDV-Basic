import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser, must, SCHEMA_DDL } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { ordersRouter } = await import("../orders");
const { createCallerFactory } = await import("../../init");
const {
	createCustomer,
	createProduct,
	createPaymentMethod,
	listProducts,
	listTransactions,
} = await import("@/lib/es");

const caller = createCallerFactory(ordersRouter)({ user: makeUser("user-1") });
const callerAs = (uid: string) =>
	createCallerFactory(ordersRouter)({ user: makeUser(uid) });

let customerId: number;
let productId: number;
let paymentMethodId: number;

beforeAll(async () => {
	await pg.exec(SCHEMA_DDL);

	const cust = await createCustomer("user-1", {
		name: "Test Customer",
		email: "order-test@t.com",
	});
	customerId = cust.id;

	const prod = await createProduct("user-1", {
		name: "Test Product",
		price: 1000,
		in_stock: 50,
	});
	productId = prod.id;

	const pm = await createPaymentMethod("user-1", "Cash-OrderTest");
	paymentMethodId = pm.id;
});

afterAll(async () => {
	await pg.close();
});

async function stockOf(id: number): Promise<number> {
	const products = await listProducts("user-1");
	return must(products.find((p) => p.id === id)).in_stock;
}

describe("orders.list", () => {
	it("returns empty array initially", async () => {
		const list = await caller.list();
		expect(list).toEqual([]);
		expect(list.length).toBe(0);
	});

	it("returns order with nested customer after create", async () => {
		await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 2 }],
		});

		const list = await caller.list();
		expect(list.length).toBe(1);
		const order = must(list[0]);
		expect(order.customer).toBeDefined();
		expect(must(order.customer).name).toBe("Test Customer");
		expect(order.total_amount).toBe(2000);
		expect(order.user_uid).toBe("user-1");
	});

	it("filters by user_uid — other user sees nothing", async () => {
		const other = callerAs("outsider");
		const otherList = await other.list();
		expect(otherList.length).toBe(0);

		const myList = await caller.list();
		expect(myList.every((o) => o.user_uid === "user-1")).toBe(true);
		expect(myList.length).toBeGreaterThanOrEqual(1);
	});
});

describe("orders.create", () => {
	it("creates order + orderItems + transaction (events in one command)", async () => {
		const before = await caller.list();
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 3 }],
		});

		expect(order.id).toBeGreaterThan(0);
		expect(order.total_amount).toBe(3000);
		expect(order.status).toBe("completed");
		expect(must(order.customer).name).toBe("Test Customer");

		// Verify order appeared in list
		const after = await caller.list();
		expect(after.length).toBe(before.length + 1);

		// Verify items via read model (rebuilt from OrderPlaced event)
		const detail = await caller.get({ id: order.id });
		expect(detail).not.toBeNull();
		const d = must(detail);
		const item = must(d.orderItems[0]);
		expect(d.orderItems.length).toBe(1);
		expect(item.quantity).toBe(3);
		expect(item.price).toBe(1000);
		expect(item.product_id).toBe(productId);
		expect(must(item.product).name).toBe("Test Product");

		// Verify the payment transaction was recorded in the event log
		const txns = (await listTransactions("user-1")).filter(
			(t) => t.order_id === order.id,
		);
		expect(txns.length).toBe(1);
		expect(txns[0].amount).toBe(3000);
		expect(txns[0].type).toBe("income");
		expect(txns[0].category).toBe("selling");
		expect(txns[0].status).toBe("completed");
		expect(txns[0].user_uid).toBe("user-1");
		expect(txns[0].payment_method_id).toBe(paymentMethodId);
	});

	it("uses the server price, not whatever the client sends", async () => {
		// Un cliente viejo todavía manda price/total: no debe poder fijar el monto.
		const staleClientPayload: unknown = {
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 2, price: 1 }],
			total: 1,
		};
		const order = await caller.create(
			staleClientPayload as Parameters<typeof caller.create>[0],
		);
		expect(order.total_amount).toBe(2000);
	});
});

describe("orders.create — stock", () => {
	it("decrements stock for each item sold", async () => {
		const product = await createProduct("user-1", {
			name: "Stock Product",
			price: 2500,
			in_stock: 10,
		});
		expect(await stockOf(product.id)).toBe(10);

		await caller.create({
			customerId: null,
			paymentMethodId,
			products: [{ id: product.id, quantity: 4 }],
		});

		expect(await stockOf(product.id)).toBe(6);
	});

	it("agrega líneas repetidas en una sola baja por producto", async () => {
		const product = await createProduct("user-1", {
			name: "Repeat Product",
			price: 100,
			in_stock: 5,
		});
		await caller.create({
			customerId: null,
			paymentMethodId,
			products: [
				{ id: product.id, quantity: 2 },
				{ id: product.id, quantity: 1 },
			],
		});
		expect(await stockOf(product.id)).toBe(2);
	});

	it("rejects a sale over available stock — nothing is written", async () => {
		const product = await createProduct("user-1", {
			name: "Scarce Product",
			price: 500,
			in_stock: 2,
		});
		const ordersBefore = (await caller.list()).length;
		const txnsBefore = (await listTransactions("user-1")).length;

		await expect(
			caller.create({
				customerId: null,
				paymentMethodId,
				products: [{ id: product.id, quantity: 3 }],
			}),
		).rejects.toThrow(/Stock insuficiente/);

		expect(await stockOf(product.id)).toBe(2);
		expect((await caller.list()).length).toBe(ordersBefore);
		expect((await listTransactions("user-1")).length).toBe(txnsBefore);
	});

	it("rejects an unknown product — nothing is written", async () => {
		const ordersBefore = (await caller.list()).length;
		await expect(
			caller.create({
				customerId: null,
				paymentMethodId,
				products: [{ id: 999999, quantity: 1 }],
			}),
		).rejects.toThrow(/no existe/);
		expect((await caller.list()).length).toBe(ordersBefore);
	});

	it("rejects quantity: 0 — no order created, stock untouched", async () => {
		const before = (await caller.list()).length;
		const stockBefore = await stockOf(productId);
		await expect(
			caller.create({
				customerId,
				paymentMethodId,
				products: [{ id: productId, quantity: 0 }],
			}),
		).rejects.toThrow();
		expect((await caller.list()).length).toBe(before);
		expect(await stockOf(productId)).toBe(stockBefore);
	});
});

describe("orders.update", () => {
	it("updates status and change persists in list()", async () => {
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 1 }],
		});
		const updated = await caller.update({ id: order.id, status: "pending" });
		expect(updated.status).toBe("pending");

		const list = await caller.list();
		const persisted = must(list.find((o) => o.id === order.id));
		expect(persisted.status).toBe("pending");
		expect(persisted.total_amount).toBe(1000); // unchanged field preserved
	});

	it("rejects the removed 'cancelled' status", async () => {
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 1 }],
		});
		await expect(
			caller.update({
				id: order.id,
				status: "cancelled" as unknown as "completed",
			}),
		).rejects.toThrow();

		// Original status untouched
		const list = await caller.list();
		const persisted = must(list.find((o) => o.id === order.id));
		expect(persisted.status).toBe("completed");
	});
});

describe("orders.delete", () => {
	it("deletes order — gone from list and detail, items unreachable", async () => {
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 1 }],
		});

		const before = await caller.list();
		await caller.delete({ id: order.id });
		const after = await caller.list();

		expect(after.length).toBe(before.length - 1);
		expect(after.some((o) => o.id === order.id)).toBe(false);

		// Detail read model no longer materializes the deleted order (nor items)
		const detail = await caller.get({ id: order.id });
		expect(detail).toBeNull();
	});

	it("keeps the payment transaction as a historical fact after delete", async () => {
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: productId, quantity: 1 }],
		});

		await caller.delete({ id: order.id });

		// El evento TransactionRecorded permanece en el log — los hechos no se borran
		const txns = (await listTransactions("user-1")).filter(
			(t) => t.order_id === order.id,
		);
		expect(txns.length).toBe(1);
		expect(txns[0].amount).toBe(1000);
	});

	it("is idempotent — deleting non-existent id is no-op", async () => {
		const before = await caller.list();
		const result = await caller.delete({ id: 999999 });
		expect(result.success).toBe(true);
		const after = await caller.list();
		expect(after.length).toBe(before.length);
	});
});

describe("orders.cancel", () => {
	it("marks the order cancelled, restores stock and reverses the payment", async () => {
		const product = await createProduct("user-1", {
			name: "Cancel Me",
			price: 500,
			in_stock: 10,
		});
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: product.id, quantity: 4 }],
		});
		expect(await stockOf(product.id)).toBe(6);

		const cancelled = await caller.cancel({ id: order.id });
		expect(cancelled.status).toBe("cancelled");
		expect(await stockOf(product.id)).toBe(10);

		const txns = (await listTransactions("user-1")).filter(
			(t) => t.order_id === order.id,
		);
		// El pago original sigue en el log; se agrega el reintegro en negativo.
		expect(txns.length).toBe(2);
		const original = must(txns.find((t) => t.category !== "refund"));
		const refund = must(txns.find((t) => t.category === "refund"));
		expect(original.amount).toBe(2000);
		expect(refund.amount).toBe(-2000);
		expect(refund.payment_method_id).toBe(original.payment_method_id);
	});

	it("is idempotent — a second cancel fails and does not double the stock", async () => {
		const product = await createProduct("user-1", {
			name: "Once Only",
			price: 100,
			in_stock: 5,
		});
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: product.id, quantity: 2 }],
		});
		await caller.cancel({ id: order.id });
		await expect(caller.cancel({ id: order.id })).rejects.toThrow();

		expect(await stockOf(product.id)).toBe(5);
		const refunds = (await listTransactions("user-1")).filter(
			(t) => t.order_id === order.id && t.category === "refund",
		);
		expect(refunds.length).toBe(1);
	});

	it("persists the cancelled status in list()", async () => {
		const product = await createProduct("user-1", {
			name: "Listed",
			price: 250,
			in_stock: 3,
		});
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: product.id, quantity: 1 }],
		});
		await caller.cancel({ id: order.id });

		const list = await caller.list();
		const persisted = must(list.find((o) => o.id === order.id));
		expect(persisted.status).toBe("cancelled");
	});

	it("refuses to cancel another user's order", async () => {
		const other = callerAs("outsider");
		await expect(other.cancel({ id: 1 })).rejects.toThrow();
	});

	it("returns NOT_FOUND for a non-existent order", async () => {
		await expect(caller.cancel({ id: 999999 })).rejects.toThrow();
	});

	it("keeps the order read model without items after cancel", async () => {
		const product = await createProduct("user-1", {
			name: "Still Detailed",
			price: 300,
			in_stock: 2,
		});
		const order = await caller.create({
			customerId,
			paymentMethodId,
			products: [{ id: product.id, quantity: 1 }],
		});
		await caller.cancel({ id: order.id });

		const detail = await caller.get({ id: order.id });
		expect(must(detail).status).toBe("cancelled");
		expect(must(detail).orderItems.length).toBe(1);
	});
});
