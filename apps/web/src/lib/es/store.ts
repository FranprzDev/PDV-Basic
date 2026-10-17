import { EventStore } from "@finopenpos/event-sourcing";
import * as dbModule from "@/lib/db";

/**
 * Event store de la aplicación, ligado a la misma instancia PGlite del resto
 * del app. La resolución de `pglite` ocurre en cada llamada para respetar
 * los mocks de módulo en los tests (cada archivo de test inyecta su instancia).
 */
export const eventStore = new EventStore({
	query: (sql, params) => dbModule.pglite.query(sql, params),
});

export const STREAM = {
	product: "product",
	customer: "customer",
	order: "order",
	transaction: "transaction",
	paymentMethod: "payment_method",
} as const;

export type StreamType = (typeof STREAM)[keyof typeof STREAM];
