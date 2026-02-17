using System;
using System.ComponentModel.DataAnnotations;
using System.ComponentModel.DataAnnotations.Schema;

namespace IMSOP.SupplyChainService.Entities
{
    [Table("suppliers")]
    public class Supplier
    {
        [Key]
        [Column("id")]
        public Guid Id { get; set; } = Guid.NewGuid();

        [Required]
        [Column("organization_id")]
        public Guid OrganizationId { get; set; }

        [Required]
        [MaxLength(255)]
        [Column("name")]
        public string Name { get; set; } = string.Empty;

        [Column("email")]
        [MaxLength(320)]
        public string? Email { get; set; }

        [Column("phone")]
        [MaxLength(50)]
        public string? Phone { get; set; }

        [Column("status")]
        public string Status { get; set; } = "active";
    }
}
