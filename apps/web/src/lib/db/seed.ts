import { faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import {
	type AccountEvent,
	type CustomerEvent,
	eventStore,
	type OrderEvent,
	type PaymentMethodEvent,
	type ProductEvent,
	STREAM,
	type TransactionEvent,
} from "@/lib/es";
import { auth } from "../auth";
import { db } from ".";
import { catalogo } from "./catalogo-almacen";

const DEMO_EMAIL = "test@example.com";
const DEMO_PASSWORD = "test1234";
const DEMO_NAME = "Test User";

const EXPENSE_CATEGORIES = [
	"rent",
	"utilities",
	"supplies",
	"marketing",
	"maintenance",
] as const;

/**
 * Seed = importación de eventos históricos: los datos de demostración entran
 * al sistema como hechos en el event log (con `occurredAt` en el pasado),
 * exactamente como habrían entrado por el uso normal.
 */
export async function seed() {
	const existing = await db
		.select({ count: sql<number>`count(*)` })
		.from(sql`events`);

	if (Number(existing[0].count) > 0) return;

	// ── Demo User ────────────────────────────────────────────────────────────
	const signUpRes = await auth.api.signUpEmail({
		body: { name: DEMO_NAME, email: DEMO_EMAIL, password: DEMO_PASSWORD },
	});
	const userId = signUpRes.user.id;

	// ── Payment Methods ──────────────────────────────────────────────────────
	/** Medios que cobran en el acto (la cuenta corriente no entra acá). */
	const cashMethodIds: number[] = [];
	for (const method of [
		{ name: "Efectivo" },
		{ name: "Tarjeta de débito" },
		{ name: "Tarjeta de crédito" },
		{ name: "Transferencia" },
		{ name: "Mercado Pago" },
		{ name: "Cuenta corriente", is_account: true },
	]) {
		const id = await eventStore.nextStreamId(STREAM.paymentMethod);
		await eventStore.append<PaymentMethodEvent>({
			streamType: STREAM.paymentMethod,
			streamId: id,
			expectedVersion: 0,
			userUid: userId,
			events: [{ type: "PaymentMethodCreated", data: method }],
		});
		if (!method.is_account) cashMethodIds.push(id);
	}

	// ── Customers ────────────────────────────────────────────────────────────
	const customerIds: number[] = [];
	const customerNames = new Map<number, string>();
	for (let i = 0; i < 20; i++) {
		const id = await eventStore.nextStreamId(STREAM.customer);
		const name = faker.person.fullName();
		await eventStore.append<CustomerEvent>({
			streamType: STREAM.customer,
			streamId: id,
			expectedVersion: 0,
			userUid: userId,
			occurredAt: faker.date.recent({ days: 90 }),
			events: [
				{
					type: "CustomerCreated",
					data: {
						name,
						email: faker.internet.email().toLowerCase(),
						phone: faker.phone.number({ style: "national" }),
						status: faker.helpers.arrayElement([
							"active",
							"active",
							"active",
							"inactive",
						]),
						// La mitad tiene tope de fiado; el resto, sin tope.
						credit_limit: faker.helpers.maybe(
							() => faker.number.int({ min: 500000, max: 3000000 }),
							{ probability: 0.5 },
						),
					},
				},
			],
		});
		customerIds.push(id);
		customerNames.set(id, name);
	}
	/** Saldo y versión del stream de cuenta por cliente (para el seed). */
	const accountBalances = new Map<number, number>();
	const accountVersions = new Map<number, number>();

	// ── Products ─────────────────────────────────────────────────────────────
	const seededProducts: { id: number; price: number }[] = [];
	for (const item of catalogo()) {
		const id = await eventStore.nextStreamId(STREAM.product);
		await eventStore.append<ProductEvent>({
			streamType: STREAM.product,
			streamId: id,
			expectedVersion: 0,
			userUid: userId,
			events: [
				{
					type: "ProductCreated",
					data: {
						name: item.nombre,
						description: "",
						price: item.precio,
						in_stock: item.stock,
						barcode: item.barcode,
						category: item.categoria,
						unit_of_measure: item.unidad,
					},
				},
			],
		});
		seededProducts.push({ id, price: item.precio });
	}

	// ── Orders + Selling Transactions ────────────────────────────────────────
	const orderCount = 40;
	for (let i = 0; i < orderCount; i++) {
		const customerId = faker.helpers.arrayElement(customerIds);
		const pmId = faker.helpers.arrayElement(cashMethodIds);
		const itemCount = faker.number.int({ min: 1, max: 5 });
		const chosenProducts = faker.helpers.arrayElements(
			seededProducts,
			itemCount,
		);

		const items = chosenProducts.map((p) => ({
			product_id: p.id,
			quantity: faker.number.int({ min: 1, max: 4 }),
			price: p.price,
		}));

		const totalAmount = items.reduce(
			(sum, item) => sum + item.price * item.quantity,
			0,
		);

		const createdAt = faker.date.recent({ days: 60 });
		const status = faker.helpers.weightedArrayElement([
			{ value: "completed", weight: 8 },
			{ value: "pending", weight: 1.5 },
		]);

		const orderId = await eventStore.nextStreamId(STREAM.order);
		await eventStore.append<OrderEvent>({
			streamType: STREAM.order,
			streamId: orderId,
			expectedVersion: 0,
			userUid: userId,
			occurredAt: createdAt,
			events: [
				{
					type: "OrderPlaced",
					data: {
						customer_id: customerId,
						total_amount: totalAmount,
						status,
						items,
					},
				},
			],
		});

		if (status === "completed") {
			const txId = await eventStore.nextStreamId(STREAM.transaction);
			await eventStore.append<TransactionEvent>({
				streamType: STREAM.transaction,
				streamId: txId,
				expectedVersion: 0,
				userUid: userId,
				occurredAt: createdAt,
				events: [
					{
						type: "TransactionRecorded",
						data: {
							description: `Venta #${orderId}`,
							order_id: orderId,
							payment_method_id: pmId,
							amount: totalAmount,
							type: "income",
							category: "selling",
							status: "completed",
						},
					},
				],
			});
		} else {
			// Venta fiada (pending): queda como saldo en la cuenta del cliente.
			const version = accountVersions.get(customerId) ?? 0;
			await eventStore.append<AccountEvent>({
				streamType: STREAM.account,
				streamId: customerId,
				expectedVersion: version,
				userUid: userId,
				occurredAt: createdAt,
				events: [
					{
						type: "AccountCharged",
						data: { order_id: orderId, amount: totalAmount },
					},
				],
			});
			accountVersions.set(customerId, version + 1);
			accountBalances.set(
				customerId,
				(accountBalances.get(customerId) ?? 0) + totalAmount,
			);
		}
	}

	// ── Account payments (cobros de fiado) ───────────────────────────────────
	const indebted = [...accountBalances.entries()].filter(
		([, balance]) => balance > 0,
	);
	let accountPayments = 0;
	for (const [customerId, balance] of indebted.slice(0, 6)) {
		const amount =
			accountPayments % 2 === 0
				? balance // pago total
				: Math.max(1, Math.floor(balance * 0.4)); // pago parcial
		if (amount <= 0) continue;

		const paidAt = faker.date.recent({ days: 15 });
		const version = accountVersions.get(customerId) ?? 0;
		await eventStore.append<AccountEvent>({
			streamType: STREAM.account,
			streamId: customerId,
			expectedVersion: version,
			userUid: userId,
			occurredAt: paidAt,
			events: [{ type: "AccountPaid", data: { amount } }],
		});
		accountVersions.set(customerId, version + 1);

		const txId = await eventStore.nextStreamId(STREAM.transaction);
		await eventStore.append<TransactionEvent>({
			streamType: STREAM.transaction,
			streamId: txId,
			expectedVersion: 0,
			userUid: userId,
			occurredAt: paidAt,
			events: [
				{
					type: "TransactionRecorded",
					data: {
						description: `Pago a cuenta — ${customerNames.get(customerId) ?? "cliente"}`,
						payment_method_id: faker.helpers.arrayElement(cashMethodIds),
						amount,
						type: "income",
						category: "selling",
						status: "completed",
					},
				},
			],
		});
		accountPayments += 1;
	}

	// ── Expense Transactions ─────────────────────────────────────────────────
	const expenseCount = 25;
	for (let i = 0; i < expenseCount; i++) {
		const category = faker.helpers.arrayElement(EXPENSE_CATEGORIES);
		const descriptions: Record<string, () => string> = {
			rent: () => `Monthly rent — ${faker.date.month()}`,
			utilities: () =>
				`${faker.helpers.arrayElement(["Electricity", "Water", "Internet"])} bill`,
			supplies: () =>
				`${faker.helpers.arrayElement(["Office supplies", "Packaging materials", "Cleaning products"])}`,
			marketing: () =>
				`${faker.helpers.arrayElement(["Google Ads", "Facebook campaign", "Flyers printing", "Influencer collab"])}`,
			maintenance: () =>
				`${faker.helpers.arrayElement(["AC repair", "Store painting", "Equipment servicing", "Plumbing fix"])}`,
		};

		const txId = await eventStore.nextStreamId(STREAM.transaction);
		await eventStore.append<TransactionEvent>({
			streamType: STREAM.transaction,
			streamId: txId,
			expectedVersion: 0,
			userUid: userId,
			occurredAt: faker.date.recent({ days: 60 }),
			events: [
				{
					type: "TransactionRecorded",
					data: {
						description: descriptions[category](),
						payment_method_id: faker.helpers.arrayElement(cashMethodIds),
						amount: faker.number.int({ min: 2000, max: 150000 }),
						type: "expense",
						category,
						status: faker.helpers.weightedArrayElement([
							{ value: "completed", weight: 9 },
							{ value: "pending", weight: 1 },
						]),
					},
				},
			],
		});
	}

	console.log(
		`Seeded (event log): 6 payment methods, 1 demo user (${DEMO_EMAIL} / ${DEMO_PASSWORD}), ` +
			`20 customers, ${seededProducts.length} products, ` +
			`${orderCount} orders (con ventas fiadas), ${accountPayments} pagos a cuenta, ` +
			`${expenseCount} expense transactions`,
	);
}
