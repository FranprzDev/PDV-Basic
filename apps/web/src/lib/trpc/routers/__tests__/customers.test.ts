import { afterAll, beforeAll, describe, expect, it, mock } from "bun:test";
import { createTestDb, makeUser, must, SCHEMA_DDL } from "./helpers";

const { pg, db } = createTestDb();
mock.module("@/lib/db", () => ({ db, pglite: pg }));

const { customersRouter } = await import("../customers");
const { createCallerFactory } = await import("../../init");
const { createPaymentMethod, createProduct, listTransactions, placeOrder } =
	await import("@/lib/es");

const caller = createCallerFactory(customersRouter)({
	user: makeUser("user-1"),
});
const callerAs = (uid: string) =>
	createCallerFactory(customersRouter)({ user: makeUser(uid) });

beforeAll(async () => {
	await pg.exec(SCHEMA_DDL);
});
afterAll(async () => {
	await pg.close();
});

describe("customers.list", () => {
	it("returns empty array initially", async () => {
		const list = await caller.list();
		expect(list).toEqual([]);
		expect(list.length).toBe(0);
	});

	it("filters by user_uid — cross-user data invisible", async () => {
		await caller.create({ name: "C1", email: "c1-list@t.com" });
		const other = callerAs("other-cust");
		await other.create({ name: "C-other", email: "c-other-list@t.com" });

		const list = await caller.list();
		expect(list.length).toBe(1);
		expect(list[0].name).toBe("C1");
		expect(list.some((c) => c.name === "C-other")).toBe(false);
	});
});

describe("customers.create", () => {
	it("creates and persists — visible in list()", async () => {
		const before = await caller.list();
		const c = await caller.create({ name: "John", email: "john@example.com" });
		expect(c.name).toBe("John");
		expect(c.email).toBe("john@example.com");
		expect(c.user_uid).toBe("user-1");
		expect(c.id).toBeGreaterThan(0);

		const after = await caller.list();
		expect(after.length).toBe(before.length + 1);
		const found = must(after.find((x) => x.id === c.id));
		expect(found.name).toBe("John");
		expect(found.email).toBe("john@example.com");
	});

	it("optional fields persist correctly", async () => {
		const c = await caller.create({
			name: "Jane",
			email: "jane@example.com",
			phone: "123456",
			status: "active",
		});

		const list = await caller.list();
		const persisted = must(list.find((x) => x.id === c.id));
		expect(persisted.phone).toBe("123456");
		expect(persisted.status).toBe("active");
	});

	it("rejects name: empty string — no record created", async () => {
		const before = await caller.list();
		await expect(
			caller.create({ name: "", email: "empty@t.com" }),
		).rejects.toThrow();
		const after = await caller.list();
		expect(after.length).toBe(before.length);
	});

	it("rejects invalid email", async () => {
		const before = await caller.list();
		await expect(
			caller.create({ name: "X", email: "not-email" }),
		).rejects.toThrow();
		const after = await caller.list();
		expect(after.length).toBe(before.length);
	});

	it("rejects invalid status enum", async () => {
		await expect(
			caller.create({
				name: "X",
				email: "enum@t.com",
				status: "bogus" as unknown as "active",
			}),
		).rejects.toThrow();
	});

	it("rejects duplicate email at DB level — first record intact", async () => {
		const email = "dup@unique.com";
		const first = await caller.create({ name: "First", email });
		await expect(caller.create({ name: "Second", email })).rejects.toThrow();

		const list = await caller.list();
		const dups = list.filter((c) => c.email === email);
		expect(dups.length).toBe(1);
		expect(dups[0].name).toBe("First");
		expect(dups[0].id).toBe(first.id);
	});
});

describe("customers.update", () => {
	it("updates and change persists in list()", async () => {
		const c = await caller.create({ name: "Old", email: "upd@t.com" });
		const updated = await caller.update({ id: c.id, name: "New" });
		expect(updated.name).toBe("New");

		const list = await caller.list();
		const persisted = must(list.find((x) => x.id === c.id));
		expect(persisted.name).toBe("New");
		expect(persisted.email).toBe("upd@t.com"); // unchanged field preserved
	});

	it("cross-user update fails and original data is untouched", async () => {
		const c = await caller.create({ name: "Mine", email: "cross-cust@t.com" });
		const other = callerAs("attacker");
		await expect(other.update({ id: c.id, name: "Hacked" })).rejects.toThrow();

		const list = await caller.list();
		const original = must(list.find((x) => x.id === c.id));
		expect(original.name).toBe("Mine");
	});
});

describe("customers.delete", () => {
	it("deletes a customer — no longer in list()", async () => {
		const c = await caller.create({ name: "Del", email: "del-cust@t.com" });
		const before = await caller.list();
		expect(before.some((x) => x.id === c.id)).toBe(true);

		await caller.delete({ id: c.id });

		const after = await caller.list();
		expect(after.some((x) => x.id === c.id)).toBe(false);
		expect(after.length).toBe(before.length - 1);
	});

	it("is idempotent — deleting same id twice does not error", async () => {
		const c = await caller.create({ name: "Del2", email: "del2-cust@t.com" });
		await caller.delete({ id: c.id });
		const result = await caller.delete({ id: c.id });
		expect(result.success).toBe(true);

		const list = await caller.list();
		expect(list.some((x) => x.id === c.id)).toBe(false);
	});
});

describe("customers — cuenta corriente (fiado)", () => {
	/** Cliente con una venta fiada ya cargada en su cuenta. */
	async function withBalance(name: string, email: string, total: number) {
		const customer = await caller.create({ name, email });
		const accountMethod = await createPaymentMethod(
			"user-1",
			`Cuenta-${email}`,
			true,
		);
		const product = await createProduct("user-1", {
			name: `Prod-${email}`,
			price: total,
			in_stock: 10,
		});
		await placeOrder("user-1", {
			customerId: customer.id,
			paymentMethodId: accountMethod.id,
			products: [{ product_id: product.id, quantity: 1 }],
		});
		return customer;
	}

	it("balances y account muestran el saldo cargado", async () => {
		const customer = await withBalance("Saldo Uno", "saldo@t.com", 1000);

		const balances = await caller.balances();
		expect(
			must(balances.find((b) => b.customer_id === customer.id)).balance,
		).toBe(1000);

		const account = await caller.account({ id: customer.id });
		expect(account.balance).toBe(1000);
		expect(account.movements.length).toBe(1);
		expect(must(account.movements[0]).type).toBe("charge");
	});

	it("pay baja el saldo y registra el ingreso en la misma operación", async () => {
		const customer = await withBalance("Paga Uno", "paga@t.com", 2000);
		const cash = await createPaymentMethod("user-1", "Efectivo-Pago", false);

		const account = await caller.pay({
			id: customer.id,
			amount: 1500,
			paymentMethodId: cash.id,
		});
		expect(account.balance).toBe(500);
		expect(account.movements.length).toBe(2);

		const payment = must(
			(await listTransactions("user-1")).find(
				(t) => t.description === "Pago a cuenta — Paga Uno",
			),
		);
		expect(payment.amount).toBe(1500);
		expect(payment.type).toBe("income");
		expect(payment.category).toBe("selling");
		expect(payment.status).toBe("completed");
	});

	it("acepta pagos parciales hasta saldar la cuenta", async () => {
		const customer = await withBalance("Parcial", "parcial@t.com", 1000);
		const cash = await createPaymentMethod("user-1", "Efectivo-Parcial", false);

		await caller.pay({
			id: customer.id,
			amount: 400,
			paymentMethodId: cash.id,
		});
		const afterFirst = await caller.account({ id: customer.id });
		expect(afterFirst.balance).toBe(600);

		await caller.pay({
			id: customer.id,
			amount: 600,
			paymentMethodId: cash.id,
		});
		const afterSecond = await caller.account({ id: customer.id });
		expect(afterSecond.balance).toBe(0);
	});

	it("rechaza un pago mayor al saldo", async () => {
		const customer = await withBalance("Excede", "excede@t.com", 1000);
		const cash = await createPaymentMethod("user-1", "Efectivo-Excede", false);
		await expect(
			caller.pay({ id: customer.id, amount: 1001, paymentMethodId: cash.id }),
		).rejects.toThrow(/no puede superar/);
		expect((await caller.account({ id: customer.id })).balance).toBe(1000);
	});

	it("rechaza pagar a un cliente sin saldo pendiente", async () => {
		const c = await caller.create({
			name: "Sin Saldo",
			email: "sinsaldo@t.com",
		});
		const cash = await createPaymentMethod("user-1", "Efectivo-Sin", false);
		await expect(
			caller.pay({ id: c.id, amount: 100, paymentMethodId: cash.id }),
		).rejects.toThrow(/no tiene saldo/);
	});

	it("aísla por usuario: no se ve ni se paga la cuenta ajena", async () => {
		const customer = await withBalance("Aislada", "aislada@t.com", 1000);
		const other = callerAs("otro-user");

		expect((await other.balances()).length).toBe(0);
		await expect(
			other.pay({ id: customer.id, amount: 100, paymentMethodId: 1 }),
		).rejects.toThrow();
	});
});
