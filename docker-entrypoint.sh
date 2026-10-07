#!/bin/sh
set -e

# Nginx primero, para que el puerto 3111 responda de inmediato.
nginx

# App con la base de datos preparada (PGLite embebido en un volumen).
cd /app/apps/web
mkdir -p data
bun scripts/ensure-db.ts && bunx drizzle-kit push

bun next start --port 3001 &

# Si algún proceso muere, cae el contenedor.
wait -n