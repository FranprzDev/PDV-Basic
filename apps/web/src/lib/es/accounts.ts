import type { DomainEvent, StoredEvent } from "@finopenpos/event-sourcing";
import { foldStream, foldStreams } from "@finopenpos/event-sourcing";
import { loadCustomer } from "./customers";
import { eventStore, STREAM } from "./store";
import type { TransactionEvent } from "./transactions";

// ── Eventos ─────────────────────────────────────────────────────────────────
/** Cargo a cuenta por una venta fiada. */
export interface AccountChargedData {
	order_id: number;
	amount: number;
}

/** Pago (parcial o total) que hace el cliente. */
export interface AccountPaidData {
	amount: number;
	payment_method_id?: number | null;
	note?: string;
}

/** Reverso del cargo de una venta anulada. */
export interface AccountChargeCancelledData {
	order_id: number;
	amount: number;
}

export type AccountEvent =
	| DomainEvent<"AccountCharged", AccountChargedData>
	| DomainEvent<"AccountPaid", AccountPaidData>
	| DomainEvent<"AccountChargeCancelled", AccountChargeCancelledData>;

// ── Estado ──────────────────────────────────────────────────────────────────
export type AccountMovementType = "charge" | "payment" | "cancellation";

export interface AccountMovement {
	/** Versión del evento dentro del stream: sirve de id estable. */
	id: number;
	type: AccountMovementType;
	/** Con signo: cargo +, pago −, anulación −. */
	amount: number;
	order_id: number | null;
	payment_method_id: number | null;
	note: string | null;
	date: Date;
}

export interface Account {
	customer_id: number;
	user_uid: string;
	/** Deuda actual: positivo = el cliente debe. */
	balance: number;
	movements: AccountMovement[];
}

function emptyAccount(customerId: number, userUid: string): Account {
	return {
		customer_id: customerId,
		user_uid: userUid,
		balance: 0,
		movements: [],
	};
}

export function accountReducer(
	state: Account | undefined,
	event: StoredEvent<AccountEvent>,
): Account | undefined {
	const base = state ?? emptyAccount(event.streamId, event.userUid);

	switch (event.type) {
		case "AccountCharged": {
			const d = event.data as AccountChargedData;
			return {
				...base,
				balance: base.balance + d.amount,
				movements: [
					...base.movements,
					{
						id: event.version,
						type: "charge",
						amount: d.amount,
						order_id: d.order_id,
						payment_method_id: null,
						note: null,
						date: event.occurredAt,
					},
				],
			};
		}
		case "AccountPaid": {
			const d = event.data as AccountPaidData;
			return {
				...base,
				balance: base.balance - d.amount,
				movements: [
					...base.movements,
					{
						id: event.version,
						type: "payment",
						amount: -d.amount,
						order_id: null,
						payment_method_id: d.payment_method_id ?? null,
						note: d.note ?? null,
						date: event.occurredAt,
					},
				],
			};
		}
		case "AccountChargeCancelled": {
			const d = event.data as AccountChargeCancelledData;
			return {
				...base,
				balance: base.balance - d.amount,
				movements: [
					...base.movements,
					{
						id: event.version,
						type: "cancellation",
						amount: -d.amount,
						order_id: d.order_id,
						payment_method_id: null,
						note: null,
						date: event.occurredAt,
					},
				],
			};
		}
		default:
			return state;
	}
}

// ── Proyecciones ────────────────────────────────────────────────────────────
export async function listAccounts(userUid: string): Promise<Account[]> {
	const events = await eventStore.readAll<AccountEvent>([STREAM.account], {
		userUid,
	});
	return [...foldStreams(events, accountReducer).values()];
}

/** Saldo por cliente (sólo los que tienen cuenta con movimientos). */
export async function accountBalances(
	userUid: string,
): Promise<Map<number, number>> {
	const accounts = await listAccounts(userUid);
	return new Map(accounts.map((a) => [a.customer_id, a.balance]));
}

export async function loadAccount(
	customerId: number,
): Promise<{ state: Account | undefined; version: number }> {
	const events = await eventStore.readStream<AccountEvent>(
		STREAM.account,
		customerId,
	);
	return foldStream(events, accountReducer);
}

/** Cuenta de un cliente, vacía si todavía no tiene movimientos. */
export async function getAccount(
	userUid: string,
	customerId: number,
): Promise<Account> {
	const { state } = await loadAccount(customerId);
	if (!state || state.user_uid !== userUid) {
		return emptyAccount(customerId, userUid);
	}
	return state;
}

/**
 * Cargo de una venta que quedó sin anular, si existe. Lo usa la anulación para
 * devolver el saldo (nunca se cobra dos veces ni se anula dos veces).
 */
export async function findAccountCharge(
	userUid: string,
	orderId: number,
): Promise<{ customer_id: number; amount: number } | undefined> {
	const events = await eventStore.readAll<AccountEvent>([STREAM.account], {
		userUid,
	});
	const cancelledOrders = new Set(
		events
			.filter((e) => e.type === "AccountChargeCancelled")
			.map((e) => (e.data as AccountChargeCancelledData).order_id),
	);
	if (cancelledOrders.has(orderId)) return undefined;

	const charge = events.find(
		(e) =>
			e.type === "AccountCharged" &&
			(e.data as AccountChargedData).order_id === orderId,
	);
	if (!charge) return undefined;
	return {
		customer_id: charge.streamId,
		amount: (charge.data as AccountChargedData).amount,
	};
}

// ── Comandos ────────────────────────────────────────────────────────────────
export type AccountErrorCode =
	| "customer_not_found"
	| "invalid_amount"
	| "overpayment";

/** Error de negocio de la cuenta corriente: el router lo traduce a tRPC. */
export class AccountError extends Error {
	constructor(
		readonly code: AccountErrorCode,
		message: string,
	) {
		super(message);
		this.name = "AccountError";
	}
}

export interface PayAccountInput {
	amount: number;
	paymentMethodId: number;
	note?: string;
}

/**
 * Registra un pago del cliente contra su saldo. El dinero entra recién ahora,
 * así que el pago sí genera una transacción de ingreso (categoría `selling`,
 * que es cuando se reconoce la venta cobrada) y, en el mismo append atómico,
 * baja el saldo.
 */
export async function payAccount(
	userUid: string,
	customerId: number,
	input: PayAccountInput,
): Promise<Account> {
	const { state: customer } = await loadCustomer(customerId);
	if (!customer || customer.user_uid !== userUid) {
		throw new AccountError("customer_not_found", "El cliente no existe.");
	}
	if (!Number.isInteger(input.amount) || input.amount <= 0) {
		throw new AccountError(
			"invalid_amount",
			"El importe del pago tiene que ser mayor a cero.",
		);
	}

	const { state, version } = await loadAccount(customerId);
	const balance = state?.user_uid === userUid ? state.balance : 0;
	if (balance <= 0) {
		throw new AccountError(
			"overpayment",
			"El cliente no tiene saldo pendiente.",
		);
	}
	if (input.amount > balance) {
		throw new AccountError(
			"overpayment",
			"El pago no puede superar el saldo pendiente.",
		);
	}

	const transactionId = await eventStore.nextStreamId(STREAM.transaction);

	const stored = await eventStore.appendMany<AccountEvent | TransactionEvent>(
		[
			{
				streamType: STREAM.account,
				streamId: customerId,
				expectedVersion: version,
				events: [
					{
						type: "AccountPaid",
						data: {
							amount: input.amount,
							payment_method_id: input.paymentMethodId,
							note: input.note,
						},
					},
				],
			},
			{
				streamType: STREAM.transaction,
				streamId: transactionId,
				expectedVersion: 0,
				events: [
					{
						type: "TransactionRecorded",
						data: {
							payment_method_id: input.paymentMethodId,
							amount: input.amount,
							status: "completed",
							category: "selling",
							type: "income",
							description: `Pago a cuenta — ${customer.name}`,
						},
					},
				],
			},
		],
		{ userUid },
	);

	const paid = stored.find((event) => event.streamType === STREAM.account);
	if (!paid) throw new Error("unreachable: payment event was not stored");
	const next = accountReducer(state, paid as StoredEvent<AccountEvent>);
	if (!next) throw new Error("unreachable: payment produced no state");
	return next;
}
