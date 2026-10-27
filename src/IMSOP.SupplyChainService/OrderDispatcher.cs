using Azure.Messaging.ServiceBus;
using IMSOP.SupplyChainService.Data;
using Microsoft.EntityFrameworkCore;
namespace IMSOP.SupplyChainService;
// At-least-once transport: stable MessageId permits broker/consumer deduplication after send-before-ack crashes.
public class OrderDispatcher(IServiceScopeFactory scopes,IConfiguration config,IOrderTransport transport,ILogger<OrderDispatcher> logger) : BackgroundService {
 protected override async Task ExecuteAsync(CancellationToken stoppingToken) {
  while(!stoppingToken.IsCancellationRequested) {
   try {await Dispatch(stoppingToken);} catch(OperationCanceledException) when(stoppingToken.IsCancellationRequested){break;} catch{logger.LogError("order_dispatch_worker_failed");}
   await Task.Delay(TimeSpan.FromSeconds(5),stoppingToken);
  }
 }
 public async Task Dispatch(CancellationToken ct) {
  if(!config.GetValue("ServiceBus:Enabled",false))return;
  using var scope=scopes.CreateScope();var db=scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
  await db.Database.ExecuteSqlRawAsync("UPDATE supply_chain.order_outbox SET state='failed' WHERE state='sending' AND attempts>=5 AND lease_until<now()",ct);
  await db.Database.ExecuteSqlRawAsync("UPDATE supply_chain.purchase_orders p SET dispatch_state='failed' FROM supply_chain.order_outbox o WHERE o.order_id=p.id AND o.state='failed' AND p.dispatch_state<>'failed'",ct);
  var rows=await db.OrderOutbox.FromSqlRaw("""
  WITH due AS (SELECT id FROM supply_chain.order_outbox WHERE state IN ('pending','sending','disabled') AND attempts<5 AND next_attempt_at<=now() AND (lease_until IS NULL OR lease_until<now()) ORDER BY next_attempt_at LIMIT 1 FOR UPDATE SKIP LOCKED)
  UPDATE supply_chain.order_outbox o SET state='sending',attempts=attempts+1,lease_until=now()+interval '120 seconds' FROM due WHERE o.id=due.id RETURNING o.*
  """).ToListAsync(ct);
  foreach(var row in rows) {
   try {
    await transport.Send(row.OrderId,row.Body,ct);
    row.State="sent";
   } catch(OperationCanceledException) when(ct.IsCancellationRequested){throw;} catch{row.State=row.Attempts>=5?"failed":"pending";row.NextAttemptAt=DateTime.UtcNow.AddSeconds(30*Math.Pow(2,row.Attempts));logger.LogWarning("order_dispatch_failed {MessageId} {Attempt} {State}",row.OrderId,row.Attempts,row.State);}
   row.LeaseUntil=null;
   await using var tx=await db.Database.BeginTransactionAsync(ct);
   await db.SaveChangesAsync(ct);
   await db.Database.ExecuteSqlInterpolatedAsync($"UPDATE supply_chain.purchase_orders SET dispatch_state={row.State} WHERE id={row.OrderId}",ct);
   await tx.CommitAsync(ct);
  }
 }
}
