import { createServer, type IncomingMessage, type ServerResponse } from "node:http";
import { checkPrinter, PrinterError, sendToPrinter, type PrinterTarget } from "./printer";
import { decodeBase64, DRAWER_PULSE } from "./escpos";

/**
 * Servidor local que hace de puente entre el navegador y la impresora.
 *
 * Existe porque el navegador no puede abrir un socket TCP crudo: no hay forma
 * de escribir en el puerto 9100 desde JavaScript. El agente corre en la
 * máquina del local y sí puede.
 *
 * Rutas:
 *   GET  /health   → si el agente está vivo y si la impresora responde
 *   POST /print    → { data: <base64 ESC/POS> }
 *   POST /drawer   → abre el cajón de dinero
 */

const MAX_BODY_BYTES = 256 * 1024;

function corsHeaders(origin: string | undefined): Record<string, string> {
	// Solo origenes locales: el agente escucha en loopback, pero un sitio
	// cualquiera abierto en el navegador podría intentar hablarle.
	const allowed =
		origin && /^https?:\/\/(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(origin);

	return {
		...(allowed ? { "access-control-allow-origin": origin } : {}),
		"access-control-allow-methods": "GET, POST, OPTIONS",
		"access-control-allow-headers": "content-type",
		"access-control-max-age": "600",
	};
}

function json(res: ServerResponse, status: number, body: unknown): void {
	const payload = JSON.stringify(body);
	res.writeHead(status, {
		"content-type": "application/json; charset=utf-8",
		"content-length": Buffer.byteLength(payload),
	});
	res.end(payload);
}

async function readJson(req: IncomingMessage): Promise<unknown> {
	const chunks: Buffer[] = [];
	let size = 0;

	for await (const chunk of req) {
		size += (chunk as Buffer).length;
		if (size > MAX_BODY_BYTES) throw new Error("Cuerpo demasiado grande");
		chunks.push(chunk as Buffer);
	}

	const raw = Buffer.concat(chunks).toString("utf8");
	return raw ? JSON.parse(raw) : {};
}

export function startAgent(target: PrinterTarget, port: number) {
	const server = createServer(async (req, res) => {
		const cors = corsHeaders(req.headers.origin);
		Object.entries(cors).forEach(([k, v]) => res.setHeader(k, v));

		if (req.method === "OPTIONS") {
			res.writeHead(204);
			res.end();
			return;
		}

		const path = (req.url ?? "/").split("?")[0];

		try {
			if (req.method === "GET" && path === "/health") {
				const reachable = await checkPrinter(target);
				return json(res, 200, {
					ok: true,
					printer: reachable,
					target: target.file ? `archivo:${target.file}` : `${target.host}:${target.port}`,
				});
			}

			if (req.method === "POST" && path === "/print") {
				const body = (await readJson(req)) as { data?: string };
				if (!body?.data) {
					return json(res, 400, { ok: false, error: "Falta el campo data" });
				}

				const bytes = decodeBase64(body.data);
				if (bytes.length === 0) {
					return json(res, 400, { ok: false, error: "data vacío" });
				}

				await sendToPrinter(target, bytes);
				return json(res, 200, { ok: true, bytes: bytes.length });
			}

			if (req.method === "POST" && path === "/drawer") {
				await sendToPrinter(target, DRAWER_PULSE);
				return json(res, 200, { ok: true });
			}

			return json(res, 404, { ok: false, error: "Ruta desconocida" });
		} catch (error) {
			if (error instanceof PrinterError) {
				return json(res, 502, { ok: false, error: error.message });
			}
			const message = error instanceof Error ? error.message : String(error);
			return json(res, 500, { ok: false, error: message });
		}
	});

	server.listen(port, "127.0.0.1", () => {
		const destino = target.file
			? `archivo ${target.file}`
			: `${target.host}:${target.port}`;
		console.log(`[pdv-print-agent] escuchando en http://127.0.0.1:${port}`);
		console.log(`[pdv-print-agent] destino: ${destino}`);
		console.log("[pdv-print-agent] Ctrl+C para salir");
	});

	return server;
}