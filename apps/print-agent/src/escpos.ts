/**
 * Encoder ESC/POS en el agente.
 *
 * El navegador ya genera los bytes y los manda en base64. Acá solo hace falta
 * saber abrir el cajón de dinero, que es un comando suelto sin ticket.
 */

const ESC = 0x1b;

/** Pulso eléctrico en el pin del cajón (pin 2 en la mayoría de las impresoras). */
export const DRAWER_PULSE = Uint8Array.from([
	ESC,
	0x70,
	0x00,
	0x19,
	0xfa,
	0x00,
	0x00,
]);

export const RESET = Uint8Array.from([ESC, 0x40]);

export function decodeBase64(value: string): Uint8Array {
	const clean = value.replace(/^data:[^;]+;base64,/, "").trim();
	return new Uint8Array(Buffer.from(clean, "base64"));
}

export function toBase64(bytes: Uint8Array): string {
	return Buffer.from(bytes).toString("base64");
}
