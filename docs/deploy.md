# Deploy

```bash
cp .env.example .env
docker compose up -d --build
```

Prod http://localhost:3111. Datos en volumen `pglite_data` (`apps/web/data/pglite`).
Backup: `docker compose stop app` + respaldar volumen.
