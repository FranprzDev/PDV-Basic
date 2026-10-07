"use client";

import { useCallback, useState } from "react";
import { toast } from "sonner";
import { useTranslations } from "next-intl";

import { buildTicket, buildTestTicket, type TicketData } from "./ticket";
import {
	LocalAgentPrinter,
	WebUsbPrinter,
	createPrinterDriver,
	type PrinterDriver,
} from "./drivers";

const STORAGE_KEY = "pdv:printer-driver";

export type PrinterPreference = PrinterDriver["id"];

/**
 * Puente entre el ticket y la impresora. La app nunca sabe por qué vía sale:
 * llama `print()` y el driver elegido se encarga.
 *
 * WebUSB exige una autorización del navegador por gesto del usuario, así que
 * guardar el dispositivo solo se puede hacer desde un click.
 */
export function useTicketPrinter() {
	const t = useTranslations("printer");
	const [driver, setDriver] = useState<PrinterDriver | null>(null);
	const [isPrinting, setIsPrinting] = useState(false);
	const [lastError, setLastError] = useState<string | null>(null);

	const getDriver = useCallback((): PrinterDriver => {
		const saved = localStorage.getItem(STORAGE_KEY) as PrinterPreference | null;
		return createPrinterDriver(saved ?? "localAgent");
	}, []);

	const remember = useCallback((preference: PrinterPreference) => {
		localStorage.setItem(STORAGE_KEY, preference);
		setDriver(createPrinterDriver(preference));
	}, []);

	/** Conecta una impresora USB. Solo callable desde un gesto del usuario. */
	const connectUsb = useCallback(async () => {
		const usb = new WebUsbPrinter();
		await usb.connect();
		remember("webusb");
		toast.success(t("connected"));
	}, [remember, t]);

	const isUsbConnected = useCallback(
		() => (driver as WebUsbPrinter | null) instanceof WebUsbPrinter,
		[driver],
	);

	const print = useCallback(
		async (ticket: TicketData) => {
			setIsPrinting(true);
			setLastError(null);
			const target = driver ?? getDriver();
			try {
				await target.print(buildTicket(ticket));
				toast.success(t("printSuccess"));
				return true;
			} catch (error) {
				const message = error instanceof Error ? error.message : String(error);
				setLastError(message);
				toast.error(t("printError"));
				return false;
			} finally {
				setIsPrinting(false);
			}
		},
		[driver, getDriver, t],
	);

	const testPrint = useCallback(
		async (businessName: string) => {
			setIsPrinting(true);
			const target = driver ?? getDriver();
			try {
				await target.print(buildTestTicket(businessName));
				toast.success(t("testPrintSent"));
			} catch (error) {
				setLastError(error instanceof Error ? error.message : String(error));
				toast.error(t("printError"));
			} finally {
				setIsPrinting(false);
			}
		},
		[driver, getDriver, t],
	);

	const openDrawer = useCallback(async () => {
		const target = driver ?? getDriver();
		try {
			await target.openDrawer();
		} catch (error) {
			setLastError(error instanceof Error ? error.message : String(error));
			toast.error(t("printError"));
		}
	}, [driver, getDriver, t]);

	const checkAgent = useCallback(async () => {
		const agent = new LocalAgentPrinter();
		return agent.health();
	}, []);

	return {
		print,
		testPrint,
		openDrawer,
		connectUsb,
		checkAgent,
		isUsbConnected,
		remember,
		isPrinting,
		lastError,
	};
}