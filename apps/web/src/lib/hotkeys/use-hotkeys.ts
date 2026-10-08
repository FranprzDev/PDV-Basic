"use client";

import { useEffect, useState } from "react";
import {
	eventToBinding,
	type HotkeyAction,
	loadHotkeys,
	saveHotkeys,
} from "./hotkeys";

export type { HotkeyAction };
export { bindingLabel, DEFAULT_HOTKEYS, HOTKEY_ACTIONS } from "./hotkeys";

function isFormField(target: EventTarget | null): boolean {
	const el = target as HTMLElement | null;
	if (!el?.tagName) return false;
	return (
		el.tagName === "INPUT" ||
		el.tagName === "TEXTAREA" ||
		el.tagName === "SELECT" ||
		el.isContentEditable
	);
}

/**
 * Atajos del POS. Solo activo cuando el POS está montado.
 * Se ignoran dentro de campos de formulario, salvo Escape
 * (cerrar) que vale en todos lados.
 */
export function useHotkeys(
	handlers: Partial<Record<HotkeyAction, () => void>>,
) {
	const [, setConfigVersion] = useState(0);

	useEffect(() => {
		const onKeyDown = (event: KeyboardEvent) => {
			const binding = eventToBinding(event);
			const config = loadHotkeys(
				typeof localStorage !== "undefined" ? localStorage : undefined,
			);
			const entry = (Object.entries(config) as [HotkeyAction, string][]).find(
				([, b]) => b === binding,
			);
			if (!entry) return;
			const handler = handlers[entry[0]];
			if (!handler) return;
			// El escáner manda Enter con timing de máquina: lo gestiona
			// useBarcodeScanner, acá solo se evita tragar teclas tipeadas.
			if (isFormField(event.target) && entry[0] !== "cancel") return;
			event.preventDefault();
			handler();
		};
		document.addEventListener("keydown", onKeyDown);
		return () => document.removeEventListener("keydown", onKeyDown);
	});

	return {
		notifyConfigChanged: () => setConfigVersion((v) => v + 1),
		persist: (config: Record<HotkeyAction, string>) => {
			if (typeof localStorage !== "undefined")
				saveHotkeys(config, localStorage);
			setConfigVersion((v) => v + 1);
		},
	};
}
