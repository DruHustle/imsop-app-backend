using Microsoft.EntityFrameworkCore;
using IMSOP.SupplyChainService.Entities;

namespace IMSOP.SupplyChainService.Data
{
    public class ApplicationDbContext : DbContext
    {
        private readonly IHttpContextAccessor? _http;
        public Guid? OrganizationId => Guid.TryParse(_http?.HttpContext?.User.FindFirst("organization_id")?.Value,out var id) ? id : null;
        public ApplicationDbContext(DbContextOptions<ApplicationDbContext> options, IHttpContextAccessor? http = null) : base(options) { _http=http; }
        public DbSet<OrderOutbox> OrderOutbox {get;set;}

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
            modelBuilder.HasDefaultSchema("supply_chain");
            
            modelBuilder.Entity<OrderOutbox>().HasOne<PurchaseOrder>().WithMany().HasForeignKey(x=>x.OrderId).OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<PurchaseOrder>().HasQueryFilter(x=>OrganizationId.HasValue && x.OrganizationId==OrganizationId.Value);
            modelBuilder.Entity<Supplier>().HasQueryFilter(x=>OrganizationId.HasValue && x.OrganizationId==OrganizationId.Value);
            modelBuilder.Entity<Warehouse>().HasQueryFilter(x=>OrganizationId.HasValue && x.OrganizationId==OrganizationId.Value);
            modelBuilder.Entity<Inventory>().HasQueryFilter(x=>OrganizationId.HasValue && x.OrganizationId==OrganizationId.Value);
            modelBuilder.Entity<PurchaseOrderItem>().HasOne<PurchaseOrder>().WithMany().HasForeignKey(x=>x.PurchaseOrderId).HasConstraintName("purchase_item_order_fk").OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<PurchaseOrderItem>().HasOne<Product>().WithMany().HasForeignKey(x=>x.ProductId).HasConstraintName("purchase_item_product_fk").OnDelete(DeleteBehavior.Restrict);
            modelBuilder.Entity<Product>().HasQueryFilter(x=>OrganizationId.HasValue && x.OrganizationId==OrganizationId.Value);
            modelBuilder.Entity<PurchaseOrder>().HasIndex(x=>new{x.OrganizationId,x.IdempotencyKey}).IsUnique();
            // Organization identity comes exclusively from the verified server session.
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
