# Deploy

## Requisitos

- Docker + Docker Compose en la máquina del local (o un server chico).
- Un `BETTER_AUTH_SECRET` real (no el de ejemplo).

## Puesta en marcha

```bash
cp .env.example .env
```

Generá el secreto y pegalo en `.env`:

```bash
openssl rand -base64 32
```

```dotenv
BETTER_AUTH_SECRET=<el secreto generado>
# URL donde vas a entrar (la IP del local o el dominio si hay proxy).
BASE_URL=http://192.168.1.50:3111
NEXT_PUBLIC_BASE_URL=http://192.168.1.50:3111
NODE_ENV=production
```

```bash
docker compose up -d --build
```

La app queda en http://localhost:3111 (o la `BASE_URL` que hayas puesto).

> `compose.yaml` corta el arranque si `BETTER_AUTH_SECRET` no está definido, a
> propósito: sin secreto propio las sesiones no son seguras.

## Datos y respaldo

Todo el estado vive en PGlite, en el volumen `pglite_data`
(`apps/web/data/pglite`). No hay servicio de base aparte.

```bash
# Respaldar (parar la app para copiar consistente)
docker compose stop app
docker run --rm -v pdv-basic_pglite_data:/data -v "$PWD":/backup \
  alpine tar czf /backup/pglite-$(date +%F).tgz -C /data .

# Restaurar
docker compose stop app
docker run --rm -v pdv-basic_pglite_data:/data -v "$PWD":/backup \
  alpine sh -c "rm -rf /data/* && tar xzf /backup/pglite-ANIO-MM-DD.tgz -C /data"
docker compose start app
```

Ojo con el nombre del volumen: `docker volume ls` lo confirma (suele ser
`<carpeta-del-proyecto>_pglite_data`).

## Actualizar

```bash
git pull
docker compose up -d --build
```

El schema se crea/actualiza solo al arrancar (`db:push`). Los datos quedan en el
volumen.

## Impresora

El agente de impresión corre en la máquina del local y llega a la impresora por
red:

```bash
docker compose run --rm print-agent --host 192.168.1.50
```

Detalles en `docs/printing.md`.

## Checklist antes de usarlo en el local

- [ ] `BETTER_AUTH_SECRET` propio (no el de ejemplo).
- [ ] `BASE_URL` / `NEXT_PUBLIC_BASE_URL` apuntando a la dirección real.
- [ ] Cambiar la clave del usuario demo `test@example.com` o crear tu usuario y borrar el demo.
- [ ] Respaldo probado (una vez, de punta a punta).
- [ ] `restart: unless-stopped` (ya viene) para que vuelva solo si se corta la luz.
