using System.ComponentModel.DataAnnotations.Schema;
namespace IMSOP.SupplyChainService.Entities;
[Table("order_outbox")]
public class OrderOutbox {
 [Column("id")] public Guid Id {get;set;}=Guid.NewGuid();
 [Column("order_id")] public Guid OrderId {get;set;}
 [Column("body")] public string Body {get;set;}="";
 [Column("state")] public string State {get;set;}="pending";
 [Column("attempts")] public int Attempts {get;set;}
 [Column("next_attempt_at")] public DateTime NextAttemptAt {get;set;}=DateTime.UtcNow;
 [Column("lease_until")] public DateTime? LeaseUntil {get;set;}
}
