# Contributing a PDV-Basic

## Setup

```bash
git clone https://github.com/FranprzDev/PDV-Basic
cd PDV-Basic
bun install
cp .env.example .env
bun run db:push
bun run dev:web
```

App dev en http://localhost:3001. Prod con compose en http://localhost:3111.

## Estructura

```
apps/
  web/           → Next.js (POS)
  print-agent/   → Agente ESC/POS local
packages/
  api/ auth/ db/ env/ event-sourcing/ ui/ config/
```

Base dev: PGLite en `apps/web/data/pglite`, sin instalar Postgres.

## Comandos

```bash
bun run dev:web      # solo web
bun run build        # todo
bun run check-types  # tipos
bun run lint         # biome check (sin --write)
bun run test         # tests
```

## Flujo

1. Fork + branch `feat/mi-cambio`
2. Commits convencionales (`feat:`, `fix:`, `docs:`)
3. PR con descripción y test manual

## Dudas

Abrí un [issue](https://github.com/FranprzDev/PDV-Basic/issues).
