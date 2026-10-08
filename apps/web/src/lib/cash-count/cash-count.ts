/**
 * Arqueo de caja: lógica pura (sin React) testeable.
 * Esperado = ingresos completados del día por medio de pago.
 * Diferencia = contado − esperado (negativa = faltante).
 */

export interface CountableTransaction {
	payment_method_id: number | null;
	amount: number;
	type: string | null;
	status: string | null;
	created_at: Date | string | null;
}

export interface MethodTotal {
	methodId: number | null;
	expected: number;
}

function sameDay(a: Date, b: Date): boolean {
	return (
		a.getFullYear() === b.getFullYear() &&
		a.getMonth() === b.getMonth() &&
		a.getDate() === b.getDate()
	);
}

export function isCountableDay(tx: CountableTransaction, day: Date): boolean {
	if (tx.type !== "income" || tx.status !== "completed") return false;
	if (!tx.created_at) return false;
	const date =
		tx.created_at instanceof Date ? tx.created_at : new Date(tx.created_at);
	return sameDay(date, day);
}

/** Suma por medio de pago (null = sin método) de los ingresos del día. */
export function expectedByMethod(
	transactions: CountableTransaction[],
	day: Date,
): MethodTotal[] {
	const totals = new Map<number | null, number>();
	for (const tx of transactions) {
		if (!isCountableDay(tx, day)) continue;
		totals.set(
			tx.payment_method_id,
			(totals.get(tx.payment_method_id) ?? 0) + tx.amount,
		);
	}
	return [...totals.entries()].map(([methodId, expected]) => ({
		methodId,
		expected,
	}));
}

export function countDifference(counted: number, expected: number): number {
	return counted - expected;
}

export function totalDifference(
	counts: Record<string, number>,
	expected: MethodTotal[],
): number {
	return expected.reduce(
		(sum, m) =>
			sum + countDifference(counts[String(m.methodId)] ?? 0, m.expected),
		0,
	);
}
