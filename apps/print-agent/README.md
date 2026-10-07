# Agente local de impresión

Puente entre el navegador y la impresora térmica de red.

## Por qué existe

El navegador no puede abrir un socket TCP: JavaScript no tiene acceso a la
red cruda. Las impresoras térmicas de red (Zebra, Epson, Bixolon, Godex)
escuchan en el puerto **9100** y esperan bytes ESC/POS, pero desde una página
web no hay forma de llegar ahí.

Este agente corre en la máquina del local, escucha en `127.0.0.1` y reenvía los
bytes. Sin dependencias: `node:net` y `node:http`.

## Uso

```bash
bun run start -- --host 192.168.1.50
```

Opciones:

| Flag | Qué hace |
|---|---|
| `--host <ip>` | IP de la impresora (obligatorio) |
| `--port <n>` | Puerto RAW de la impresora. Default `9100` |
| `--agent-port <n>` | Puerto donde escucha el agente. Default `9110` |
| `--file <ruta>` | Escribe los bytes a un archivo en vez de imprimir. Para probar sin hardware |
| `--timeout <ms>` | Timeout de conexión. Default `5000` |

## Probarlo sin impresora

```bash
bun run start -- --file /tmp/ticket.bin
```

Cada ticket se **acumula** en el archivo, así que podés mandarlo a una
impresora real después para verificar el papel.

## Rutas

| Ruta | Qué hace |
|---|---|
| `GET /health` | Si el agente vive y si la impresora responde |
| `POST /print` | `{ "data": "<base64 ESC/POS>" }` |
| `POST /drawer` | Abre el cajón de dinero |

## Desde la app

La pantalla de venta ya usa el driver `localAgent` (ver
`apps/web/src/lib/printer/drivers.ts`). Para que use otro, cambiá la
preferencia guardada en `localStorage` bajo la clave `pdv:printer-driver`.

## Seguridad

- Escucha **solo en loopback**, no en la red local.
- El CORS acepta únicamente orígenes `localhost` y `127.0.0.1`, así que una
  página cualquiera no puede mandarle tickets.

## Diagnóstico

Si `/health` devuelve `"printer": false`:

- La impresora está apagada o sin cable de red
- La IP cambió (muchas usan DHCP)
- Hay un firewall en medio
- Probá `nc -vz <ip> 9100` desde esa máquina

## Nota sobre acentos

Las impresoras vienen con CP437, que no tiene `ñ` ni acentos. El codificador
del navegador setea **CP858** automáticamente antes de imprimir. Si ves letras
raras en el papel, el problema es ese y no el texto.