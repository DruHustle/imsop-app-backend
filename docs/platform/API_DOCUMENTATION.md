# IMSOP API Flows and Sequences

The IMSOP (Intelligent Multi-Cloud Supply Chain & Operations Platform) API is designed for high performance, security, and reliability, adhering to a clear versioning and error-handling strategy. The architecture is primarily Azure-centric, with multi-cloud capabilities facilitated by Azure Arc [1].

## 1. API Versioning Strategy

The IMSOP API employs a dual-strategy for versioning to ensure flexibility and smooth transitions for consumers.

| Strategy | Implementation | Example |
| :--- | :--- | :--- |
| **URL-based Versioning** | The version number is included directly in the request path. | `/api/v1/orders` |
| **Header-based Versioning** | The version is specified in the `Accept` header using a custom media type. | `Accept: application/vnd.imsop.v1+json` |

### Deprecation Policy

To maintain a stable ecosystem, a formal deprecation policy is followed:
*   **Announcement:** Deprecation is announced **6 months** in advance.
*   **Maintenance:** The deprecated version is maintained for **12 months** after the announcement.
*   **Support:** Both the old and new versions are supported during the transition period.
*   **Guidance:** A comprehensive migration guide is provided for all major version changes [1].

## 2. API Response Formats

All API responses follow a consistent JSON structure for both success and error scenarios.

### Success Response

A successful response includes a `success: true` flag, the primary data payload, and a `meta` object for context.

```json
{
  "success": true,
  "data": {
    "id": "uuid",
    "name": "Example",
    "createdAt": "2024-01-10T10:00:00Z"
  },
  "meta": {
    "timestamp": "2024-01-10T10:00:00Z",
    "version": "1.0"
  }
}
```

### Error Response

An error response includes a `success: false` flag and a detailed `error` object.

```json
{
  "success": false,
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid input parameters",
    "details": [
      {
        "field": "email",
        "message": "Invalid email format"
      }
    ]
  },
  "meta": {
    "timestamp": "2024-01-10T10:00:00Z",
    "requestId": "req-12345"
  }
}
```

### Paginated Response

For list endpoints, the response includes a `pagination` object to facilitate efficient data retrieval.

```json
{
  "success": true,
  "data": [
    { "id": "1", "name": "Item 1" },
    { "id": "2", "name": "Item 2" }
  ],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 100,
    "totalPages": 5,
    "hasNextPage": true,
    "hasPreviousPage": false
  }
}
```

## 3. Rate Limiting and Timeouts

To ensure system stability and fair usage, all API endpoints are subject to rate limiting and strict operation timeouts.

### Rate Limiting Configuration

Rate limiting is implemented using a distributed, Redis-based approach, and is enforced at the Azure API Management (APIM) gateway level [1].

| Endpoint Type | Requests/Minute | Burst |
| :--- | :--- | :--- |
| **Authentication** | 5 | 10 |
| **Read Operations** | 60 | 100 |
| **Write Operations** | 30 | 50 |
| **Bulk Operations** | 10 | 20 |
| **Search** | 30 | 50 |

### Operation Timeouts

Timeouts are enforced across the entire stack, from the database to the client, to prevent resource starvation.

| Operation | Timeout | Implementation Strategy |
| :--- | :--- | :--- |
| **API Request** | 30s | HttpClient configuration to cancel after 30 seconds [1]. |
| **Database Query** | 10s | EF Core command timeout set in `DbContext` configuration [1]. |
| **File Upload** | 5m | Handled by dedicated service with extended timeout. |
| **Report Generation** | 10m | Azure Functions `functionTimeout` extended for long-running tasks [1]. |
| **WebSocket Connection** | 30s (idle) | SignalR `ClientTimeoutInterval` and `KeepAliveInterval` configuration [1]. |

## 4. Real-time Communication (SignalR)

Real-time event streaming and notifications are managed via SignalR (WebSockets) for high-performance updates, such as shipment tracking [1].

### Connection Flow

1.  Client initiates SignalR connection.
2.  Server validates JWT token (Microsoft Entra ID).
3.  Server subscribes client to relevant channels (e.g., `shipments:123`).
4.  Server sends initial state.
5.  Client receives real-time updates.
6.  Connection is maintained with a heartbeat mechanism.
7.  Client disconnects or connection times out.

### Message Format

Real-time messages follow a structured format for easy consumption.

```json
{
  "type": "update",
  "channel": "shipments:123",
  "event": "status_changed",
  "data": {
    "shipmentId": "123",
    "status": "in_transit",
    "location": "New York, NY"
  },
  "timestamp": "2024-01-10T10:00:00Z"
}
```

## References

[1]: APIFlows&Sequences.docx (IMSOP - API Flows & Sequences)
