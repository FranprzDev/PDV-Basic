"use client";

import { useEffect, useRef } from "react";

/**
 * Listener global para pistolitas de código de barras en modo teclado (USB HID).
 *
 * No requiere librerías: el escáner se comporta como un teclado, escribe el
 * código y manda Enter. Solo hay que distinguir sus pulsaciones de las de una
 * persona — un escáner tipea en menos de 10ms entre teclas, un humano en más de 150ms.
 */

const MIN_LENGTH = 6;
const MAX_MS_BETWEEN_KEYS = 50;

export interface ScannerOptions {
	/** Se llama cuando se detecta un código. */
	onScan: (code: string) => void;
	/** Desactiva el listener sin desmontar el componente. */
	enabled?: boolean;
	/** Excluye eventos originados dentro de inputs/textareas (por defecto true). */
	ignoreFormFields?: boolean;
}

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

export function useBarcodeScanner({
	onScan,
	enabled = true,
	ignoreFormFields = true,
}: ScannerOptions) {
	const buffer = useRef("");
	const lastKeyAt = useRef(0);
	const onScanRef = useRef(onScan);

	// Mantiene la referencia al vivo sin reiniciar el listener en cada render.
	useEffect(() => {
		onScanRef.current = onScan;
	}, [onScan]);

	useEffect(() => {
		if (!enabled) return;

		const handleKeyDown = (event: KeyboardEvent) => {
			if (event.ctrlKey || event.metaKey || event.altKey) return;
			if (ignoreFormFields && isFormField(event.target)) return;

			const now = Date.now();

			if (event.key === "Enter") {
				const code = buffer.current.trim();
				buffer.current = "";
				if (code.length >= MIN_LENGTH) onScanRef.current(code);
				return;
			}

			// Pausa larga entre teclas → no es un escáner, se descarta el buffer.
			if (now - lastKeyAt.current > MAX_MS_BETWEEN_KEYS) {
				buffer.current = "";
			}

			if (event.key.length === 1) buffer.current += event.key;
			lastKeyAt.current = now;
		};

		document.addEventListener("keydown", handleKeyDown);
		return () => document.removeEventListener("keydown", handleKeyDown);
	}, [enabled, ignoreFormFields]);
}

/** ¿El navegador expone WebUSB? Sirve para la impresora térmica directa. */
export function supportsWebUsb(): boolean {
	return typeof navigator !== "undefined" && "usb" in navigator;
}
