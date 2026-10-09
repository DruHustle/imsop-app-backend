# IMSOP Database Schema and Design

The IMSOP database schema is built on **Aiven PostgreSQL** to ensure ACID compliance, high availability, and multi-tenancy support. The design is normalized and optimized for supply chain and operations management, with a strong focus on indexing and data retention [1].

## 1. Core Tables and Multi-Tenancy

The schema is designed around a multi-tenant architecture, where the `organizations` table is the root entity, and all other core tables are linked via `organization_id`.

| Table | Description | Key Columns | Relationships |
| :--- | :--- | :--- | :--- |
| `organizations` | Central organization management. | `id` (UUID, PK), `name` (UNIQUE), `status`, `subscription_tier` | Root entity |
| `users` | User accounts and authentication. | `id` (UUID, PK), `organization_id` (FK), `email` (UNIQUE per org), `password_hash` | FK to `organizations` |
| `roles` | Role definitions for RBAC. | `id` (UUID, PK), `organization_id` (FK), `name` (UNIQUE per org) | FK to `organizations` |
| `permissions` | Granular permission definitions. | `id` (UUID, PK), `resource`, `action` (UNIQUE composite) | Independent |
| `user_roles` | Links users to roles. | `user_id` (FK), `role_id` (FK) | FK to `users`, `roles` |

## 2. Supply Chain and Inventory Tables

These tables manage the core business logic for products, suppliers, and inventory tracking.

| Table | Description | Key Columns | Relationships |
| :--- | :--- | :--- | :--- |
| `suppliers` | Supplier management and tracking. | `id` (UUID, PK), `organization_id` (FK), `name`, `status`, `rating` | FK to `organizations` |
| `products` | Product catalog and specifications. | `id` (UUID, PK), `organization_id` (FK), `sku` (UNIQUE per org), `unit_cost`, `selling_price` | FK to `organizations` |
| `warehouses` | Warehouse locations and capacity. | `id` (UUID, PK), `organization_id` (FK), `manager_id` (FK to `users`) | FK to `organizations`, `users` |
| `inventory` | Stock levels per warehouse/product. | `warehouse_id` (FK), `product_id` (FK), `quantity_on_hand`, `quantity_available` (GENERATED) | FK to `warehouses`, `products` |
| `inventory_transactions` | History of stock movements. | `inventory_id` (FK), `transaction_type`, `quantity`, `created_by` (FK to `users`) | FK to `inventory`, `users` |

## 3. Order and Shipment Tables

These tables handle the transactional data for purchasing and logistics.

| Table | Description | Key Columns | Relationships |
| :--- | :--- | :--- | :--- |
| `purchase_orders` | Purchase order management. | `id` (UUID, PK), `supplier_id` (FK), `po_number` (UNIQUE per org), `status`, `total_amount` | FK to `organizations`, `suppliers` |
| `purchase_order_items` | Line items for purchase orders. | `purchase_order_id` (FK), `product_id` (FK), `quantity_ordered`, `unit_price` | FK to `purchase_orders`, `products` |
| `shipments` | Shipment records (inbound, outbound, transfer). | `id` (UUID, PK), `origin_warehouse_id` (FK), `destination_warehouse_id` (FK), `tracking_number`, `status` | FK to `organizations`, `warehouses` |
| `shipment_tracking` | Real-time location and status updates. | `shipment_id` (FK), `location`, `latitude`, `longitude`, `timestamp` | FK to `shipments` |

## 4. Analytics and Metrics Tables

These tables are optimized for data analysis and performance tracking.

| Table | Description | Key Columns | Relationships |
| :--- | :--- | :--- | :--- |
| `analytics_events` | Raw event logging for analysis. | `id` (UUID, PK), `event_type`, `entity_type`, `metadata` (JSON) | FK to `organizations`, `users` |
| `analytics_metrics` | Aggregated performance metrics. | `id` (UUID, PK), `metric_name`, `metric_value`, `dimension_date` | FK to `organizations` |

## 5. Indexing Strategy

A robust indexing strategy is crucial for query performance, especially in a multi-tenant environment [1].

### Key Indexing Principles

*   **Primary Indexes:** All primary keys and foreign keys are indexed.
*   **Multi-Tenancy:** `organization_id` is indexed on all relevant tables for efficient filtering.
*   **Performance Indexes:** Status fields (`status`), date fields (`created_at`, `updated_at`), and frequently searched fields (`tracking_number`, `sku`) are indexed.
*   **Composite Indexes:** Used for common lookups:
    *   `(organization_id, status)`
    *   `(warehouse_id, product_id)`
    *   `(created_at, organization_id)`

## 6. Query Patterns and Optimization

The schema supports complex queries for operational and analytical needs.

### Example Query: Get Inventory by Product

```sql
SELECT i.*, p.name, w.name as warehouse_name
FROM inventory i
JOIN products p ON i.product_id = p.id
JOIN warehouses w ON i.warehouse_id = w.id
WHERE p.organization_id = ? AND p.sku = ?
ORDER BY w.name;
```

### Optimization Strategies

*   **Query Planning:** Use `EXPLAIN ANALYZE` for all complex queries.
*   **Projection:** Avoid `SELECT *`; select only the necessary columns.
*   **Pagination:** Implement pagination for all large result sets.
*   **Caching:** Cache frequently accessed data (products, organization settings, user permissions) using Aiven Redis [1].

## 7. Data Retention and Security

### Data Retention Policy

To manage database size and performance, a clear retention policy is enforced [1]:
*   Archive old purchase orders (>2 years).
*   Archive old shipment tracking data (>1 year).
*   Archive old analytics events (>6 months).
*   Keep current inventory data indefinitely.

### Security Considerations

*   **Encryption:** Encrypt sensitive data at rest (Aiven PostgreSQL encryption) and use TLS for data in transit.
*   **Access Control:** Implement Row-Level Security (RLS) for multi-tenancy and audit trails for all modifications.
*   **Authentication:** Hash passwords with bcrypt [1].

## References

[1]: DatabaseSchema.docx (IMSOP - Database Schema)
