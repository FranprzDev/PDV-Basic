#!/usr/bin/env bun
import { startAgent } from "./server";

/**
 * CLI del agente local de impresión.
 *
 *   bun run start -- --host 192.168.1.50
 *   bun run start -- --file /tmp/ticket.bin      # sin impresora, para probar
 */

interface Options {
	host: string;
	port: number;
	agentPort: number;
	file?: string;
	timeoutMs: number;
}

const DEFAULTS = {
	printerPort: 9100,
	agentPort: 9110,
	timeoutMs: 5000,
};

function parseArgs(argv: string[]): Options {
	const opts: Options = {
		host: "",
		port: DEFAULTS.printerPort,
		agentPort: DEFAULTS.agentPort,
		timeoutMs: DEFAULTS.timeoutMs,
	};

	for (let i = 0; i < argv.length; i++) {
		const arg = argv[i];
		const next = () => {
			const value = argv[++i];
			if (value === undefined) {
				console.error(`Falta el valor de ${arg}`);
				process.exit(1);
			}
			return value;
		};

		switch (arg) {
			case "--host":
				opts.host = next();
				break;
			case "--port":
				opts.port = Number(next());
				break;
			case "--agent-port":
				opts.agentPort = Number(next());
				break;
			case "--file":
				opts.file = next();
				break;
			case "--timeout":
				opts.timeoutMs = Number(next());
				break;
			case "--help":
			case "-h":
				printHelp();
				process.exit(0);
		}
	}

	return opts;
}

function printHelp(): void {
	console.log(`
Agente local de impresión — PDV-Basic

Envía los tickets ESC/POS que genera el navegador a una impresora térmica
de red. Necesario porque el navegador no puede abrir sockets TCP.

Uso:
  bun run start -- --host <IP de la impresora> [opciones]

Opciones:
  --host <ip>          IP o hostname de la impresora (obligatorio salvo --file)
  --port <n>           Puerto RAW de la impresora (por defecto ${DEFAULTS.printerPort})
  --agent-port <n>     Puerto donde escucha el agente (por defecto ${DEFAULTS.agentPort})
  --file <ruta>        Escribe los bytes a un archivo en vez de imprimir.
                       Sirve para probar el ticket sin tener la impresora.
  --timeout <ms>       Timeout de conexión (por defecto ${DEFAULTS.timeoutMs})
  -h, --help           Esta ayuda

Ejemplos:
  bun run start -- --host 192.168.1.50
  bun run start -- --file /tmp/ticket.bin
`);
}

const opts = parseArgs(process.argv.slice(2));

if (!opts.host && !opts.file) {
	console.error("Falta --host (o usá --file para probar sin impresora).\n");
	printHelp();
	process.exit(1);
}

const server = startAgent(
	{ host: opts.host, port: opts.port, file: opts.file, timeoutMs: opts.timeoutMs },
	opts.agentPort,
);

const shutdown = () => {
	server.close(() => process.exit(0));
};
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);