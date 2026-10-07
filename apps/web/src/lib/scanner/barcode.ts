/**
 * Normalización de códigos de barras, compartida entre cliente y servidor.
 *
 * Los lectores agregan ceros a la izquierda en algunos formatos y algunos
 * modelos incluyen espacios. Sin normalizar, el mismo producto aparece con
 * tres códigos distintos en la base.
 */

/** Deja solo dígitos y quita los ceros iniciales (salvo que sea "0"). */
export function normalizeBarcode(raw: string): string {
	return raw.replace(/\D/g, "").replace(/^0+(?=\d)/, "");
}

/** Búsqueda por código dentro de una lista ya cargada en memoria. */
export function findByBarcode<T extends { barcode?: string | null }>(
	items: readonly T[],
	raw: string,
): T | undefined {
	const target = normalizeBarcode(raw);
	if (!target) return undefined;
	return items.find(
		(item) => item.barcode && normalizeBarcode(item.barcode) === target,
	);
}