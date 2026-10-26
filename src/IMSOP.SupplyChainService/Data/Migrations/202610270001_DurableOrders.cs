using Microsoft.EntityFrameworkCore;
using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace IMSOP.SupplyChainService.Data.Migrations;
[DbContext(typeof(ApplicationDbContext))]
[Migration("202610270001_DurableOrders")]
public class DurableOrders : Migration {
 protected override void Up(MigrationBuilder migrationBuilder) => migrationBuilder.Sql("""
 ALTER TABLE supply_chain.purchase_orders ADD COLUMN idempotency_key text, ADD COLUMN request_hash text, ADD COLUMN dispatch_state text NOT NULL DEFAULT 'disabled';
 CREATE UNIQUE INDEX purchase_orders_request_identity ON supply_chain.purchase_orders(organization_id,idempotency_key);
 CREATE TABLE supply_chain.order_outbox (id uuid PRIMARY KEY,order_id uuid NOT NULL REFERENCES supply_chain.purchase_orders(id),body text NOT NULL,state text NOT NULL,attempts integer NOT NULL DEFAULT 0,next_attempt_at timestamptz NOT NULL DEFAULT now(),lease_until timestamptz);
 CREATE INDEX order_outbox_due ON supply_chain.order_outbox(state,next_attempt_at);
 """);
 protected override void Down(MigrationBuilder migrationBuilder) => throw new NotSupportedException("Restore application image; preserve durable order data. Reverse migration requires a reviewed data plan.");
}
