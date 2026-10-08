/**
 * Atajos de teclado del POS: lógica pura (sin React) para poder testearla.
 *
 * Un binding es un string canónico: modificadores ordenados + tecla,
 * todo en minúsculas, unido con "+". La tecla "+" se escribe "plus"
 * y el espacio "space" para no ambiguar el separador.
 * Ejemplos: "f9", "f2", "ctrl+k", "shift+plus", "delete", "escape".
 */

export const HOTKEY_ACTIONS = [
	"focusSearch",
	"confirmSale",
	"qtyPlus",
	"qtyMinus",
	"removeLast",
	"cancel",
] as const;

export type HotkeyAction = (typeof HOTKEY_ACTIONS)[number];

export const DEFAULT_HOTKEYS: Record<HotkeyAction, string> = {
	focusSearch: "f2",
	confirmSale: "f9",
	qtyPlus: "plus",
	qtyMinus: "minus",
	removeLast: "delete",
	cancel: "escape",
};

/** Combinaciones que el navegador no deja interceptar de forma fiable. */
const RESERVED = new Set([
	"ctrl+w",
	"ctrl+t",
	"ctrl+n",
	"ctrl+tab",
	"f5",
	"f11",
	"f12",
]);

const STORAGE_KEY = "pdv:hotkeys";

export function normalizeKey(key: string): string {
	const k = key.toLowerCase();
	if (k === "+") return "plus";
	if (k === " ") return "space";
	if (k === "-") return "minus";
	return k;
}

export function eventToBinding(e: {
	key: string;
	ctrlKey: boolean;
	metaKey: boolean;
	altKey: boolean;
	shiftKey: boolean;
}): string {
	const parts: string[] = [];
	if (e.ctrlKey) parts.push("ctrl");
	if (e.metaKey) parts.push("meta");
	if (e.altKey) parts.push("alt");
	if (e.shiftKey) parts.push("shift");
	parts.push(normalizeKey(e.key));
	return parts.join("+");
}

export function isReserved(binding: string): boolean {
	return RESERVED.has(binding);
}

export interface HotkeyValidation {
	ok: boolean;
	/** Acción que ya usa ese binding, si hay choque. */
	conflictWith?: HotkeyAction;
	reserved?: boolean;
}

export function validateBinding(
	binding: string,
	action: HotkeyAction,
	config: Record<HotkeyAction, string>,
): HotkeyValidation {
	if (isReserved(binding)) return { ok: false, reserved: true };
	const conflict = (Object.keys(config) as HotkeyAction[]).find(
		(a) => a !== action && config[a] === binding,
	);
	if (conflict) return { ok: false, conflictWith: conflict };
	return { ok: true };
}

export function loadHotkeys(
	storage?: Pick<Storage, "getItem">,
): Record<HotkeyAction, string> {
	try {
		const raw = storage?.getItem(STORAGE_KEY);
		if (!raw) return { ...DEFAULT_HOTKEYS };
		const parsed = JSON.parse(raw) as Partial<Record<HotkeyAction, string>>;
		const merged = { ...DEFAULT_HOTKEYS };
		for (const action of HOTKEY_ACTIONS) {
			const value = parsed[action];
			if (typeof value === "string" && value.length > 0) {
				merged[action] = value;
			}
		}
		return merged;
	} catch {
		return { ...DEFAULT_HOTKEYS };
	}
}

export function saveHotkeys(
	config: Record<HotkeyAction, string>,
	storage?: Pick<Storage, "setItem">,
): void {
	storage?.setItem(STORAGE_KEY, JSON.stringify(config));
}

/** Etiqueta legible: "f9" → "F9", "ctrl+k" → "Ctrl+K". */
export function bindingLabel(binding: string): string {
	return binding
		.split("+")
		.map((part) => {
			if (part === "plus") return "+";
			if (part === "minus") return "-";
			if (part === "space") return "Espacio";
			return part.length <= 1
				? part.toUpperCase()
				: part.charAt(0).toUpperCase() + part.slice(1);
		})
		.join("+");
}
