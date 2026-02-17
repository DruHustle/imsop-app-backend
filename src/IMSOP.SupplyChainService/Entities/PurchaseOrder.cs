using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace IMSOP.SupplyChainService.Entities
{
    [Table("purchase_orders")]
    public class PurchaseOrder
    {
        [Key]
        [Column("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [Column("organization_id")]
        public Guid OrganizationId { get; set; }

        [Required]
        [Column("supplier_id")]
        public Guid SupplierId { get; set; }

        [Column("order_number")]
        [MaxLength(100)]
        public string OrderNumber { get; set; } = string.Empty;

        [Column("status")]
        [MaxLength(50)]
        public string Status { get; set; } = "draft";

        [Column("total_amount")]
        public decimal TotalAmount { get; set; }

        [Column("created_at")]
        public DateTime CreatedAt { get; set; } = DateTime.UtcNow;
    }
}
