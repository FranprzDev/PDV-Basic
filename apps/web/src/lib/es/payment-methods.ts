import type { DomainEvent, StoredEvent } from "@finopenpos/event-sourcing";
import { foldStream, foldStreams } from "@finopenpos/event-sourcing";
import { eventStore, STREAM } from "./store";

// ── Eventos ─────────────────────────────────────────────────────────────────
export interface PaymentMethodCreatedData {
	name: string;
	/** Si es un medio "a cuenta": la venta se fía al cliente en vez de cobrarse. */
	is_account?: boolean;
}

export interface PaymentMethodRenamedData {
	name: string;
	is_account?: boolean;
}

export type PaymentMethodEvent =
	| DomainEvent<"PaymentMethodCreated", PaymentMethodCreatedData>
	| DomainEvent<"PaymentMethodRenamed", PaymentMethodRenamedData>
	| DomainEvent<"PaymentMethodDeleted", Record<string, never>>;

// ── Estado ──────────────────────────────────────────────────────────────────
export interface PaymentMethod {
	id: number;
	name: string;
	is_account: boolean;
	created_at: Date;
}

export function paymentMethodReducer(
	state: PaymentMethod | undefined,
	event: StoredEvent<PaymentMethodEvent>,
): PaymentMethod | undefined {
	switch (event.type) {
		case "PaymentMethodCreated": {
			const d = event.data as PaymentMethodCreatedData;
			return {
				id: event.streamId,
				name: d.name,
				is_account: d.is_account ?? false,
				created_at: event.occurredAt,
			};
		}
		case "PaymentMethodRenamed": {
			const d = event.data as PaymentMethodRenamedData;
			return state
				? {
						...state,
						name: d.name,
						...(d.is_account !== undefined ? { is_account: d.is_account } : {}),
					}
				: state;
		}
		case "PaymentMethodDeleted":
			return undefined;
		default:
			return state;
	}
}

// ── Proyecciones (los métodos de pago son globales, sin alcance de usuario) ─
export async function listPaymentMethods(): Promise<PaymentMethod[]> {
	const events = await eventStore.readAll<PaymentMethodEvent>([
		STREAM.paymentMethod,
	]);
	return [...foldStreams(events, paymentMethodReducer).values()];
}

/** Busca un medio de pago por id, si existe. */
export async function findPaymentMethod(
	id: number,
): Promise<PaymentMethod | undefined> {
	const events = await eventStore.readStream<PaymentMethodEvent>(
		STREAM.paymentMethod,
		id,
	);
	return foldStream(events, paymentMethodReducer).state;
}

async function assertNameAvailable(
	name: string,
	exceptId?: number,
): Promise<void> {
	const all = await listPaymentMethods();
	for (const pm of all) {
		if (pm.name === name && pm.id !== exceptId) {
			throw Object.assign(
				new Error(`duplicate key: payment_methods name ${name}`),
				{
					code: "23505",
				},
			);
		}
	}
}

// ── Comandos ────────────────────────────────────────────────────────────────
export async function createPaymentMethod(
	userUid: string,
	name: string,
	is_account = false,
): Promise<PaymentMethod> {
	await assertNameAvailable(name);
	const id = await eventStore.nextStreamId(STREAM.paymentMethod);
	const [stored] = await eventStore.append<PaymentMethodEvent>({
		streamType: STREAM.paymentMethod,
		streamId: id,
		expectedVersion: 0,
		userUid,
		events: [{ type: "PaymentMethodCreated", data: { name, is_account } }],
	});
	const state = paymentMethodReducer(
		undefined,
		stored as StoredEvent<PaymentMethodEvent>,
	);
	if (!state) throw new Error("unreachable: create produced no state");
	return state;
}

export async function renamePaymentMethod(
	userUid: string,
	id: number,
	name: string,
	is_account?: boolean,
): Promise<PaymentMethod | undefined> {
	const events = await eventStore.readStream<PaymentMethodEvent>(
		STREAM.paymentMethod,
		id,
	);
	const { state, version } = foldStream(events, paymentMethodReducer);
	if (!state) return undefined;
	await assertNameAvailable(name, id);

	const [stored] = await eventStore.append<PaymentMethodEvent>({
		streamType: STREAM.paymentMethod,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "PaymentMethodRenamed", data: { name, is_account } }],
	});
	return paymentMethodReducer(state, stored as StoredEvent<PaymentMethodEvent>);
}

export async function deletePaymentMethod(
	userUid: string,
	id: number,
): Promise<void> {
	const events = await eventStore.readStream<PaymentMethodEvent>(
		STREAM.paymentMethod,
		id,
	);
	const { state, version } = foldStream(events, paymentMethodReducer);
	if (!state) return;

	await eventStore.append<PaymentMethodEvent>({
		streamType: STREAM.paymentMethod,
		streamId: id,
		expectedVersion: version,
		userUid,
		events: [{ type: "PaymentMethodDeleted", data: {} }],
	});
}
