# Event Sourcing & CQRS

## Decisión (ADR)

**Estado:** aceptado — rama `feat/cqrs-event-sourcing`

Los dominios operacionales (productos, clientes, pedidos, transacciones y métodos
de pago) pasan a ser **event-sourced de verdad**: la única fuente de
verdad es el log append-only `events`, y **todo estado se reconstruye por
replay de los eventos en cada lectura — no existen snapshots ni tablas de
estado materializado**.

### Contexto

La app corre enteramente sobre **PGlite** (Postgres embebido, single-writer,
sin TCP). Eso descarta stores externos (EventStoreDB/Kurrent, NATS
JetStream) y también el store PostgreSQL de
[Emmett](https://event-driven-io.github.io/emmett/overview.html) — la
biblioteca de referencia de event sourcing en TypeScript — porque depende
de `node-postgres` con pool de conexiones
([detalles](https://event-driven.io/en/emmett_postgresql_event_store/)).

La solución es un event store propio (`@finopenpos/event-sourcing`) que adopta
los mismos patrones de Emmett y de la literatura de event stores en Postgres
([schema con UNIQUE (stream, version)](https://dev.to/tim_derzhavets/building-a-production-ready-event-store-in-postgresql-schema-design-projections-and-replay-25o8),
[event storage en Postgres](https://dev.to/kspeakman/event-storage-in-postgres-4dk2),
[postgresql-event-sourcing](https://github.com/eugene-khyst/postgresql-event-sourcing)):

- **Patrón Decider**: los comandos validan contra el estado reconstruido y
  emiten eventos; reducers puros hacen `estado + evento → estado`.
- **Concurrencia optimista** vía `UNIQUE (stream_type, stream_id, version)` —
  un append con versión defasada es rechazado por la base
  (`ConcurrencyError`), sin lock de aplicación.
- **Orden total** vía `global_seq serial` — base de cualquier replay y de
  time-travel (`toGlobalSeq`).

### Benchmark (decide el diseño físico)

`packages/event-sourcing/bench/store-bench.ts` (PGlite in-memory, Bun;
resultados en `bench/results.json`, Apple Silicon):

| Variante | Append (2k eventos) | Replay + fold |
|---|---|---|
| payload `jsonb`, insert unitario | 10.564 ops/s | — |
| payload `jsonb`, batch 100 | 91.011 ops/s | 539k eventos/s (50k) |
| payload `text`, insert unitario | 13.091 ops/s | — |
| payload `text`, batch 100 | **105.032 ops/s** | **935k eventos/s (50k)** |

Decisiones extraídas:

1. **Payload como `text` (JSON serializado)**, no `jsonb`: el fold ocurre
   siempre en JS — nunca filtramos dentro del payload vía SQL — entonces el
   `jsonb` solo agrega costo de parse en PGlite. `text` rinde ~1,7x en el
   replay y ~15–25% en el append.
2. **Append multi-row**: todos los eventos de un comando entran en un único
   `INSERT ... VALUES (...), (...)` (~8x más rápido que inserts unitarios).
3. **La reconstrucción total en cada lectura es viable**: replay de 50 mil eventos
   cuesta ~54 ms; un POS típico (decenas de miles de eventos por usuario)
   queda en el orden de pocos ms por consulta. Sin red (PGlite embebido), no
   hay round-trips que amortizar.

### Fuera del alcance del event sourcing

Nada más allá de los cinco dominios operacionales es event-sourced hoy. El schema
tiene solo la tabla `events` y las tablas de auth de Better Auth.

## Arquitectura

```
apps/web/src/lib/trpc/routers/*    ← contrato tRPC/OpenAPI inalterado
        │ comandos                       │ queries
        ▼                                ▼
apps/web/src/lib/es/*              (write side)   (read side)
  products / customers / orders /   comandos +     proyecciones: readAll +
  transactions / payment-methods    reducers       foldStreams por request
        ▼
packages/event-sourcing            EventStore (append, appendMany, readStream,
                                   readAll, nextStreamId), foldStream(s), tipos
        ▼
tabla `events` (PGlite)            global_seq | stream_type | stream_id |
                                   version | event_type | payload(text) |
                                   user_uid | occurred_at
```

### Eventos por agregado

| Stream | Eventos |
|---|---|
| `product` | `ProductCreated`, `ProductUpdated`, `StockDecremented`, `StockRestocked`, `ProductDeleted` |
| `customer` | `CustomerCreated`, `CustomerUpdated`, `CustomerDeleted` |
| `order` | `OrderPlaced` (con ítems embebidos), `OrderUpdated`, `OrderCancelled`, `OrderDeleted` |
| `transaction` | `TransactionRecorded`, `TransactionUpdated`, `TransactionDeleted` |
| `payment_method` | `PaymentMethodCreated`, `PaymentMethodRenamed`, `PaymentMethodDeleted` |

Observaciones:

- Los **ítems del pedido** son parte del hecho `OrderPlaced` (un pedido se
  coloca con sus ítems — no existen eventos por ítem). El `id` de ítem
  expuesto en la API es sintético y estable (`order_id * 1000 + índice + 1`).
- La venta en el POS es **un solo comando atómico** que graba en tres agregados:
  `OrderPlaced` (pedido), `StockDecremented` por ítem (stock) y
  `TransactionRecorded` (pago) — todo en un único `appendMany` (un INSERT). Si
  cualquier stream cambió en el medio tiempo, el comando entero es rechazado.
- El **precio y el total salen del catálogo del servidor**; el cliente solo manda qué
  y cuánto. El stock se valida y se descuenta como parte del mismo hecho — el POS no
  es la autoridad sobre el precio ni sobre la disponibilidad.
- Borrar el pedido **no borra** la transacción ni devuelve el stock — los hechos
  históricos permanecen en el log. Anular es distinto y explícito: un comando
  atómico que graba `OrderCancelled` + `StockRestocked` por ítem y un
  `TransactionRecorded` con importe negativo (categoría `refund`) en el mismo
  medio de pago. Nada se edita: se agregan hechos nuevos.
- `deleted` es un evento como cualquier otro: el reducer devuelve `undefined`
  y la proyección elimina la entidad del read model. El historial sigue
  disponible para auditoría/replay.
- Los IDs numéricos se preservan (compatibilidad con el contrato de la API):
  `nextStreamId` asigna `MAX(stream_id)+1` por tipo de stream; una carrera
  (imposible en PGlite single-writer) sería rechazada por el UNIQUE.
- El **seed** es una importación de eventos históricos (`occurredAt` en el
  pasado), exactamente como los datos habrían entrado por el uso normal.

### Invariantes mantenidas en el write side

- Email de cliente único (global) — validado contra la proyección antes del
  append.
- Nombre de método de pago único — ídem.
- Alcance por usuario: los comandos verifican `user_uid` del stream antes de
  grabar; las queries filtran eventos por `user_uid` en el SQL.
- Precio y total de una venta: calculados en el servidor a partir del catálogo,
  nunca aceptados del cliente. La regla de precio vigente (mayorista por
  cantidad si está configurado, si no el común) vive en `unitPriceFor` y la
  usan tanto el servidor como el POS para no desincronizarse.
- Stock: la venta solo pasa si hay `in_stock` suficiente de cada producto;
  la baja entra en el mismo append atómico del pedido y del pago.
- Anulación: una venta anulada devuelve exactamente las unidades que descontó
  y revierte el pago con una transacción negativa; reintentar la anulación se
  rechaza (no se reintegra dos veces).

## Referencias

- [Emmett — overview](https://event-driven-io.github.io/emmett/overview.html)
- [Event Sourcing on PostgreSQL in Node.js with Emmett](https://event-driven.io/en/emmett_postgresql_event_store/)
- [Building a Production-Ready Event Store in PostgreSQL](https://dev.to/tim_derzhavets/building-a-production-ready-event-store-in-postgresql-schema-design-projections-and-replay-25o8)
- [Event Storage in Postgres (K. Speakman)](https://dev.to/kspeakman/event-storage-in-postgres-4dk2)
- [eugene-khyst/postgresql-event-sourcing](https://github.com/eugene-khyst/postgresql-event-sourcing)
- [Practical Introduction to Event Sourcing with Emmett](https://www.architecture-weekly.com/p/practical-introduction-to-event-sourcing)
