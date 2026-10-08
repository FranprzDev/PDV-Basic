import { describe, expect, it } from "bun:test";
import {
	type CountableTransaction,
	countDifference,
	expectedByMethod,
	isCountableDay,
	totalDifference,
} from "../cash-count";

const DAY = new Date("2026-03-10T15:00:00");

function tx(
	overrides: Partial<CountableTransaction> = {},
): CountableTransaction {
	return {
		payment_method_id: 1,
		amount: 1000,
		type: "income",
		status: "completed",
		created_at: new Date("2026-03-10T10:00:00"),
		...overrides,
	};
}

describe("isCountableDay", () => {
	it("cuenta ingreso completado del día", () => {
		expect(isCountableDay(tx(), DAY)).toBe(true);
	});

	it("excluye egresos, pendientes y otro día", () => {
		expect(isCountableDay(tx({ type: "expense" }), DAY)).toBe(false);
		expect(isCountableDay(tx({ status: "pending" }), DAY)).toBe(false);
		expect(
			isCountableDay(tx({ created_at: new Date("2026-03-09T10:00:00") }), DAY),
		).toBe(false);
		expect(isCountableDay(tx({ created_at: null }), DAY)).toBe(false);
	});
});

describe("expectedByMethod", () => {
	it("agrupa por medio de pago y suma", () => {
		const result = expectedByMethod(
			[
				tx({ payment_method_id: 1, amount: 1000 }),
				tx({ payment_method_id: 1, amount: 500 }),
				tx({ payment_method_id: 2, amount: 2000 }),
				tx({ payment_method_id: null, amount: 300 }),
				tx({ type: "expense", amount: 9999 }),
				tx({ status: "pending", amount: 9999 }),
			],
			DAY,
		);
		expect(result).toHaveLength(3);
		expect(result.find((r) => r.methodId === 1)?.expected).toBe(1500);
		expect(result.find((r) => r.methodId === 2)?.expected).toBe(2000);
		expect(result.find((r) => r.methodId === null)?.expected).toBe(300);
	});

	it("día vacío devuelve vacío", () => {
		expect(expectedByMethod([], DAY)).toEqual([]);
	});
});

describe("countDifference / totalDifference", () => {
	it("contado − esperado (negativo = faltante)", () => {
		expect(countDifference(950, 1000)).toBe(-50);
		expect(countDifference(1000, 1000)).toBe(0);
		expect(countDifference(1100, 1000)).toBe(100);
	});

	it("suma diferencias de todos los medios", () => {
		const expected = [
			{ methodId: 1, expected: 1000 },
			{ methodId: 2, expected: 2000 },
		];
		expect(totalDifference({ "1": 950, "2": 2000 }, expected)).toBe(-50);
		expect(totalDifference({}, expected)).toBe(-3000);
	});
});
