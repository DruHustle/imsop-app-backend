using Microsoft.EntityFrameworkCore.Infrastructure;
using Microsoft.EntityFrameworkCore.Migrations;
namespace IMSOP.SupplyChainService.Data.Migrations;
[DbContext(typeof(ApplicationDbContext))]
[Migration("202610270002_PurchaseReceiving")]
public class PurchaseReceiving : Migration {
 protected override void Up(MigrationBuilder m) => m.Sql("""
 ALTER TABLE supply_chain.purchase_orders ADD COLUMN currency varchar(3) CHECK(currency IS NULL OR currency ~ '^[A-Z]{3}$');
 ALTER TABLE supply_chain.purchase_order_items ADD COLUMN received_quantity integer NOT NULL DEFAULT 0;
 ALTER TABLE supply_chain.purchase_order_items ADD CONSTRAINT purchase_item_order_fk FOREIGN KEY(purchase_order_id) REFERENCES supply_chain.purchase_orders(id) NOT VALID;
 ALTER TABLE supply_chain.purchase_order_items ADD CONSTRAINT purchase_item_product_fk FOREIGN KEY(product_id) REFERENCES supply_chain.products(id) NOT VALID;
 CREATE TABLE supply_chain.purchase_receipts (
 id uuid PRIMARY KEY,organization_id uuid NOT NULL,order_id uuid NOT NULL REFERENCES supply_chain.purchase_orders(id),
 request_key text NOT NULL,request_hash text NOT NULL,warehouse_id uuid NOT NULL REFERENCES supply_chain.warehouses(id),
 received_at timestamptz NOT NULL,note text NOT NULL,actor text NOT NULL,created_at timestamptz NOT NULL DEFAULT now(),
 UNIQUE(organization_id,request_key));
 CREATE TABLE supply_chain.purchase_receipt_items (
 receipt_id uuid NOT NULL REFERENCES supply_chain.purchase_receipts(id),item_id uuid NOT NULL REFERENCES supply_chain.purchase_order_items(id),
 quantity integer NOT NULL CHECK(quantity>0),PRIMARY KEY(receipt_id,item_id));
 """);
 protected override void Down(MigrationBuilder m)=>throw new NotSupportedException("Preserve purchasing and inventory evidence; repair forward.");
}
