import { describe, expect, it } from "bun:test";
import {
	bindingLabel,
	DEFAULT_HOTKEYS,
	eventToBinding,
	HOTKEY_ACTIONS,
	isReserved,
	loadHotkeys,
	saveHotkeys,
	validateBinding,
} from "../hotkeys";

function keyEvent(
	key: string,
	modifiers?: Partial<{
		ctrlKey: boolean;
		metaKey: boolean;
		altKey: boolean;
		shiftKey: boolean;
	}>,
) {
	return {
		key,
		ctrlKey: modifiers?.ctrlKey ?? false,
		metaKey: modifiers?.metaKey ?? false,
		altKey: modifiers?.altKey ?? false,
		shiftKey: modifiers?.shiftKey ?? false,
	};
}

function memoryStorage(initial?: Record<string, string>) {
	const store: Record<string, string> = { ...(initial ?? {}) };
	return {
		getItem: (k: string) => (k in store ? store[k] : null),
		setItem: (k: string, v: string) => {
			store[k] = v;
		},
		dump: () => ({ ...store }),
	};
}

describe("eventToBinding", () => {
	it("canoniza teclas de función en minúsculas", () => {
		expect(eventToBinding(keyEvent("F9"))).toBe("f9");
		expect(eventToBinding(keyEvent("F2"))).toBe("f2");
		expect(eventToBinding(keyEvent("Escape"))).toBe("escape");
		expect(eventToBinding(keyEvent("Delete"))).toBe("delete");
	});

	it("representa + y - sin ambiguar el separador", () => {
		expect(eventToBinding(keyEvent("+"))).toBe("plus");
		expect(eventToBinding(keyEvent("-"))).toBe("minus");
	});

	it("ordena modificadores: ctrl+meta+alt+shift", () => {
		expect(
			eventToBinding(
				keyEvent("k", { shiftKey: true, ctrlKey: true, altKey: true }),
			),
		).toBe("ctrl+alt+shift+k");
	});
});

describe("isReserved", () => {
	it("bloquea combinaciones del navegador", () => {
		expect(isReserved("ctrl+w")).toBe(true);
		expect(isReserved("ctrl+t")).toBe(true);
		expect(isReserved("f5")).toBe(true);
	});

	it("permite las de venta", () => {
		expect(isReserved("f9")).toBe(false);
		expect(isReserved("f2")).toBe(false);
		expect(isReserved("plus")).toBe(false);
	});
});

describe("validateBinding", () => {
	it("acepta un binding libre", () => {
		expect(validateBinding("f4", "cancel", DEFAULT_HOTKEYS).ok).toBe(true);
	});

	it("detecta choque con otra acción", () => {
		const result = validateBinding("f9", "cancel", DEFAULT_HOTKEYS);
		expect(result.ok).toBe(false);
		expect(result.conflictWith).toBe("confirmSale");
	});

	it("no choca consigo misma al reasignar igual", () => {
		expect(validateBinding("f9", "confirmSale", DEFAULT_HOTKEYS).ok).toBe(true);
	});

	it("rechaza reservadas", () => {
		const result = validateBinding("ctrl+w", "cancel", DEFAULT_HOTKEYS);
		expect(result.ok).toBe(false);
		expect(result.reserved).toBe(true);
	});
});

describe("loadHotkeys / saveHotkeys", () => {
	it("devuelve defaults sin storage", () => {
		expect(loadHotkeys()).toEqual(DEFAULT_HOTKEYS);
	});

	it("devuelve defaults con storage vacío", () => {
		expect(loadHotkeys(memoryStorage())).toEqual(DEFAULT_HOTKEYS);
	});

	it("persiste y recarga configuración", () => {
		const storage = memoryStorage();
		const custom = { ...DEFAULT_HOTKEYS, confirmSale: "f4" };
		saveHotkeys(custom, storage);
		expect(loadHotkeys(storage)).toEqual(custom);
	});

	it("ignora JSON corrupto", () => {
		const storage = memoryStorage({ "pdv:hotkeys": "{roto" });
		expect(loadHotkeys(storage)).toEqual(DEFAULT_HOTKEYS);
	});

	it("ignora valores no string y completa faltantes", () => {
		const storage = memoryStorage({
			"pdv:hotkeys": JSON.stringify({ confirmSale: 42, focusSearch: "f4" }),
		});
		const loaded = loadHotkeys(storage);
		expect(loaded.confirmSale).toBe(DEFAULT_HOTKEYS.confirmSale);
		expect(loaded.focusSearch).toBe("f4");
		expect(Object.keys(loaded).sort()).toEqual([...HOTKEY_ACTIONS].sort());
	});
});

describe("bindingLabel", () => {
	it("etiqueta legible", () => {
		expect(bindingLabel("f9")).toBe("F9");
		expect(bindingLabel("ctrl+k")).toBe("Ctrl+K");
		expect(bindingLabel("plus")).toBe("+");
		expect(bindingLabel("shift+plus")).toBe("Shift++");
	});
});
