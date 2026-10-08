import { PGlite } from "@electric-sql/pglite";
import { EVENTS_TABLE_DDL } from "@finopenpos/event-sourcing";
import { drizzle } from "drizzle-orm/pglite";
import * as schema from "@/lib/db/schema";

// Los dominios operativos (products/customers/orders/transactions/payment
// methods) viven en el event store — tabla `events`, creada vía EVENTS_TABLE_DDL.
export const SCHEMA_DDL = EVENTS_TABLE_DDL;

export function createTestDb() {
	const pg = new PGlite();
	const db = drizzle({ client: pg, schema });
	return { pg, db };
}

export function must<T>(
	value: T | undefined | null,
	message = "expected value to be defined",
): T {
	if (value === undefined || value === null) throw new Error(message);
	return value;
}

export function makeUser(id: string) {
	return {
		id,
		name: "Test",
		email: `${id}@test.com`,
		emailVerified: false,
		image: null,
		createdAt: new Date(),
		updatedAt: new Date(),
	};
}
