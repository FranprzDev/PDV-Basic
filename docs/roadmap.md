# Roadmap — PDV-Basic para almacén de barrio

Estado: POS rápido + atajos + arqueo hechos (ver `main`).

## Hecho
- Venta rápida con atajos configurables (F2/F9/+/-/Supr/Esc)
- Descuento de stock al vender + precio y total calculados en el servidor
  (pedido + stock + pago en un solo append atómico)
- Anulación de ventas: reintegra el stock y revierte el pago en el mismo medio
  (`OrderCancelled` + `StockRestocked` + transacción `refund`), sin editar el log
- Stock mínimo + alerta (endpoint lowStock, tarjeta en dashboard, aviso en POS)
- Arqueo de caja por medio de pago + gráfico
- Seed demo, CI, lint/tipos/tests en verde

## P0 — lo que sigue
1. **Fiado / cuenta corriente** — saldo por cliente, pagos parciales,
   límite de crédito, historial. El diferencial del almacén ("chau cuadernito").
2. **Balanza / peso variable** — etiquetas `20XXXXXPPPPP`, venta por kg
   (precio × peso). Sin esto no hay fiambrería/verdulería.
3. **Listas de precios + aumento masivo** — minorista/mayorista, remarcación
   por % y ofertas con vigencia. Imprescindible con inflación.
4. **Proveedores + ingreso de mercadería** — remito de compra que suma stock
   y registra costo real.
5. **ARCA / factura electrónica** — Factura C + CAE + QR, cola offline.
   Último: alto esfuerzo y dependencia externa.

Orden sugerido: 1 → 2 → 3 → 4 → 5.

## P1 / P2 (después)
- Vencimientos/lotes, pago mixto + QR con acreditación, multi-sucursal,
  cuenta por WhatsApp, CUIT/condición IVA, importación Excel.
