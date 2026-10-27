using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace IMSOP.SupplyChainService.Entities
{
    [Table("purchase_order_items")]
    public class PurchaseOrderItem
    {
        [Column("received_quantity")] public int ReceivedQuantity {get;set;}
        [Key]
        [Column("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [Column("purchase_order_id")]
        public Guid PurchaseOrderId { get; set; }

        [Required]
        [Column("product_id")]
        public Guid ProductId { get; set; }

        [Column("quantity")]
        public int Quantity { get; set; }

        [Column("unit_price")]
        public decimal UnitPrice { get; set; }
    }
}
