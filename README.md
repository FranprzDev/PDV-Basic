# PDV-Basic

Punto de venta para comercios de barrio, en español, pensado para Argentina.

Derivado de [FinOpenPOS](https://github.com/JoaoHenriqueBarbosa/FinOpenPOS) (MIT), reimplantado
para el mercado local.

## Qué le sumamos

- **Español por defecto** (con voseo rioplatense). Inglés y portugués siguen disponibles.
- **Código de barras** en productos, con escaneo desde la pistola USB.
- **Atajos rápidos** en el panel: nueva venta, nuevo producto, nuevo cliente, movimientos de
  caja y buscar precio escaneando.
- **Impresora térmica**: protocolo ESC/POS propio, sin librerías, con soporte para acentos.

## Lo que no incluye

El módulo fiscal es **brasileño** (NF-e / SEFAZ) y viene sin usar ni compilar limpio. Para
Argentina hay que reemplazarlo por AFIP/ARCA. No es necesario para operar: se puede vender sin
facturación y agregarla después.

## Arranque

```bash
bun install
bun run dev
```

- App: http://localhost:3001
- Documentación: http://localhost:3002

Usuario de prueba: `test@example.com` / `test1234`

La base es **PGLite**: un Postgres embebido que vive en `apps/web/data/pglite`. No hace falta
instalar nada. Para pasar a una base real, cambiá la conexión y el esquema sigue igual.

## Escáner de código de barras

Cualquier lector en **modo teclado (USB HID)** funciona, sin instalar nada. Antes de comprar,
verificá que el vendedor lo tenga en ese modo (lo suelen llamar *keyboard wedge*).

El panel tiene un atajo **Escanear precio**: apuntá el lector y te muestra el producto y su
precio. Si el código no existe, te ofrece registrarlo.

## Impresora térmica

Hay tres formas de imprimir, misma interfaz:

| Driver | Requiere | Sirve para |
|---|---|---|
| **WebUSB** | Chrome o Edge, autorizar una vez | Impresora por USB, sin instalar nada |
| **Agente local** | Un servicio en la máquina del local | Impresora de red (lo que se compra hoy) |
| **Impresión del sistema** | Nada | Plan B: no corta papel ni abre el cajón |

**Importante:** las impresoras térmicas vienen con la tabla de códigos en CP437, que no tiene
`ñ`, `á` ni `é`. El codificador setea CP858 automáticamente. Si ves caracteres raros en el
ticket, es que falta eso.

## Publicar

```bash
docker compose up -d
```

Un contenedor, un volumen de datos. Alcanza para los primeros 50 comercios en un VPS de ~5 EUR/mes.

## Licencia

MIT. Ver [LICENSE](LICENSE), que conserva el aviso original de FinOpenPOS.