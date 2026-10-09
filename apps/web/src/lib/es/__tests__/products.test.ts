import { describe, expect, it } from "bun:test";
import type { StoredEvent } from "@finopenpos/event-sourcing";
import {
	isBelowMinimum,
	type Product,
	type ProductCreatedData,
	type ProductEvent,
	productReducer,
} from "@/lib/es/products";

function product(overrides: Partial<Product> = {}): Product {
	return {
		id: 1,
		name: "Test",
		description: null,
		price: 1000,
		in_stock: 10,
		min_stock: 0,
		category: null,
		barcode: null,
		user_uid: "u1",
		unit_of_measure: "UN",
		created_at: new Date(),
		...overrides,
	};
}

function stored(event: ProductEvent): StoredEvent<ProductEvent> {
	return {
		globalSeq: 1,
		streamType: "product",
		streamId: 7,
		userUid: "u1",
		occurredAt: new Date(),
		version: 0,
		...event,
	};
}

describe("productReducer", () => {
	it("min_stock por defecto es 0 si no viene", () => {
		const data: ProductCreatedData = {
			name: "Coca",
			price: 1500,
			in_stock: 12,
		};
		expect(
			productReducer(undefined, stored({ type: "ProductCreated", data }))
				?.min_stock,
		).toBe(0);
	});

	it("guarda min_stock cuando viene", () => {
		const data: ProductCreatedData = {
			name: "Coca",
			price: 1500,
			in_stock: 12,
			min_stock: 5,
		};
		expect(
			productReducer(undefined, stored({ type: "ProductCreated", data }))
				?.min_stock,
		).toBe(5);
	});
});

describe("isBelowMinimum", () => {
	it("en o por debajo del mínimo", () => {
		expect(isBelowMinimum(product({ in_stock: 2, min_stock: 5 }))).toBe(true);
		expect(isBelowMinimum(product({ in_stock: 5, min_stock: 5 }))).toBe(true);
	});

	it("sobre el mínimo no activa", () => {
		expect(isBelowMinimum(product({ in_stock: 6, min_stock: 5 }))).toBe(false);
	});

	it("sin mínimo configurado no activa nunca", () => {
		expect(isBelowMinimum(product({ in_stock: 0, min_stock: 0 }))).toBe(false);
	});
});
