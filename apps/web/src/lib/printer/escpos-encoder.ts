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

/**
 * Tabla CP858 (Euro + español). Es CP850 con el euro agregado en 0xD5.
 *
 * Ojo: NO es igual a Latin-1. En Latin-1 la á es 0xE1; en CP858 la á es 0xA0.
 * Escribir el byte de Latin-1 produce otra letra en el papel. Por eso existe
 * esta tabla y no alcanza con pasar el codePoint.
 */
const CP858_HIGH: Record<string, number> = {
	// 0x80 - 0x8F
	"Ç": 0x80, "ü": 0x81, "é": 0x82, "â": 0x83, "ä": 0x84, "à": 0x85,
	"å": 0x86, "ç": 0x87, "ê": 0x88, "ë": 0x89, "è": 0x8a, "ï": 0x8b,
	"î": 0x8c, "ì": 0x8d, "Ä": 0x8e, "Å": 0x8f,
	// 0x90 - 0x9F
	"É": 0x90, "æ": 0x91, "Æ": 0x92, "ô": 0x93, "ö": 0x94, "ò": 0x95,
	"û": 0x96, "ù": 0x97, "ÿ": 0x98, "Ö": 0x99, "Ü": 0x9a, "ø": 0x9b,
	"£": 0x9c, "Ø": 0x9d, "×": 0x9e, "ƒ": 0x9f,
	// 0xA0 - 0xAF — los que importan en español
	"á": 0xa0, "í": 0xa1, "ó": 0xa2, "ú": 0xa3, "ñ": 0xa4, "Ñ": 0xa5,
	"ª": 0xa6, "º": 0xa7, "¿": 0xa8, "®": 0xa9, "¬": 0xaa,
	"½": 0xab, "¼": 0xac, "¡": 0xad, "«": 0xae, "»": 0xaf,
	// 0xD5 es el euro en CP858
	"€": 0xd5,
	// 0xF8 - 0xFB
	"°": 0xf8, "ß": 0xf9, "ã": 0xfa, "õ": 0xfb,
};

/** Mayúsculas acentuadas que CP858 no tiene: se les saca el acento. */
const STRIP_ACCENT: Record<string, string> = {
	"Á": "A", "É": "E", "Í": "I", "Ó": "O", "Ú": "U", "Ü": "U",
	"À": "A", "È": "E", "Ì": "I", "Ò": "O", "Ù": "U",
	"Â": "A", "Ê": "E", "Î": "I", "Ô": "O", "Û": "U",
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

	/** Convierte texto a bytes CP858. */
	text(value: string): this {
		for (const char of value) {
			const code = char.codePointAt(0) ?? 0x20;

			if (code < 0x80) {
				this.bytes.push(code);
				continue;
			}

			const mapped = CP858_HIGH[char];
			if (mapped !== undefined) {
				this.bytes.push(mapped);
				continue;
			}

			// CP858 no cubre mayúsculas acentuadas ni emoji: se degrada en vez
			// de escribir un byte que en el papel sería otra letra.
			const stripped = STRIP_ACCENT[char];
			if (stripped) {
				this.text(stripped);
				continue;
			}

			this.bytes.push(0x3f); // '?'
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