import {
	type AppendInput,
	ConcurrencyError,
	type DomainEvent,
	type ReadOptions,
	type StoredEvent,
	type StreamAppend,
} from "./types";

/**
 * Interfaz mínima de ejecución SQL — la satisface PGlite
 * (y cualquier driver con `query(sql, params)`).
 */
export interface Querier {
	query<T>(query: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

interface EventRow {
	global_seq: number;
	stream_type: string;
	stream_id: number;
	version: number;
	event_type: string;
	payload: string;
	user_uid: string;
	occurred_at: string | Date;
}

function rowToEvent(row: EventRow): StoredEvent {
	return {
		globalSeq: row.global_seq,
		streamType: row.stream_type,
		streamId: row.stream_id,
		version: row.version,
		type: row.event_type,
		data: JSON.parse(row.payload),
		userUid: row.user_uid,
		occurredAt:
			row.occurred_at instanceof Date
				? row.occurred_at
				: new Date(row.occurred_at),
	};
}

export const EVENTS_TABLE_DDL = `
CREATE TABLE IF NOT EXISTS events (
  global_seq serial PRIMARY KEY,
  stream_type varchar(32) NOT NULL,
  stream_id integer NOT NULL,
  version integer NOT NULL,
  event_type varchar(64) NOT NULL,
  payload text NOT NULL,
  user_uid varchar(255) NOT NULL,
  occurred_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (stream_type, stream_id, version)
);
CREATE INDEX IF NOT EXISTS events_user_read_idx
  ON events (user_uid, stream_type, global_seq);
CREATE INDEX IF NOT EXISTS events_stream_idx
  ON events (stream_type, global_seq);
`;

/**
 * Event store append-only sobre Postgres/PGlite.
 *
 * Decisiones de diseño (ver bench/store-bench.ts y docs/adr):
 *  - payload como `text` (JSON serializado): el fold ocurre siempre en JS,
 *    así que jsonb solo agregaría costo de parse — text rinde ~1.7x en el replay.
 *  - append multi-row en un único INSERT: ~8x más rápido que inserts unitarios.
 *  - concurrencia optimista vía UNIQUE (stream_type, stream_id, version).
 */
export interface EventStoreOptions {
	/**
	 * Observer llamado después de cada append exitoso (ej.: dispatcher de
	 * addons). Los errores del observer NO se propagan al comando — el hecho ya
	 * fue persistido; los efectos colaterales son responsabilidad del observer.
	 */
	onAppended?: (events: StoredEvent[]) => void | Promise<void>;
}

export class EventStore {
	constructor(
		private readonly sql: Querier,
		private readonly options: EventStoreOptions = {},
	) {}

	/** Crea la tabla/índices si no existen (útil en tests y bootstrap). */
	async ensureSchema(): Promise<void> {
		for (const stmt of EVENTS_TABLE_DDL.split(";")) {
			if (stmt.trim()) await this.sql.query(stmt);
		}
	}

	/**
	 * Asigna el próximo id de stream para un tipo de agregado.
	 * PGlite es single-writer (los comandos se serializan en la misma conexión); en una
	 * carrera improbable, el UNIQUE del append rechaza y el comando se repite.
	 */
	async nextStreamId(streamType: string): Promise<number> {
		const res = await this.sql.query<{ next: number }>(
			"SELECT COALESCE(MAX(stream_id), 0) + 1 AS next FROM events WHERE stream_type = $1",
			[streamType],
		);
		return Number(res.rows[0]?.next ?? 1);
	}

	/** Graba eventos de un único stream (atajo para `appendMany`). */
	async append<TEvent extends DomainEvent>(
		input: AppendInput<TEvent>,
	): Promise<StoredEvent<TEvent>[]> {
		return this.appendMany<TEvent>(
			[
				{
					streamType: input.streamType,
					streamId: input.streamId,
					expectedVersion: input.expectedVersion,
					events: input.events,
				},
			],
			{ userUid: input.userUid, occurredAt: input.occurredAt },
		);
	}

	/**
	 * Graba eventos de uno o más streams en un único INSERT — todo se graba o
	 * nada se graba. Es lo que permite tratar un comando que toca varios agregados
	 * (ej.: venta = pedido + baja de stock + pago) como un solo hecho.
	 *
	 * Cada stream declara su versión esperada: si cualquiera de ellos hubiera
	 * cambiado en el medio tiempo, el UNIQUE (stream_type, stream_id, version) rechaza
	 * el INSERT entero y lanzamos `ConcurrencyError`.
	 */
	async appendMany<TEvent extends DomainEvent>(
		streams: StreamAppend<TEvent>[],
		meta: { userUid: string; occurredAt?: Date },
	): Promise<StoredEvent<TEvent>[]> {
		const rows: {
			streamType: string;
			streamId: number;
			version: number;
			event: TEvent;
		}[] = [];
		for (const stream of streams) {
			stream.events.forEach((event, i) => {
				rows.push({
					streamType: stream.streamType,
					streamId: stream.streamId,
					version: stream.expectedVersion + i + 1,
					event,
				});
			});
		}
		if (rows.length === 0) return [];

		const values: string[] = [];
		const params: unknown[] = [];
		for (const row of rows) {
			const base = params.length;
			const cols = [
				`$${base + 1}`,
				`$${base + 2}`,
				`$${base + 3}`,
				`$${base + 4}`,
				`$${base + 5}`,
				`$${base + 6}`,
			];
			if (meta.occurredAt) cols.push(`$${base + 7}`);
			values.push(`(${cols.join(", ")})`);
			params.push(
				row.streamType,
				row.streamId,
				row.version,
				row.event.type,
				JSON.stringify(row.event.data),
				meta.userUid,
			);
			if (meta.occurredAt) params.push(meta.occurredAt.toISOString());
		}

		const columns = meta.occurredAt
			? "(stream_type, stream_id, version, event_type, payload, user_uid, occurred_at)"
			: "(stream_type, stream_id, version, event_type, payload, user_uid)";

		try {
			const res = await this.sql.query<EventRow>(
				`INSERT INTO events ${columns} VALUES ${values.join(", ")} RETURNING *`,
				params,
			);
			const stored = res.rows.map(rowToEvent) as StoredEvent<TEvent>[];
			if (this.options.onAppended) {
				try {
					await this.options.onAppended(stored);
				} catch {
					// el hecho ya fue persistido; una falla del observer no deshace el comando
				}
			}
			return stored;
		} catch (err) {
			if (isUniqueViolation(err)) {
				// Postgres no informa qué stream colisionó: reportamos el
				// primero del comando. La colisión es rara (PGlite es single-writer)
				// y el llamador reejecuta el comando entero de todos modos.
				const first = streams.find((s) => s.events.length > 0);
				if (first) {
					throw new ConcurrencyError(
						first.streamType,
						first.streamId,
						first.expectedVersion,
					);
				}
			}
			throw err;
		}
	}

	/** Lee un stream específico, en orden de versión. */
	async readStream<TEvent extends DomainEvent>(
		streamType: string,
		streamId: number,
	): Promise<StoredEvent<TEvent>[]> {
		const res = await this.sql.query<EventRow>(
			"SELECT * FROM events WHERE stream_type = $1 AND stream_id = $2 ORDER BY version",
			[streamType, streamId],
		);
		return res.rows.map(rowToEvent) as StoredEvent<TEvent>[];
	}

	/**
	 * Lee todos los eventos de uno o más tipos de stream en orden global —
	 * insumo para reconstruir read models desde cero en cada lectura.
	 */
	async readAll<TEvent extends DomainEvent>(
		streamTypes: string[],
		opts: ReadOptions = {},
	): Promise<StoredEvent<TEvent>[]> {
		const conds: string[] = [];
		const params: unknown[] = [];

		params.push(streamTypes);
		conds.push(`stream_type = ANY($${params.length})`);

		if (opts.userUid !== undefined) {
			params.push(opts.userUid);
			conds.push(`user_uid = $${params.length}`);
		}
		if (opts.toGlobalSeq !== undefined) {
			params.push(opts.toGlobalSeq);
			conds.push(`global_seq <= $${params.length}`);
		}

		const res = await this.sql.query<EventRow>(
			`SELECT * FROM events WHERE ${conds.join(" AND ")} ORDER BY global_seq`,
			params,
		);
		return res.rows.map(rowToEvent) as StoredEvent<TEvent>[];
	}
}

function isUniqueViolation(err: unknown): boolean {
	if (typeof err !== "object" || err === null) return false;
	const e = err as { code?: string; message?: string };
	return e.code === "23505" || /unique|duplicate key/i.test(e.message ?? "");
}
