/**
 * Codificador ESC/POS — protocolo de las impresoras térmicas de tickets.
 *
 * Las impresoras Zebra/Epson/Bixolon comparten este protocolo: son bytes de
 * control seguidos de texto. No requiere librerías.
 *
 * Referencia de uso de bytes:
 *   1B 40        reset
 *   1B 61 n      alineación (0=izq, 1=centro, 2=der)
 *   1B 45 n      negrita (1=on, 0=off)
 *   21 n n       doble alto / doble ancho
 *   1B 64 n      avanzar n líneas
 *   1B 4A n      abrir cajón de dinero (pulse)
 *   1D 56 00     cortar papel
 *   1C 50 n      página de códigos (858 = español con acentos)
 */

/** Tabla CP858 (Euro + español). Los lectores térmicos vienen en CP437, sin ñ/á/é. */
const CP858_HIGH: Record<string, number> = {
	"€": 0xd5,
	"‚": 0x82,
	"ƒ": 0x83,
	"„": 0x84,
	"…": 0x85,
	"†": 0x86,
	"‡": 0x87,
	"ˆ": 0x88,
	"‰": 0x89,
	"Š": 0x8a,
	"‹": 0x8b,
	"Œ": 0x8c,
	"Ž": 0x8e,
	"‘": 0x91,
	"’": 0x92,
	"“": 0x93,
	"”": 0x94,
	"•": 0x95,
	"–": 0x96,
	"—": 0x97,
	"˜": 0x98,
	"™": 0x99,
	"š": 0x9a,
	"›": 0x9b,
	"œ": 0x9c,
	"ž": 0x9e,
	"Ÿ": 0x9f,
};

export type Alignment = "left" | "center" | "right";

const ALIGN = { left: 0, center: 1, right: 2 } as const;

export class EscPosEncoder {
	private bytes: number[] = [];

	/** Emite un comando ESC/POS a partir de sus bytes. */
	command(...bytes: number[]): this {
		this.bytes.push(...bytes);
		return this;
	}

	init(): this {
		return this.command(0x1b, 0x40);
	}

	align(alignment: Alignment): this {
		return this.command(0x1b, 0x61, ALIGN[alignment]);
	}

	bold(on = true): this {
		return this.command(0x1b, 0x45, on ? 0x01 : 0x00);
	}

	/** Doble tamaño: líneas hasta 2× más altas, columnas hasta 2× más anchas. */
	doubleSize({ height = false, width = false } = {}): this {
		return this.command(
			0x1d,
			0x21,
			(height ? 0x01 : 0x00) | (width ? 0x10 : 0x00),
		);
	}

	underline(on = true): this {
		return this.command(0x1b, 0x2d, on ? 0x01 : 0x00);
	}

	feed(lines = 1): this {
		return this.command(0x1b, 0x64, lines);
	}

	/** Selecciona la página de códigos. 858 es la correcta para español. */
	codePage(page = 858): this {
		return this.command(0x1c, 0x50, page === 858 ? 0x00 : page);
	}

	openDrawer(pin = 0, pulseMs = 100): this {
		// 1B 70 <pin> <onTime: 2 bytes> <offTime: 2 bytes>, valores en unidades de 2ms
		const on = Math.round(pulseMs / 2);
		return this.command(0x1b, 0x70, pin, on & 0xff, (on >> 8) & 0xff, 0x00, 0x00);
	}

	cut(): this {
		return this.command(0x1d, 0x56, 0x00);
	}

	/** Convierte texto a bytes en la página de códigos activa. */
	text(value: string): this {
		for (const char of value) {
			const high = CP858_HIGH[char];
			if (high !== undefined) {
				this.bytes.push(high);
				continue;
			}
			const code = char.codePointAt(0) ?? 0x20;
			if (code < 0x80) {
				this.bytes.push(code);
			} else if (code <= 0xff) {
				this.bytes.push(code);
			} else {
				// Emoji o caracteres fuera de la tabla: se reemplaza por '?'
				this.bytes.push(0x3f);
			}
		}
		return this;
	}

	line(value = ""): this {
		return this.text(value).feed(1);
	}

	/** Separa dos columnas alineando a la derecha el precio, como un ticket real. */
	columns(left: string, right: string, width = 42): this {
		const cleanLeft = left.slice(0, width - right.length - 1);
		const padding = Math.max(1, width - cleanLeft.length - right.length);
		return this.text(`${cleanLeft}${" ".repeat(padding)}${right}`).feed(1);
	}

	rule(char = "-"): this {
		return this.text(char.repeat(widthOf(char))).feed(1);
	}

	toBytes(): Uint8Array {
		return new Uint8Array(this.bytes);
	}

	reset(): this {
		this.bytes = [];
		return this;
	}
}

function widthOf(char: string): number {
	return char.length === 1 ? 42 : char.length;
}