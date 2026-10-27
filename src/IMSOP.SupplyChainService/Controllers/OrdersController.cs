using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using IMSOP.SupplyChainService.Data;
using IMSOP.SupplyChainService.Entities;
using IMSOP.Common.Models;
using System.ComponentModel.DataAnnotations;
using System.Globalization;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace IMSOP.SupplyChainService.Controllers;

[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class OrderLineRequest {
 public Guid ProductId {get;set;}
 [Range(1,1000000)] public int Quantity {get;set;}
 [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
 [Range(typeof(decimal),"0.0001","1000000000000",ParseLimitsInInvariantCulture=true)] public decimal UnitPrice {get;set;}
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class CreateOrderRequest {
 public Guid SupplierId {get;set;}
 [Required,MaxLength(100)] public string OrderNumber {get;set;}="";
 [JsonNumberHandling(JsonNumberHandling.AllowReadingFromString)]
 [Range(typeof(decimal),"0.01","1000000000000000",ParseLimitsInInvariantCulture=true)] public decimal? TotalAmount {get;set;}
 [RegularExpression("^[A-Z]{3}$")] public string? Currency {get;set;}
 [MaxLength(100)] public List<OrderLineRequest>? Items {get;set;}
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class ReceiptLineRequest {
 public Guid ItemId {get;set;}
 [Range(1,1000000)] public int Quantity {get;set;}
}
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class ReceiveOrderRequest {
 public Guid WarehouseId {get;set;}
 public DateTimeOffset ReceivedAt {get;set;}
 [Required,MaxLength(2000)] public string Note {get;set;}="";
 [Required,MinLength(1),MaxLength(100)] public List<ReceiptLineRequest> Items {get;set;}=[];
}
public class ReceiptIdentity { public Guid Id {get;set;} public string RequestHash {get;set;}=""; }

[ApiController,Authorize(Roles="admin,engineer,analyst"),Route("api/v1/[controller]")]
public class OrdersController(ApplicationDbContext context,IConfiguration config) : ControllerBase {
 static string Hash(object value)=>Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(value))));
 static bool ValidKey(string? key)=>key is {Length:>0 and <=100} && System.Text.RegularExpressions.Regex.IsMatch(key,"^[a-zA-Z0-9_-]+$");
 static string Money(decimal value)=>value.ToString(CultureInfo.InvariantCulture);

 [HttpPost,Authorize(Roles="admin,engineer")]
 public async Task<ActionResult<ApiResponse<PurchaseOrder>>> CreateOrder([FromBody] CreateOrderRequest request,[FromHeader(Name="Idempotency-Key")] string? key,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  if(!ValidKey(key)||string.IsNullOrWhiteSpace(request.OrderNumber))return BadRequest(new{error="A stable Idempotency-Key and order number are required"});
  var hash=Hash(request);
  await using var tx=await context.Database.BeginTransactionAsync(ct);
  var lockIdentity=$"{context.OrganizationId}:{key}";
  await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockIdentity},0))",ct);
  var prior=await context.PurchaseOrders.SingleOrDefaultAsync(o=>o.IdempotencyKey==key,ct);
  if(prior!=null){if(prior.RequestHash!=hash)return Conflict(new{error="Idempotency-Key was used for different content"});await tx.CommitAsync(ct);return Ok(new ApiResponse<PurchaseOrder>{Success=true,Data=prior});}
  if(!await context.Suppliers.AnyAsync(s=>s.Id==request.SupplierId && s.Status=="active",ct))return BadRequest(new{error="Choose an active supplier in your organization"});
  decimal total;
  if(request.Items is not null) {
   if(request.Items.Count==0||request.Currency is null||request.Items.Select(i=>i.ProductId).Distinct().Count()!=request.Items.Count)return BadRequest(new{error="Choose distinct products and supply the source currency"});
   var ids=request.Items.Select(i=>i.ProductId).ToArray();
   if(await context.Products.CountAsync(p=>ids.Contains(p.Id),ct)!=ids.Length)return BadRequest(new{error="Choose products in your organization"});
   total=request.Items.Sum(i=>i.Quantity*i.UnitPrice);
   if(total<0.01m||total>1000000000000000m||(request.TotalAmount.HasValue&&request.TotalAmount.Value!=total))return BadRequest(new{error="The total must match the exact item amounts"});
  } else {
   if(!request.TotalAmount.HasValue)return BadRequest(new{error="Supply items or a source total"});
   total=request.TotalAmount.Value;
  }
  var enabled=config.GetValue("ServiceBus:Enabled",false);
  var order=new PurchaseOrder{OrganizationId=context.OrganizationId.Value,SupplierId=request.SupplierId,OrderNumber=request.OrderNumber.Trim(),TotalAmount=total,Currency=request.Currency,Status="draft",IdempotencyKey=key,RequestHash=hash,DispatchState=enabled?"pending":"disabled"};
  var referenceLock=$"{context.OrganizationId}:reference:{order.OrderNumber}";
  await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({referenceLock},0))",ct);
  if(await context.PurchaseOrders.AnyAsync(o=>o.OrderNumber==order.OrderNumber,ct))return Conflict(new{error="This purchase reference already exists; review the saved order before retrying"});
  context.PurchaseOrders.Add(order);
  var lines=request.Items?.Select(i=>new PurchaseOrderItem{PurchaseOrderId=order.Id,ProductId=i.ProductId,Quantity=i.Quantity,UnitPrice=i.UnitPrice}).ToList()??[];
  context.PurchaseOrderItems.AddRange(lines);
  context.OrderOutbox.Add(new OrderOutbox{OrderId=order.Id,State=order.DispatchState,Body=JsonSerializer.Serialize(new{contractVersion=3,messageId=order.Id,orderId=order.Id,organizationId=order.OrganizationId,supplierId=order.SupplierId,order.OrderNumber,totalAmount=Money(order.TotalAmount),order.Currency,items=lines.Select(i=>new{i.ProductId,i.Quantity,unitPrice=Money(i.UnitPrice)})})});
  await context.SaveChangesAsync(ct);await tx.CommitAsync(ct);
  return CreatedAtAction(nameof(GetOrder),new{id=order.Id},new ApiResponse<PurchaseOrder>{Success=true,Data=order});
 }
 [HttpGet("{id:guid}")]
 public async Task<ActionResult<ApiResponse<PurchaseOrder>>> GetOrder(Guid id,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  var order=await context.PurchaseOrders.SingleOrDefaultAsync(o=>o.Id==id,ct);
  return order==null?NotFound(new ApiResponse<PurchaseOrder>{Success=false,Error=new ApiError{Code="ORDER_NOT_FOUND",Message="Order not found"}}):Ok(new ApiResponse<PurchaseOrder>{Success=true,Data=order});
 }
 [HttpGet]
 public async Task<IActionResult> List([FromQuery]int offset=0,CancellationToken ct=default) {
  if(!context.OrganizationId.HasValue)return Forbid();
  if(offset<0||offset>10000)return BadRequest(new{error="Invalid page"});
  var orders=await context.PurchaseOrders.OrderByDescending(o=>o.CreatedAt).ThenBy(o=>o.Id).Skip(offset).Take(50).ToListAsync(ct);
  return Ok(new{items=orders.Select(o=>new{o.Id,o.OrderNumber,o.SupplierId,totalAmount=Money(o.TotalAmount),o.Currency,o.Status,o.DispatchState,o.CreatedAt}),offset,limit=50});
 }
 [HttpGet("{id:guid}/items")]
 public async Task<IActionResult> Items(Guid id,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  if(!await context.PurchaseOrders.AnyAsync(o=>o.Id==id,ct))return NotFound();
  var items=await context.PurchaseOrderItems.Where(i=>i.PurchaseOrderId==id).OrderBy(i=>i.Id).ToListAsync(ct);
  var productIds=items.Select(i=>i.ProductId).Distinct().ToArray();
  if(await context.Products.CountAsync(p=>productIds.Contains(p.Id),ct)!=productIds.Length)return Conflict(new{error="Legacy item ownership needs administrator review"});
  return Ok(items.Select(i=>new{i.Id,i.ProductId,i.Quantity,i.ReceivedQuantity,unitPrice=Money(i.UnitPrice)}));
 }
 [HttpPost("{id:guid}/receipts"),Authorize(Roles="admin,engineer")]
 public async Task<IActionResult> Receive(Guid id,ReceiveOrderRequest request,[FromHeader(Name="Idempotency-Key")]string? key,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  if(!ValidKey(key)||string.IsNullOrWhiteSpace(request.Note)||request.ReceivedAt==default||request.ReceivedAt>DateTimeOffset.UtcNow.AddMinutes(5)||request.Items.Select(i=>i.ItemId).Distinct().Count()!=request.Items.Count)return BadRequest(new{error="Supply a receipt key, observation time, note and distinct item quantities"});
  var org=context.OrganizationId.Value;var hash=Hash(new{id,request});
  await using var tx=await context.Database.BeginTransactionAsync(ct);
  var keyLock=$"{org}:receipt:{key}";
  await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({keyLock},0))",ct);
  var prior=await context.Database.SqlQuery<ReceiptIdentity>($"SELECT id AS \"Id\",request_hash AS \"RequestHash\" FROM supply_chain.purchase_receipts WHERE organization_id={org} AND request_key={key}").SingleOrDefaultAsync(ct);
  if(prior!=null)return prior.RequestHash==hash?Ok(new{receiptId=prior.Id,duplicate=true}):Conflict(new{error="Receipt key was used for different content"});
  var orderLock=$"{org}:order:{id}";
  await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({orderLock},0))",ct);
  var order=await context.PurchaseOrders.SingleOrDefaultAsync(o=>o.Id==id,ct);
  if(order is null)return NotFound();
  if(!await context.Warehouses.AnyAsync(w=>w.Id==request.WarehouseId,ct))return BadRequest(new{error="Choose a warehouse in your organization"});
  var lines=await context.PurchaseOrderItems.Where(i=>i.PurchaseOrderId==id).ToListAsync(ct);
  var productIds=lines.Select(i=>i.ProductId).Distinct().ToArray();
  if(await context.Products.CountAsync(p=>productIds.Contains(p.Id),ct)!=productIds.Length)return Conflict(new{error="Legacy item ownership needs administrator review"});
  foreach(var input in request.Items) {
   var line=lines.SingleOrDefault(i=>i.Id==input.ItemId);
   if(line is null||input.Quantity>line.Quantity-line.ReceivedQuantity)return Conflict(new{error="Receipt exceeds the remaining quantity or item is outside this order"});
  }
  var receipt=Guid.NewGuid();var actor=User.FindFirst("http://schemas.xmlsoap.org/ws/2005/05/identity/claims/nameidentifier")?.Value??User.FindFirst("id")?.Value??"verified-operator";
  await context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO supply_chain.purchase_receipts(id,organization_id,order_id,request_key,request_hash,warehouse_id,received_at,note,actor) VALUES({receipt},{org},{id},{key},{hash},{request.WarehouseId},{request.ReceivedAt.UtcDateTime},{request.Note.Trim()},{actor})",ct);
  foreach(var input in request.Items.OrderBy(i=>lines.Single(l=>l.Id==i.ItemId).ProductId)) {
   var line=lines.Single(i=>i.Id==input.ItemId);var stockLock=$"{org}:stock:{request.WarehouseId}:{line.ProductId}";
   await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({stockLock},0))",ct);
   var stock=await context.Inventories.SingleOrDefaultAsync(i=>i.WarehouseId==request.WarehouseId&&i.ProductId==line.ProductId,ct);
   if(stock is null)context.Inventories.Add(new Inventory{OrganizationId=org,WarehouseId=request.WarehouseId,ProductId=line.ProductId,QuantityOnHand=input.Quantity});
   else stock.QuantityOnHand=checked(stock.QuantityOnHand+input.Quantity);
   line.ReceivedQuantity+=input.Quantity;
   await context.Database.ExecuteSqlInterpolatedAsync($"INSERT INTO supply_chain.purchase_receipt_items(receipt_id,item_id,quantity) VALUES({receipt},{line.Id},{input.Quantity})",ct);
  }
  order.Status=lines.All(i=>i.ReceivedQuantity==i.Quantity)?"received":"partially_received";
  await context.SaveChangesAsync(ct);await tx.CommitAsync(ct);
  return Ok(new{receiptId=receipt,status=order.Status,duplicate=false});
 }
 [HttpGet("suppliers")]
 public async Task<IActionResult> Suppliers(CancellationToken ct)=>!context.OrganizationId.HasValue?Forbid():Ok(await context.Suppliers.OrderBy(s=>s.Name).Take(100).Select(s=>new{s.Id,s.Name,s.Status}).ToListAsync(ct));
 [HttpGet("products")]
 public async Task<IActionResult> Products(CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  var products=await context.Products.OrderBy(s=>s.Name).Take(100).ToListAsync(ct);
  return Ok(products.Select(s=>new{s.Id,s.Name,s.Sku,unitPrice=Money(s.UnitPrice)}));
 }
 [HttpGet("warehouses")]
 public async Task<IActionResult> Warehouses(CancellationToken ct)=>!context.OrganizationId.HasValue?Forbid():Ok(await context.Warehouses.OrderBy(w=>w.Name).Take(100).Select(w=>new{w.Id,w.Name}).ToListAsync(ct));
}
