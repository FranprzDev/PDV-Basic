import { appendFile } from "node:fs/promises";
import { connect, type Socket } from "node:net";

/**
 * Transporte hacia la impresora.
 *
 * Las térmicas de red (Zebra, Epson, Bixolon, Godex) escuchan en TCP 9100 y
 * esperan bytes crudos: no hay protocolo, no hay handshake, se escribe y listo.
 * Eso las hacefelices de integrar y evita depender del driver del sistema.
 */

export interface PrinterTarget {
	/** IP o hostname de la impresora. */
	host: string;
	/** Puerto RAW, 9100 por defecto. */
	port: number;
	/** Si está definido, escribe a archivo en vez de imprimir. Para probar sin hardware. */
	file?: string;
	/** Timeout de conexión en ms. */
	timeoutMs?: number;
}

export class PrinterError extends Error {
	constructor(
		message: string,
		readonly code: "unreachable" | "timeout" | "io",
	) {
		super(message);
		this.name = "PrinterError";
	}
}

export async function sendToPrinter(
	target: PrinterTarget,
	bytes: Uint8Array,
): Promise<void> {
	if (target.file) {
		await appendFile(target.file, bytes);
		return;
	}

	await writeToSocket(target, bytes);
}

function writeToSocket(
	target: PrinterTarget,
	bytes: Uint8Array,
): Promise<void> {
	return new Promise((resolve, reject) => {
		const socket: Socket = connect({
			host: target.host,
			port: target.port,
			timeout: target.timeoutMs ?? 5000,
		});

		let settled = false;
		const finish = (error?: Error) => {
			if (settled) return;
			settled = true;
			socket.removeAllListeners();
			socket.destroy();
			if (error) reject(error);
			else resolve();
		};

		socket.on("timeout", () =>
			finish(
				new PrinterError(
					`No respondió la impresora en ${target.host}:${target.port}`,
					"timeout",
				),
			),
		);

		socket.on("error", (error: NodeJS.ErrnoException) => {
			const hint =
				error.code === "ECONNREFUSED"
					? " (¿está encendida y en la misma red?)"
					: "";
			finish(new PrinterError(`${error.message}${hint}`, "unreachable"));
		});

		// some printers reset the connection if you close too fast
		socket.on("connect", () => {
			socket.write(Buffer.from(bytes), () => {
				setTimeout(() => finish(), 120);
			});
		});
	});
}

/** Verifica que la impresora responda. No imprime nada. */
export async function checkPrinter(target: PrinterTarget): Promise<boolean> {
	if (target.file) return true;
	try {
		await writeToSocket(target, Uint8Array.from([]));
		return true;
	} catch {
		return false;
	}
}
