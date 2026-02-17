using Azure.Messaging.ServiceBus;
using IMSOP.SupplyChainService.Data;
using Microsoft.EntityFrameworkCore;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    var conn = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=imsop;Username=postgres;Password=postgres";
    options.UseNpgsql(conn);
});

var serviceBusConn = builder.Configuration["ServiceBus:ConnectionString"] ?? "Endpoint=sb://placeholder/";
builder.Services.AddSingleton(new ServiceBusClient(serviceBusConn));

var app = builder.Build();

app.MapControllers();

app.Run();
