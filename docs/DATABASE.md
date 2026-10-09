# Database Guide

IMSOP uses one PostgreSQL database shared by the independently deployable Node API and .NET supply-chain service:

- Lowercase tables are managed by the Node migrations for authentication, operational shipments, telemetry, orders and logistics ingestion.
- EF Core tables are managed by the .NET supply-chain service for organizations, suppliers, products, warehouses, inventory and purchase orders.

## Node API entity relationship diagram

```mermaid
erDiagram
    USERS {
      int id PK
      varchar email UK
      varchar password
      varchar name
      varchar role
      int password_reset_version
      timestamp created_at
    }
    SHIPMENTS {
      int id PK
      varchar tracking_number UK
      varchar origin
      varchar destination
      varchar carrier
      varchar transport_mode
      decimal latitude
      decimal longitude
      varchar status
      timestamp estimated_arrival
      timestamp actual_arrival
      timestamp created_at
    }
    LOGISTICS_EVENTS {
      int id PK
      varchar provider UK
      varchar event_id UK
      varchar tracking_number
      varchar event_type
      text payload
      timestamp occurred_at
      timestamp received_at
    }
    ORDERS {
      int id PK
      varchar order_number UK
      int customer_id
      decimal total_amount
      varchar status
      timestamp created_at
    }
    TELEMETRY {
      int id PK
      varchar device_id
      varchar metric_name
      decimal metric_value
      timestamp timestamp
    }
    SHIPMENTS ||--o{ LOGISTICS_EVENTS : identified_by_tracking_number
```

`LOGISTICS_EVENTS(provider, event_id)` is unique and prevents replayed provider events from being applied twice. Password-reset tokens contain `password_reset_version`; completing a reset increments the version and invalidates previous reset links.

## Node PostgreSQL migrations

Migrations live in `server/migrations` and are applied lexically:

```bash
cd server
pnpm install --frozen-lockfile
pnpm build
pnpm db:migrate
```

The production container runs the same migration command before starting the services. The runner records applied files in `schema_migrations` and applies each file transactionally.

For a disposable local database:

```bash
docker compose up -d postgres
DATABASE_URL=postgresql://imsop:imsop-postgres-local@localhost:5432/imsop_supply_chain pnpm -C server db:migrate
```

Never run development seed or reset operations against production.

## .NET supply-chain model

```mermaid
erDiagram
    ORGANIZATIONS ||--o{ USERS : contains
    ORGANIZATIONS ||--o{ SUPPLIERS : owns
    ORGANIZATIONS ||--o{ PRODUCTS : owns
    ORGANIZATIONS ||--o{ WAREHOUSES : owns
    PRODUCTS ||--o{ INVENTORY : stocked_as
    WAREHOUSES ||--o{ INVENTORY : stores
    SUPPLIERS ||--o{ PURCHASE_ORDERS : receives
    PURCHASE_ORDERS ||--o{ PURCHASE_ORDER_ITEMS : contains
    PRODUCTS ||--o{ PURCHASE_ORDER_ITEMS : ordered_as
```

Production schema evolution uses EF Core migrations in `src/IMSOP.SupplyChainService/Data/Migrations`. Set `Database__AutoMigrate=true` on the supervised Render image so its supply-chain schema is upgraded at startup; it is disabled by default for standalone service deployments.

