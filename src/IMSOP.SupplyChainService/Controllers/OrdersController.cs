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
        private readonly ILogger<OrdersController> _logger;

        public OrdersController(
            ApplicationDbContext context,
            ServiceBusClient serviceBusClient,
            IConfiguration configuration,
            ILogger<OrdersController> logger)
        {
            _context = context;
            _serviceBusClient = serviceBusClient;
            _configuration = configuration;
            _logger = logger;
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
            var serviceBusEnabled = _configuration.GetValue("ServiceBus:Enabled", false);
            if (serviceBusEnabled)
            {
                var queueName = _configuration["ServiceBus:OrderQueueName"];
                if (string.IsNullOrWhiteSpace(queueName))
                {
                    _logger.LogWarning("ServiceBus is enabled, but ServiceBus:OrderQueueName is not configured.");
                }
                else
                {
                    try
                    {
                        var sender = _serviceBusClient.CreateSender(queueName);
                        var messageBody = JsonConvert.SerializeObject(order);
                        var message = new ServiceBusMessage(messageBody);
                        await sender.SendMessageAsync(message);
                    }
                    catch (Exception ex)
                    {
                        _logger.LogWarning(ex, "Failed to enqueue purchase order {OrderId} to Service Bus.", order.Id);
                    }
                }
            }

            return Ok(new ApiResponse<PurchaseOrder> { Success = true, Data = order });
        }
    }
}
