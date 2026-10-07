/**
 * Registro de addons instalados (lado servidor).
 *
 * Para instalar un addon: agregá el paquete como dependencia, importá su
 * definición acá y incluila en `installedAddons` (y sus routers en
 * `addonRouters`). El resto —schema, rutas, eventos, i18n, seed— lo descubre
 * el host por los puntos de extensión del addon-kit.
 *
 * Vacío a propósito: no hay ningún addon activo.
 */

import type { AddonDefinition } from "@finopenpos/addon-kit";

export const installedAddons: AddonDefinition<never>[] = [];

/** Routers contribuidos, mesclados en la raiz del appRouter. */
export const addonRouters = {};