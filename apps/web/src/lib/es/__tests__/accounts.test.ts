import { describe, expect, it } from "bun:test";
import type { StoredEvent } from "@finopenpos/event-sourcing";
import {
	type Account,
	type AccountEvent,
	accountReducer,
} from "@/lib/es/accounts";

function must<T>(value: T | undefined): T {
	if (value === undefined) throw new Error("expected value to be defined");
	return value;
}

function stored(event: AccountEvent, version = 0): StoredEvent<AccountEvent> {
	return {
		globalSeq: version + 1,
		streamType: "account",
		streamId: 3,
		userUid: "u1",
		occurredAt: new Date("2026-01-01T00:00:00Z"),
		version,
		...event,
	};
}

const charge = (orderId: number, amount: number, version = 0) =>
	stored(
		{ type: "AccountCharged", data: { order_id: orderId, amount } },
		version,
	);

describe("accountReducer", () => {
	it("un cargo a cuenta suma la deuda y arranca la cuenta", () => {
		const state = must(accountReducer(undefined, charge(10, 2500))) as Account;
		expect(state.customer_id).toBe(3);
		expect(state.balance).toBe(2500);
		expect(state.movements.length).toBe(1);
		expect(state.movements[0]).toMatchObject({
			type: "charge",
			amount: 2500,
			order_id: 10,
		});
	});

	it("un pago baja el saldo y el movimiento queda en negativo", () => {
		let state = accountReducer(undefined, charge(10, 2500));
		state = accountReducer(
			state,
			stored(
				{ type: "AccountPaid", data: { amount: 1000, payment_method_id: 2 } },
				1,
			),
		);
		const account = must(state);
		expect(account.balance).toBe(1500);
		expect(account.movements[1]).toMatchObject({
			type: "payment",
			amount: -1000,
			payment_method_id: 2,
		});
	});

	it("anular la venta fiada devuelve el saldo a cero", () => {
		let state = accountReducer(undefined, charge(10, 2500));
		state = accountReducer(
			state,
			stored(
				{
					type: "AccountChargeCancelled",
					data: { order_id: 10, amount: 2500 },
				},
				1,
			),
		);
		const account = must(state);
		expect(account.balance).toBe(0);
		expect(account.movements[1]).toMatchObject({
			type: "cancellation",
			amount: -2500,
			order_id: 10,
		});
	});

	it("acumula varios cargos y pagos parciales", () => {
		let state = accountReducer(undefined, charge(1, 1000));
		state = accountReducer(state, charge(2, 500, 1));
		state = accountReducer(
			state,
			stored({ type: "AccountPaid", data: { amount: 300 } }, 2),
		);
		const account = must(state);
		expect(account.balance).toBe(1200);
		expect(account.movements.length).toBe(3);
	});
});
