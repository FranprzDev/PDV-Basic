import { describe, expect, it } from "bun:test";
import type { StoredEvent } from "@finopenpos/event-sourcing";
import {
	isBelowMinimum,
	type Product,
	type ProductCreatedData,
	type ProductEvent,
	productReducer,
	unitPriceFor,
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
		wholesale_price: null,
		wholesale_min_qty: null,
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

describe("productReducer — mayorista y stock", () => {
	it("guarda el precio mayorista y su mínimo cuando vienen", () => {
		const data: ProductCreatedData = {
			name: "Coca",
			price: 1500,
			in_stock: 12,
			wholesale_price: 1200,
			wholesale_min_qty: 6,
		};
		const state = productReducer(
			undefined,
			stored({ type: "ProductCreated", data }),
		);
		expect(state?.wholesale_price).toBe(1200);
		expect(state?.wholesale_min_qty).toBe(6);
	});

	it("sin mayorista configurado queda en null", () => {
		const data: ProductCreatedData = {
			name: "Suelta",
			price: 100,
			in_stock: 1,
		};
		const state = productReducer(
			undefined,
			stored({ type: "ProductCreated", data }),
		);
		expect(state?.wholesale_price).toBeNull();
		expect(state?.wholesale_min_qty).toBeNull();
	});

	it("StockRestocked devuelve las unidades a la venta", () => {
		const base = product({ in_stock: 4 });
		const restocked = productReducer(base, {
			...stored({ type: "StockRestocked", data: { quantity: 3 } }),
			version: 1,
		});
		expect(restocked?.in_stock).toBe(7);
	});
});

describe("unitPriceFor", () => {
	it("usa el precio común por debajo del mínimo mayorista", () => {
		const p = product({
			price: 1000,
			wholesale_price: 800,
			wholesale_min_qty: 6,
		});
		expect(unitPriceFor(p, 5)).toBe(1000);
	});

	it("usa el mayorista al alcanzar el mínimo", () => {
		const p = product({
			price: 1000,
			wholesale_price: 800,
			wholesale_min_qty: 6,
		});
		expect(unitPriceFor(p, 6)).toBe(800);
		expect(unitPriceFor(p, 10)).toBe(800);
	});

	it("sin mayorista configurado siempre usa el común", () => {
		const p = product({ price: 1000 });
		expect(unitPriceFor(p, 100)).toBe(1000);
	});

	it("si el mínimo es 0 o inválido no aplica el mayorista", () => {
		const p = product({
			price: 1000,
			wholesale_price: 800,
			wholesale_min_qty: 0,
		});
		expect(unitPriceFor(p, 50)).toBe(1000);
	});
});
