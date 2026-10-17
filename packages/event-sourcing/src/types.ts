/**
 * Tipos centrales del event sourcing.
 *
 * Un evento de dominio es un hecho inmutable: `{ type, data }`.
 * Una vez persistido se convierte en un `StoredEvent`, ganando posición global
 * (`globalSeq`), versión dentro del stream y timestamp.
 */

/** Evento de dominio todavía no persistido. */
export interface DomainEvent<TType extends string = string, TData = unknown> {
	type: TType;
	data: TData;
}

/** Evento persistido en el event store (hecho inmutable). */
export interface StoredEvent<TEvent extends DomainEvent = DomainEvent> {
	/** Posición global en el log (orden total de todos los eventos). */
	globalSeq: number;
	streamType: string;
	streamId: number;
	/** Versión del evento dentro del stream (1, 2, 3, ...). */
	version: number;
	type: TEvent["type"];
	data: TEvent extends DomainEvent<string, infer D> ? D : unknown;
	userUid: string;
	occurredAt: Date;
}

/** Reducer puro: estado anterior + evento → nuevo estado. */
export type Reducer<TState, TEvent extends DomainEvent = DomainEvent> = (
	state: TState | undefined,
	event: StoredEvent<TEvent>,
) => TState | undefined;

export interface AppendInput<TEvent extends DomainEvent = DomainEvent> {
	streamType: string;
	streamId: number;
	/**
	 * Versión esperada del stream antes del append (0 = stream nuevo).
	 * Si otro comando hubiera grabado en ese medio tiempo, el UNIQUE
	 * (stream_type, stream_id, version) rechaza y lanzamos ConcurrencyError.
	 */
	expectedVersion: number;
	events: TEvent[];
	userUid: string;
	/** Timestamp del hecho (default: now). Útil para seeds/importación. */
	occurredAt?: Date;
}

/**
 * Un stream en un append multi-stream: comando que graba en más de un
 * agregado como un solo hecho (ej.: venta = pedido + baja de stock + pago).
 * Todos los streams entran en el mismo INSERT, por lo tanto todo se graba o nada se graba.
 */
export interface StreamAppend<TEvent extends DomainEvent = DomainEvent> {
	streamType: string;
	streamId: number;
	/** Versión esperada del stream antes del append (0 = stream nuevo). */
	expectedVersion: number;
	events: TEvent[];
}

export interface ReadOptions {
	/** Filtra por dueño de los eventos. */
	userUid?: string;
	/** Lee solo hasta esta posición global (time-travel). */
	toGlobalSeq?: number;
}

export class ConcurrencyError extends Error {
	constructor(streamType: string, streamId: number, expectedVersion: number) {
		super(
			`Concurrency conflict on ${streamType}:${streamId} (expected version ${expectedVersion})`,
		);
		this.name = "ConcurrencyError";
	}
}
