using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace IMSOP.SupplyChainService.Entities
{
    [Table("inventories")]
    public class Inventory
    {
        [Key]
        [Column("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [Column("organization_id")]
        public Guid OrganizationId { get; set; }

        [Required]
        [Column("product_id")]
        public Guid ProductId { get; set; }

        [Required]
        [Column("warehouse_id")]
        public Guid WarehouseId { get; set; }

        [Column("quantity_on_hand")]
        public int QuantityOnHand { get; set; }

        [Column("quantity_reserved")]
        public int QuantityReserved { get; set; }

        [DatabaseGenerated(DatabaseGeneratedOption.Computed)]
        [Column("quantity_available")]
        public int QuantityAvailable { get; set; }
    }
}
