# Roadmap — PDV-Basic para almacén de barrio

Estado: POS rápido + atajos + arqueo hechos (ver `main`).

## Hecho
- Venta rápida con atajos configurables (F2/F9/+/-/Supr/Esc)
- Arqueo de caja por medio de pago + gráfico
- Seed demo, CI, lint/tipos/tests en verde

## P0 — lo que sigue
1. **Fiado / cuenta corriente** — saldo por cliente, pagos parciales,
   límite de crédito, historial. El diferencial del almacén ("chau cuadernito").
2. **Stock mínimo + alerta** — umbral por producto, aviso en POS/dashboard,
   lista de reposición. Anti-quiebre de góndola.
3. **Devoluciones / anulación** — anular venta o devolver ítem con reingreso
   a stock (`OrderCancelled`/`Refund` en el event log).
4. **Balanza / peso variable** — etiquetas `20XXXXXPPPPP`, venta por kg
   (precio × peso). Sin esto no hay fiambrería/verdulería.
5. **Listas de precios + aumento masivo** — minorista/mayorista, remarcación
   por % y ofertas con vigencia. Imprescindible con inflación.
6. **Proveedores + ingreso de mercadería** — remito de compra que suma stock
   y registra costo real.
7. **ARCA / factura electrónica** — Factura C + CAE + QR, cola offline.
   Último: alto esfuerzo y dependencia externa.

Orden sugerido: 1 → 2 → 3 → 4 → 5 → 6 → 7.

## P1 / P2 (después)
- Vencimientos/lotes, pago mixto + QR con acreditación, multi-sucursal,
  cuenta por WhatsApp, CUIT/condición IVA, importación Excel.
