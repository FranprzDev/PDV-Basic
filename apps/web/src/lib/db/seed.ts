import { faker } from "@faker-js/faker";
import { sql } from "drizzle-orm";
import {
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
 * Seed = importação de eventos históricos: os dados de demonstração entram
 * no sistema como fatos no event log (com occurredAt no passado), exatamente
 * como teriam entrado pelo uso normal.
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
	const paymentMethodIds: number[] = [];
	for (const name of [
		"Efectivo",
		"Tarjeta de débito",
		"Tarjeta de crédito",
		"Transferencia",
		"Mercado Pago",
	]) {
		const id = await eventStore.nextStreamId(STREAM.paymentMethod);
		await eventStore.append<PaymentMethodEvent>({
			streamType: STREAM.paymentMethod,
			streamId: id,
			expectedVersion: 0,
			userUid: userId,
			events: [{ type: "PaymentMethodCreated", data: { name } }],
		});
		paymentMethodIds.push(id);
	}

	// ── Customers ────────────────────────────────────────────────────────────
	const customerIds: number[] = [];
	for (let i = 0; i < 20; i++) {
		const id = await eventStore.nextStreamId(STREAM.customer);
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
						name: faker.person.fullName(),
						email: faker.internet.email().toLowerCase(),
						phone: faker.phone.number({ style: "national" }),
						status: faker.helpers.arrayElement([
							"active",
							"active",
							"active",
							"inactive",
						]),
					},
				},
			],
		});
		customerIds.push(id);
	}

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
		const pmId = faker.helpers.arrayElement(paymentMethodIds);
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
			{ value: "cancelled", weight: 0.5 },
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
							description: `Payment for order #${orderId}`,
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
		}
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
						payment_method_id: faker.helpers.arrayElement(paymentMethodIds),
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
		`Seeded (event log): 3 payment methods, 1 demo user (${DEMO_EMAIL} / ${DEMO_PASSWORD}), ` +
			`20 customers, ${seededProducts.length} products, ` +
			`${orderCount} orders, ${expenseCount} expense transactions`,
	);
}
