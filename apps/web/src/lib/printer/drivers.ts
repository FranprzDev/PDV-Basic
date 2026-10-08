/**
 * Drivers de impresión.
 *
 * Tres formas de llegar a la impresora, misma interfaz `print(bytes)`:
 *
 *  1. webusb        → conexión directa por USB. Sin instalar nada. Solo Chrome/Edge
 *                      y requiere que el usuario autorice la primera vez.
 *  2. localAgent    → un servicio chico en la máquina del local (o en tu servidor)
 *                      que reenvía los bytes. Funciona con cualquier navegador y
 *                      con impresoras de RED, que es lo que se compra hoy.
 *  3. osPrint       → el diálogo de impresión del sistema, con @page de 58/80mm.
 *                      No corta papel ni abre el cajón. Es el plan B.
 */

import type { EscPosEncoder } from "./escpos-encoder";

export interface PrinterDriver {
	readonly id: "webusb" | "localAgent" | "osPrint";
	readonly label: string;
	isAvailable(): boolean;
	print(bytes: Uint8Array): Promise<void>;
	openDrawer(): Promise<void>;
}

// ── 1. WebUSB ────────────────────────────────────────────────────────────────

const ESC_POS_USB = 0x1b; // se filtra por clase:-Impresora

export class WebUsbPrinter implements PrinterDriver {
	readonly id = "webusb" as const;
	readonly label = "WebUSB (directo)";

	private device: USBDevice | null = null;

	isAvailable(): boolean {
		return typeof navigator !== "undefined" && "usb" in navigator;
	}

	async connect(): Promise<void> {
		if (!this.isAvailable()) {
			throw new Error("Este navegador no soporta WebUSB. Usá Chrome o Edge.");
		}
		this.device = await navigator.usb.requestDevice({
			filters: [{ classCode: ESC_POS_USB } as USBDeviceFilter],
		});
		if (!this.device.opened) await this.device.open();
		if (!this.device.configuration) await this.device.selectConfiguration(1);

		const config = this.device.configuration;
		if (!config) throw new Error("No se pudo configurar la impresora");

		// Libera cualquier interfaz que haya quedado tomada de una sesión previa.
		for (const iface of config.interfaces) {
			try {
				await this.device.releaseInterface(iface.interfaceNumber);
			} catch {
				// no estaba tomada: sigue
			}
		}
	}

	private async claimInterface(): Promise<number> {
		if (!this.device?.configuration) throw new Error("Impresora no conectada");
		for (const iface of this.device.configuration.interfaces) {
			try {
				await this.device.claimInterface(iface.interfaceNumber);
				return iface.interfaceNumber;
			} catch {
				// probamos con la siguiente
			}
		}
		throw new Error("No se pudo tomar control de la impresora");
	}

	private async write(bytes: Uint8Array): Promise<void> {
		const interfaceNumber = await this.claimInterface();
		const config = this.device?.configuration;
		if (!config) throw new Error("Impresora no conectada");

		const endpoint = config.interfaces
			.flatMap((iface: USBInterface) =>
				iface.alternates.flatMap((alt: USBAlternateInterface) => alt.endpoints),
			)
			.find((ep: USBEndpoint) => ep.direction === "out");

		if (!endpoint)
			throw new Error("La impresora no tiene endpoint de escritura");

		// Los offsets USB son de 1 byte: hay que partir en trozos de 255.
		const MAX = 255;
		for (let i = 0; i < bytes.length; i += MAX) {
			const d1 = this.device;
			if (!d1) throw new Error("Impresora no conectada");
			await d1.transferOut(
				endpoint.endpointNumber,
				bytes.slice(i, i + MAX) as BufferSource,
			);
		}
		const d2 = this.device;
		if (!d2) throw new Error("Impresora no conectada");
		await d2.releaseInterface(interfaceNumber);
	}

	async print(bytes: Uint8Array): Promise<void> {
		await this.write(bytes);
	}

	async openDrawer(): Promise<void> {
		await this.write(
			new Uint8Array([0x1b, 0x70, 0x00, 0x19, 0xfa, 0x00, 0x00]),
		);
	}

	disconnect(): void {
		this.device = null;
	}
}

// ── 2. Agente local ──────────────────────────────────────────────────────────

export interface LocalAgentOptions {
	/** Puerto por defecto del agente que corre en la máquina del local. */
	port?: number;
	/** URL base si el agente está en otro host (por ejemplo, una impresora de red). */
	baseUrl?: string;
}

export class LocalAgentPrinter implements PrinterDriver {
	readonly id = "localAgent" as const;
	readonly label = "Agente local (impresora de red)";

	private readonly baseUrl: string;

	constructor({ port: _port = 9110, baseUrl }: LocalAgentOptions = {}) {
		this.baseUrl = baseUrl ?? `http://localhost:${port}`;
	}

	isAvailable(): boolean {
		return typeof fetch !== "undefined";
	}

	private async post(path: string, body: unknown): Promise<Response> {
		const res = await fetch(`${this.baseUrl}${path}`, {
			method: "POST",
			headers: { "content-type": "application/json" },
			body: JSON.stringify(body),
		});
		if (!res.ok) {
			throw new Error(
				`El agente local respondió ${res.status}. ¿Está corriendo?`,
			);
		}
		return res;
	}

	async print(bytes: Uint8Array): Promise<void> {
		// base64 porque un Uint8Array no viaja bien en JSON
		let binary = "";
		for (const byte of bytes) binary += String.fromCharCode(byte);
		await this.post("/print", { data: btoa(binary) });
	}

	async openDrawer(): Promise<void> {
		await this.post("/drawer", {});
	}

	async health(): Promise<boolean> {
		try {
			const res = await fetch(`${this.baseUrl}/health`);
			return res.ok;
		} catch {
			return false;
		}
	}
}

// ── 3. Diálogo del sistema ──────────────────────────────────────────────────

export class OsPrint implements PrinterDriver {
	readonly id = "osPrint" as const;
	readonly label = "Impresión del sistema";

	isAvailable(): boolean {
		return typeof window !== "undefined";
	}

	async print(bytes: Uint8Array): Promise<void> {
		const ticket = new TextDecoder("cp858").decode(bytes);
		const frame = document.createElement("iframe");
		frame.style.position = "fixed";
		frame.style.right = "0";
		frame.style.bottom = "0";
		frame.style.width = "58mm";
		frame.style.height = "100%";
		frame.style.border = "0";
		frame.style.opacity = "0";
		frame.srcdoc = `<pre style="font:12px/1.3 monospace;margin:0;white-space:pre">${escapeHtml(
			ticket,
		)}</pre>`;
		document.body.appendChild(frame);
		await new Promise((resolve) => setTimeout(resolve, 120));
		frame.contentWindow?.print();
		frame.remove();
	}

	/** El diálogo del sistema no puede mandar un pulso al cajón. */
	async openDrawer(): Promise<void> {
		throw new Error(
			"La impresión del sistema no puede abrir el cajón de dinero",
		);
	}
}

function escapeHtml(value: string): string {
	return value
		.replace(/&/g, "&amp;")
		.replace(/</g, "&lt;")
		.replace(/>/g, "&gt;");
}

// ── Fábrica ──────────────────────────────────────────────────────────────────

export function createPrinterDriver(
	preference: PrinterDriver["id"],
): PrinterDriver {
	switch (preference) {
		case "webusb":
			return new WebUsbPrinter();
		case "localAgent":
			return new LocalAgentPrinter();
		default:
			return new OsPrint();
	}
}

export type { EscPosEncoder };
