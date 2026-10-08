# PDV-Basic

Point of sale for neighborhood stores, Spanish-first, built for Argentina.

Derived from [FinOpenPOS](https://github.com/JoaoHenriqueBarbosa/FinOpenPOS) (MIT),
reworked for the local market.

## What we added

- **Spanish by default** (rioplatense voseo). English and Portuguese still available.
- **Barcodes** on products, scanned with a USB gun.
- **Fast sale**: configurable keyboard shortcuts in the POS (F2 search, F9 confirm,
  +/- quantity, Del remove, Esc clear) plus cash count by payment method with chart.
- **Quick actions** panel: new sale, new product, new customer, cash movements,
  scan-to-price.
- **Thermal printer**: own ESC/POS protocol, no libraries, with accent support.

## What it doesn't include

No electronic invoicing. Invoicing in Argentina requires AFIP/ARCA, which is a
separate project. Not needed to operate: sell without invoicing, add it later.

## Quickstart

```bash
bun install
cp .env.example .env    # and set a BETTER_AUTH_SECRET
bun run db:push
bun run db:seed
bun run dev:web
```

App at http://localhost:3001 (dev). Prod with compose: http://localhost:3111.

> Demo user: `test@example.com` / `test1234` (created by `db:seed`).

The database is **PGLite**: embedded Postgres living in `apps/web/data/pglite`.
Nothing to install. To move to a real database, switch the connection string;
the schema stays the same.

Docs: `docs/setup.md`, `docs/deploy.md`, `docs/printing.md`, `docs/roadmap.md`.

## Barcode scanner

Any reader in **keyboard mode (USB HID)** works, nothing to install. Before buying,
check with the seller that it ships in that mode (aka *keyboard wedge*).

The panel has a **Scan price** shortcut: point the reader and it shows the product
and its price. If the code doesn't exist, it offers to register it.

## Thermal printer

Three ways to print, same interface:

| Driver | Requires | Good for |
|---|---|---|
| **WebUSB** | Chrome or Edge, authorize once | USB printer, nothing to install |
| **Local agent** | A service on the store machine | Network printer (what's usually bought) |
| **System print** | Nothing | Plan B: no paper cut, no cash drawer |

**Important:** thermal printers ship with the CP437 code table, which lacks
`ñ`, `á`, `é`. The encoder sets CP858 automatically. Garbled characters on the
ticket mean that's missing.

## Deploy

```bash
cp .env.example .env    # and set a BETTER_AUTH_SECRET
docker compose up -d
```

Up at http://localhost:3111. One container, one data volume.

The printer connects from the store machine:

```bash
docker compose run --rm print-agent --host 192.168.1.50
```

## License

MIT. See [LICENSE](LICENSE), keeping the original FinOpenPOS notice.
