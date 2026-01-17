using Microsoft.EntityFrameworkCore;
using IMSOP.SupplyChainService.Entities;

namespace IMSOP.SupplyChainService.Data
{
    public class ApplicationDbContext : DbContext
    {
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options) : base(options) { }

        public DbSet<Organization> Organizations { get; set; }
        public DbSet<User> Users { get; set; }
        public DbSet<Supplier> Suppliers { get; set; }
        public DbSet<Product> Products { get; set; }
        public DbSet<Warehouse> Warehouses { get; set; }
        public DbSet<Inventory> Inventories { get; set; }
        public DbSet<PurchaseOrder> PurchaseOrders { get; set; }
        public DbSet<PurchaseOrderItem> PurchaseOrderItems { get; set; }

        protected override void OnModelCreating(ModelBuilder modelBuilder)
        {
            base.OnModelCreating(modelBuilder);
            
            // Configure multi-tenancy filters, indexes, and relationships based on schema
            modelBuilder.Entity<Organization>().HasIndex(o => o.Name).IsUnique();
            modelBuilder.Entity<User>().HasIndex(u => new { u.OrganizationId, u.Email }).IsUnique();
            
            modelBuilder.Entity<Inventory>()
                .HasKey(i => i.Id);
            
            modelBuilder.Entity<Inventory>()
                .Property(i => i.QuantityAvailable)
                .HasComputedColumnSql("quantity_on_hand - quantity_reserved", stored: true);
        }
    }
}
