# IMSOP Architecture

## Repository ownership

| Repository | Responsibility |
|---|---|
| `imsop-app` | React/Vite frontend, browser tests, static frontend deployment |
| `imsop-app-backend` | Node API, .NET services, databases, migrations, infrastructure and backend CI/CD |

The React application currently uses the Node API as its browser-facing backend. The .NET services provide the supply-chain microservice foundation and protected order APIs. They share the same JWT issuer (`imsop-api`) and audience (`imsop-web`) but remain independently deployable.

## Runtime architecture

```mermaid
flowchart LR
    U[Browser user] --> CDN[GitHub Pages or Vercel]
    CDN --> SPA[React 19 SPA]
    SPA -->|HTTPS + HttpOnly cookie| API[Node/Express API on Render]
    API --> MYSQL[(MySQL/Aiven)]
    API --> SMTP[Gmail SMTP]
    CARRIER[Carrier / GPS / IoT provider] -->|HMAC signed events| API
    API --> LOG[(Logistics event audit log)]

    SPA -. future service calls .-> GW[.NET API Gateway]
    GW --> SC[Supply Chain Service]
    GW --> OPS[Operations Service]
    SC --> PG[(PostgreSQL)]
    SC --> BUS[Azure Service Bus]
```

### Production topology

```mermaid
flowchart LR
    Browser -->|HTTPS| Vercel[Vercel frontend]
    Vercel -->|HTTPS + secure cookie| Gateway[Render: IMSOP gateway]
    Gateway -->|private network| Node[Node API container]
    Gateway -->|private network| Ops[Operations container]
    Gateway -->|private network| Supply[Supply Chain container]
    Node -->|TLS| MySQL[(Managed MySQL)]
    Supply -->|private network| Postgres[(Render PostgreSQL)]
    Carrier[Carrier / GPS / IoT] -->|signed webhook| Gateway
```

Only the gateway is public. Render private services isolate the application containers, while Vercel serves the compiled frontend. Gateway readiness verifies the downstream services before Render shifts production traffic.

## Authentication and authorization

```mermaid
sequenceDiagram
    participant B as Browser
    participant A as Node API
    participant D as MySQL
    B->>A: POST /api/auth/login
    A->>D: Lookup user
    A->>A: bcrypt verification
    A-->>B: HttpOnly Secure SameSite=Strict JWT cookie
    B->>A: Authenticated API request
    A->>A: Verify issuer, audience, expiry and role
    A-->>B: Authorized response or 401/403
```

Demo accounts use the frontend mock-auth adapter and browser storage. They never authenticate against production data. Real accounts use the Node API, bcrypt password hashes, 15-minute JWTs, and server-side role enforcement.

## Role matrix

| Area | Admin | Engineer | Analyst | User |
|---|:---:|:---:|:---:|:---:|
| Dashboard | ✓ | ✓ | ✓ | ✓ |
| Shipments | ✓ | ✓ | ✓ | ✓ |
| Orders | ✓ | ✓ | ✓ | — |
| Analytics | ✓ | — | ✓ | — |
| Infrastructure | ✓ | ✓ | — | — |
| Intelligence | ✓ | ✓ | ✓ | — |
| Telemetry read | ✓ | ✓ | ✓ | — |
| Telemetry ingest | ✓ | ✓ | — | — |

## Logistics ingestion

Providers send canonical events to `POST /api/integrations/logistics/{provider}/events`. Requests include a Unix timestamp and an HMAC-SHA256 signature of `timestamp.rawBody`. The API rejects timestamps older than five minutes, validates payloads, records each provider event once, and upserts the current shipment state. Provider/event IDs form the idempotency key.

## Availability

- `/health` verifies the process is running.
- `/ready` verifies the process and database connection.
- Render promotes new instances only after `/ready` succeeds and otherwise keeps the prior version live.
- Kubernetes uses rolling updates with zero unavailable replicas, readiness/liveness probes, revision history, and scripted rollback.

