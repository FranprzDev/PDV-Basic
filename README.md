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

No incluye facturación electrónica. Para facturar en Argentina hay que sumar AFIP/ARCA, que es
un desarrollo aparte. No es necesario para operar: se vende sin facturar y se agrega después.

## Arranque

```bash
bun install
bun run dev
```

App en http://localhost:3001

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
cp .env.example .env    # y poné un BETTER_AUTH_SECRET
docker compose up -d
```

Queda en http://localhost:3111. Un contenedor, un volumen de datos.

La impresora se conecta desde la máquina del local:

```bash
docker compose run --rm print-agent --host 192.168.1.50
```

## Licencia

MIT. Ver [LICENSE](LICENSE), que conserva el aviso original de FinOpenPOS.