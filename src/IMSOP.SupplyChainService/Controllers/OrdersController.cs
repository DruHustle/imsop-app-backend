using Microsoft.AspNetCore.Mvc;
using IMSOP.Common.Models;
using IMSOP.SupplyChainService.Entities;
using IMSOP.SupplyChainService.Data;
using Azure.Messaging.ServiceBus;
using Newtonsoft.Json;

namespace IMSOP.SupplyChainService.Controllers
{
    [ApiController]
    [Route("api/v1/[controller]")]
    public class OrdersController : ControllerBase
    {
        private readonly ApplicationDbContext _context;
        private readonly ServiceBusClient _serviceBusClient;
        private readonly IConfiguration _configuration;

        public OrdersController(ApplicationDbContext context, ServiceBusClient serviceBusClient, IConfiguration configuration)
        {
            _context = context;
            _serviceBusClient = serviceBusClient;
            _configuration = configuration;
        }

        [HttpPost]
        public async Task<ActionResult<ApiResponse<PurchaseOrder>>> CreateOrder([FromBody] PurchaseOrder order)
        {
            // 1. Intake & Validation (Simplified for brevity)
            if (!ModelState.IsValid)
            {
                return BadRequest(new ApiResponse<PurchaseOrder> 
                { 
                    Success = false, 
                    Error = new ApiError { Code = "VALIDATION_ERROR", Message = "Invalid order data" } 
                });
            }

            // 2. Save to Database
            order.Status = "draft";
            _context.PurchaseOrders.Add(order);
            await _context.SaveChangesAsync();

            // 3. Decoupling & Queuing (Azure Service Bus)
            var sender = _serviceBusClient.CreateSender(_configuration["ServiceBus:OrderQueueName"]);
            var messageBody = JsonConvert.SerializeObject(order);
            var message = new ServiceBusMessage(messageBody);
            await sender.SendMessageAsync(message);

            return Ok(new ApiResponse<PurchaseOrder> { Success = true, Data = order });
        }
    }
}
