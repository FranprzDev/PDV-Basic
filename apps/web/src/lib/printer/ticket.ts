import { EscPosEncoder } from "./escpos-encoder";

export interface TicketItem {
	name: string;
	quantity: number;
	unitPrice: number;
}

export interface TicketData {
	businessName: string;
	businessAddress?: string;
	businessPhone?: string;
	receiptNumber: string;
	items: TicketItem[];
	paymentMethod: string;
	amountPaid?: number;
	customerName?: string;
	date: Date;
}

const WIDTH_80 = 42;
const WIDTH_58 = 32;

function money(value: number): string {
	return value.toLocaleString("es-AR", {
		minimumFractionDigits: 2,
		maximumFractionDigits: 2,
	});
}

function buildHeader(enc: EscPosEncoder, data: TicketData, width: number): void {
	enc.init().codePage(858).align("center").bold(true);
	enc.doubleSize({ height: true });
	enc.line(data.businessName);
	enc.doubleSize({ height: false, width: false }).bold(false);
	if (data.businessAddress) enc.line(data.businessAddress);
	if (data.businessPhone) enc.line(data.businessPhone);
	enc.align("left").line();
}

function buildMeta(enc: EscPosEncoder, data: TicketData, width: number): void {
	enc.columns("Fecha", data.date.toLocaleString("es-AR"), width);
	enc.columns("Ticket", `#${data.receiptNumber}`, width);
	if (data.customerName) {
		enc.columns("Cliente", data.customerName.slice(0, width - 4), width);
	}
	enc.line("-".repeat(width));
}

function buildItems(
	enc: EscPosEncoder,
	items: TicketItem[],
	width: number,
): number {
	let total = 0;
	enc.bold(true).columns("Producto", "Importe", width).bold(false);

	for (const item of items) {
		const subtotal = item.quantity * item.unitPrice;
		total += subtotal;
		enc.columns(item.name, money(subtotal), width);
		enc.text(`${item.quantity} x ${money(item.unitPrice)}`).feed(1);
	}
	return total;
}

function buildFooter(
	enc: EscPosEncoder,
	data: TicketData,
	total: number,
	width: number,
): void {
	enc.line("-".repeat(width));
	enc.bold(true).doubleSize({ height: true });
	enc.columns("TOTAL", money(total), width);
	enc.doubleSize({ height: false, width: false }).bold(false);

	enc.columns("Método", data.paymentMethod, width);

	if (typeof data.amountPaid === "number") {
		enc.columns("Recibido", money(data.amountPaid), width);
		const change = data.amountPaid - total;
		if (change > 0) enc.columns("Vuelto", money(change), width);
	}

	enc.line();
	enc.align("center").feed(1).line("¡Gracias por su compra!").feed(1);
	enc.align("left");
}

export function buildTicket(data: TicketData, paperWidth: 58 | 80 = 80) {
	const width = paperWidth === 58 ? WIDTH_58 : WIDTH_80;
	const enc = new EscPosEncoder();

	buildHeader(enc, data, width);
	buildMeta(enc, data, width);
	const total = buildItems(enc, data.items, width);
	buildFooter(enc, data, total, width);

	return enc.cut().toBytes();
}

export function buildTestTicket(
	businessName: string,
	paperWidth: 58 | 80 = 80,
): Uint8Array {
	const width = paperWidth === 58 ? WIDTH_58 : WIDTH_80;
	const enc = new EscPosEncoder();

	enc.init().codePage(858).align("center").bold(true);
	enc.doubleSize({ height: true }).line(businessName);
	enc.doubleSize({ height: false, width: false }).bold(false);
	enc.line();
	enc.line("Prueba de impresión");
	enc.line("Si leés esto con acentos");
	enc.line("(á é í ó ú ñ)");
	enc.line();
	enc.columns("Ancho de papel", `${paperWidth} mm`, width);
	enc.columns("Fecha", new Date().toLocaleString("es-AR"), width);
	enc.line();
	enc.align("left").feed(2).cut();

	return enc.toBytes();
}

/** Bytes para abrir el cajón de dinero, sin imprimir nada. */
export function buildDrawerPulse(): Uint8Array {
	return new EscPosEncoder().command(0x1b, 0x70, 0x00, 0x19, 0xfa, 0x00, 0x00)
		.toBytes();
}