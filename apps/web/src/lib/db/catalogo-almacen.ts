/**
 * Catálogo de ejemplo de un almacén de barrio.
 *
 * Los nombres y las relaciones de precio entre productos son realistas. El
 * precio absoluto depende de la fecha: `PRECIO_BASE` es el precio en pesos de
 * una marraqueta de pan y todo lo demás se calcula proporcionalmente a partir
 * de ahí. Cuando cambian los precios, se ajusta ese único número.
 *
 * Los códigos de barras son sintéticos (prefijo 990, fuera de los rangos que
 * usa la distribución real). No sirven para cobrar de verdad: hay que cargar
 * losEAN reales del proveedor.
 */

const PRECIO_BASE = 1200;

type Catalogo = {
	nombre: string;
	categoria: string;
	/** Precio relativo al pan. 1 = lo mismo que una marraqueta. */
	factor: number;
	unidad: string;
	stock: number;
};

const CATALOGO: Catalogo[] = [
	// Panadería
	{
		nombre: "Pan Marraqueta",
		categoria: "panaderia",
		factor: 1,
		unidad: "UN",
		stock: 40,
	},
	{
		nombre: "Pan de Mesa Sliced",
		categoria: "panaderia",
		factor: 2.1,
		unidad: "UN",
		stock: 18,
	},
	{
		nombre: "Facturas x6",
		categoria: "panaderia",
		factor: 2.8,
		unidad: "UN",
		stock: 12,
	},
	{
		nombre: "Tortilla x12",
		categoria: "panaderia",
		factor: 4.2,
		unidad: "UN",
		stock: 9,
	},

	// Lácteos
	{
		nombre: "Leche Entera 1 L",
		categoria: "lacteos",
		factor: 1.4,
		unidad: "UN",
		stock: 32,
	},
	{
		nombre: "Leche Descremada 1 L",
		categoria: "lacteos",
		factor: 1.45,
		unidad: "UN",
		stock: 26,
	},
	{
		nombre: "Yogur Natural 1 L",
		categoria: "lacteos",
		factor: 3.4,
		unidad: "UN",
		stock: 8,
	},
	{
		nombre: "Queso Cremoso 500 g",
		categoria: "lacteos",
		factor: 9,
		unidad: "UN",
		stock: 7,
	},
	{
		nombre: "Manteca 200 g",
		categoria: "lacteos",
		factor: 3.1,
		unidad: "UN",
		stock: 14,
	},
	{
		nombre: "Huevos x12",
		categoria: "lacteos",
		factor: 3.6,
		unidad: "UN",
		stock: 22,
	},
	{
		nombre: "Crema de Leche 200 ml",
		categoria: "lacteos",
		factor: 2,
		unidad: "UN",
		stock: 11,
	},

	// Almacén
	{
		nombre: "Arroz 1 kg",
		categoria: "almacen",
		factor: 1.7,
		unidad: "UN",
		stock: 19,
	},
	{
		nombre: "Fideos Espirales 500 g",
		categoria: "almacen",
		factor: 1.3,
		unidad: "UN",
		stock: 28,
	},
	{
		nombre: "Azúcar 1 kg",
		categoria: "almacen",
		factor: 1.6,
		unidad: "UN",
		stock: 24,
	},
	{
		nombre: "Aceite Girasol 900 ml",
		categoria: "almacen",
		factor: 2.6,
		unidad: "UN",
		stock: 16,
	},
	{
		nombre: "Harina 000 1 kg",
		categoria: "almacen",
		factor: 1.2,
		unidad: "UN",
		stock: 30,
	},
	{
		nombre: "Sal Gruesa 1 kg",
		categoria: "almacen",
		factor: 1.1,
		unidad: "UN",
		stock: 20,
	},
	{
		nombre: "Atún en Lata 170 g",
		categoria: "almacen",
		factor: 2.4,
		unidad: "UN",
		stock: 25,
	},
	{
		nombre: "Fideos Caboodles 500 g",
		categoria: "almacen",
		factor: 1.25,
		unidad: "UN",
		stock: 27,
	},
	{
		nombre: "Café Molido 250 g",
		categoria: "almacen",
		factor: 4.8,
		unidad: "UN",
		stock: 13,
	},
	{
		nombre: "Yerba Mate 1 kg",
		categoria: "almacen",
		factor: 4.2,
		unidad: "UN",
		stock: 15,
	},
	{
		nombre: "Harina de Maíz 500 g",
		categoria: "almacen",
		factor: 1.1,
		unidad: "UN",
		stock: 21,
	},
	{
		nombre: "Salsa Tomate 400 g",
		categoria: "almacen",
		factor: 1.5,
		unidad: "UN",
		stock: 23,
	},
	{
		nombre: "Arroz Integral 1 kg",
		categoria: "almacen",
		factor: 2.9,
		unidad: "UN",
		stock: 6,
	},

	// Bebidas
	{
		nombre: "Gaseosa 500 ml",
		categoria: "bebidas",
		factor: 1.3,
		unidad: "UN",
		stock: 48,
	},
	{
		nombre: "Gaseosa 1.5 L",
		categoria: "bebidas",
		factor: 2.4,
		unidad: "UN",
		stock: 22,
	},
	{
		nombre: "Gaseosa 2.25 L",
		categoria: "bebidas",
		factor: 3.4,
		unidad: "UN",
		stock: 18,
	},
	{
		nombre: "Agua Mineral 500 ml",
		categoria: "bebidas",
		factor: 0.9,
		unidad: "UN",
		stock: 36,
	},
	{
		nombre: "Agua Mineral 1.5 L",
		categoria: "bebidas",
		factor: 1.5,
		unidad: "UN",
		stock: 20,
	},
	{
		nombre: "Jugo Concentrado 1 L",
		categoria: "bebidas",
		factor: 2.7,
		unidad: "UN",
		stock: 10,
	},
	{
		nombre: "Cerveza 473 ml",
		categoria: "bebidas",
		factor: 2.2,
		unidad: "UN",
		stock: 24,
	},
	{
		nombre: "Vino Tinto 750 ml",
		categoria: "bebidas",
		factor: 6.5,
		unidad: "UN",
		stock: 8,
	},

	// Limpieza
	{
		nombre: "Detergente Ropa 3 L",
		categoria: "limpieza",
		factor: 3.2,
		unidad: "UN",
		stock: 14,
	},
	{
		nombre: "Lavandina 1 L",
		categoria: "limpieza",
		factor: 1.5,
		unidad: "UN",
		stock: 19,
	},
	{
		nombre: "Papel Higiénico x4",
		categoria: "limpieza",
		factor: 4.1,
		unidad: "UN",
		stock: 17,
	},
	{
		nombre: "Lavavajillas 500 ml",
		categoria: "limpieza",
		factor: 2.1,
		unidad: "UN",
		stock: 12,
	},
	{
		nombre: "Bolsas Residuo x50",
		categoria: "limpieza",
		factor: 1.6,
		unidad: "UN",
		stock: 26,
	},
	{
		nombre: "Fósforo x10",
		categoria: "limpieza",
		factor: 0.8,
		unidad: "UN",
		stock: 33,
	},

	// Desayuno
	{
		nombre: "Mermelada 320 g",
		categoria: "desayuno",
		factor: 2.8,
		unidad: "UN",
		stock: 11,
	},
	{
		nombre: "Dulce de Leche 500 g",
		categoria: "desayuno",
		factor: 2.3,
		unidad: "UN",
		stock: 16,
	},
	{
		nombre: "Té 25 Saquitos",
		categoria: "desayuno",
		factor: 1.4,
		unidad: "UN",
		stock: 20,
	},
	{
		nombre: "Azúcar x10 Paquetes",
		categoria: "desayuno",
		factor: 1.2,
		unidad: "UN",
		stock: 24,
	},
	{
		nombre: "Cereal 500 g",
		categoria: "desayuno",
		factor: 4.4,
		unidad: "UN",
		stock: 9,
	},
];

export const CATEGORIAS = [
	"panaderia",
	"lacteos",
	"almacen",
	"bebidas",
	"limpieza",
	"desayuno",
] as const;

/**
 * Precio final en CENTAVOS (la app guarda los importes en centavos: el
 * formulario multiplica por 100 al guardar). Redondeado al peso.
 */
export function precioDe(factor: number): number {
	return Math.round(PRECIO_BASE * factor) * 100;
}

/** EAN sintético de 13 dígitos, único dentro del catálogo. */
export function barcodeDe(indice: number): string {
	return `990${String(indice + 1).padStart(9, "0")}`;
}

export function catalogo(): {
	nombre: string;
	categoria: string;
	precio: number;
	stock: number;
	unidad: string;
	barcode: string;
}[] {
	return CATALOGO.map((item, i) => ({
		nombre: item.nombre,
		categoria: item.categoria,
		precio: precioDe(item.factor),
		stock: item.stock,
		unidad: item.unidad,
		barcode: barcodeDe(i),
	}));
}
