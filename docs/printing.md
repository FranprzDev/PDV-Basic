# Impresión

Drivers (`apps/web/src/lib/printer/drivers.ts`): WebUSB (Chrome/Edge, directo),
agente local (`apps/print-agent`, impresora de red), sistema (plan B).
Detalle en `apps/print-agent/README.md`. Encoder propio CP858 en `escpos-encoder.ts`.
