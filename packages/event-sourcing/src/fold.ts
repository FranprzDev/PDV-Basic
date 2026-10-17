import type { DomainEvent, Reducer, StoredEvent } from "./types";

/**
 * Reconstruye el estado de todos los streams presentes en una lista de eventos.
 * Devuelve un Map streamId → estado (los streams cuyo reducer devolvió
 * `undefined` — ej.: eliminados — se quitan del mapa).
 */
export function foldStreams<TState, TEvent extends DomainEvent>(
	events: StoredEvent<TEvent>[],
	reducer: Reducer<TState, TEvent>,
): Map<number, TState> {
	const state = new Map<number, TState>();
	for (const event of events) {
		const next = reducer(state.get(event.streamId), event);
		if (next === undefined) state.delete(event.streamId);
		else state.set(event.streamId, next);
	}
	return state;
}

/** Reconstruye el estado de un único stream a partir de sus eventos. */
export function foldStream<TState, TEvent extends DomainEvent>(
	events: StoredEvent<TEvent>[],
	reducer: Reducer<TState, TEvent>,
): { state: TState | undefined; version: number } {
	let state: TState | undefined;
	let version = 0;
	for (const event of events) {
		state = reducer(state, event);
		version = event.version;
	}
	return { state, version };
}
