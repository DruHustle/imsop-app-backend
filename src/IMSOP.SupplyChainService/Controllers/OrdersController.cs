using Microsoft.AspNetCore.Mvc;
using Microsoft.AspNetCore.Authorization;
using Microsoft.EntityFrameworkCore;
using IMSOP.SupplyChainService.Data;
using IMSOP.SupplyChainService.Entities;
using IMSOP.Common.Models;
using System.ComponentModel.DataAnnotations;
using System.Security.Cryptography;
using System.Text;
using System.Text.Json;
using System.Text.Json.Serialization;
namespace IMSOP.SupplyChainService.Controllers;
[JsonUnmappedMemberHandling(JsonUnmappedMemberHandling.Disallow)]
public class CreateOrderRequest {
 public Guid SupplierId {get;set;}
 [Required,MaxLength(100)] public string OrderNumber {get;set;}="";
 [Range(typeof(decimal),"0.01","79228162514264337593543950335",ParseLimitsInInvariantCulture=true)] public decimal TotalAmount {get;set;}
}
[ApiController,Authorize(Roles="admin,engineer,analyst"),Route("api/v1/[controller]")]
public class OrdersController(ApplicationDbContext context,IConfiguration config) : ControllerBase {
 [HttpPost,Authorize(Roles="admin,engineer")]
 public async Task<ActionResult<ApiResponse<PurchaseOrder>>> CreateOrder([FromBody] CreateOrderRequest request,[FromHeader(Name="Idempotency-Key")] string? key,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  if(string.IsNullOrWhiteSpace(key)||key.Length>100||!System.Text.RegularExpressions.Regex.IsMatch(key,"^[a-zA-Z0-9_-]+$")||string.IsNullOrWhiteSpace(request.OrderNumber))return BadRequest(new{error="A stable Idempotency-Key and order number are required"});
  if(!await context.Suppliers.AnyAsync(s=>s.Id==request.SupplierId && s.Status=="active",ct))return BadRequest(new{error="Choose an active supplier in your organization"});
  var hash=Convert.ToHexString(SHA256.HashData(Encoding.UTF8.GetBytes(JsonSerializer.Serialize(request))));
  await using var tx=await context.Database.BeginTransactionAsync(ct);
  var lockIdentity=$"{context.OrganizationId}:{key}";
  await context.Database.ExecuteSqlInterpolatedAsync($"SELECT pg_advisory_xact_lock(hashtextextended({lockIdentity},0))",ct);
  var prior=await context.PurchaseOrders.SingleOrDefaultAsync(o=>o.IdempotencyKey==key,ct);
  if(prior!=null){if(prior.RequestHash!=hash)return Conflict(new{error="Idempotency-Key was used for different content"});await tx.CommitAsync(ct);return Ok(new ApiResponse<PurchaseOrder>{Success=true,Data=prior});}
  var enabled=config.GetValue("ServiceBus:Enabled",false);
  var order=new PurchaseOrder{OrganizationId=context.OrganizationId.Value,SupplierId=request.SupplierId,OrderNumber=request.OrderNumber.Trim(),TotalAmount=request.TotalAmount,Status="draft",IdempotencyKey=key,RequestHash=hash,DispatchState=enabled?"pending":"disabled"};
  context.PurchaseOrders.Add(order);
  context.OrderOutbox.Add(new OrderOutbox{OrderId=order.Id,State=order.DispatchState,Body=JsonSerializer.Serialize(new{contractVersion=2,messageId=order.Id,orderId=order.Id,organizationId=order.OrganizationId,supplierId=order.SupplierId,order.OrderNumber,order.TotalAmount})});
  await context.SaveChangesAsync(ct);await tx.CommitAsync(ct);
  return CreatedAtAction(nameof(GetOrder),new{id=order.Id},new ApiResponse<PurchaseOrder>{Success=true,Data=order});
 }
 [HttpGet("{id:guid}")]
 public async Task<ActionResult<ApiResponse<PurchaseOrder>>> GetOrder(Guid id,CancellationToken ct) {
  if(!context.OrganizationId.HasValue)return Forbid();
  var order=await context.PurchaseOrders.SingleOrDefaultAsync(o=>o.Id==id,ct);
  return order==null?NotFound(new ApiResponse<PurchaseOrder>{Success=false,Error=new ApiError{Code="ORDER_NOT_FOUND",Message="Order not found"}}):Ok(new ApiResponse<PurchaseOrder>{Success=true,Data=order});
 }
 [HttpGet("suppliers")]
 public async Task<IActionResult> Suppliers(CancellationToken ct)=>!context.OrganizationId.HasValue?Forbid():Ok(await context.Suppliers.OrderBy(s=>s.Name).Take(100).Select(s=>new{s.Id,s.Name,s.Status}).ToListAsync(ct));
 [HttpGet("products")]
 public async Task<IActionResult> Products(CancellationToken ct)=>!context.OrganizationId.HasValue?Forbid():Ok(await context.Products.OrderBy(s=>s.Name).Take(100).Select(s=>new{s.Id,s.Name,s.Sku,s.UnitPrice}).ToListAsync(ct));
}
