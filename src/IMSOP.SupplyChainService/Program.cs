using Azure.Messaging.ServiceBus;
using IMSOP.SupplyChainService.Data;
using Microsoft.EntityFrameworkCore;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var jwtSecret = builder.Configuration["JWT_SECRET"] ?? "development-only-change-me-32-characters";
if (!builder.Environment.IsDevelopment() && jwtSecret.Length < 32) throw new InvalidOperationException("JWT_SECRET must contain at least 32 characters.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options => options.TokenValidationParameters = new TokenValidationParameters
{
    ValidateIssuer = true, ValidIssuer = "imsop-api", ValidateAudience = true, ValidAudience = "imsop-web",
    ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)), ValidateLifetime = true,
    ClockSkew = TimeSpan.FromSeconds(30)
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

var allowedOrigins = builder.Configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
    ?? builder.Configuration["CORS_ALLOWED_ORIGINS"]?
        .Split(',', StringSplitOptions.RemoveEmptyEntries | StringSplitOptions.TrimEntries)
    ??
    [
        "http://localhost:3000",
        "http://127.0.0.1:3000",
        "http://localhost:5173",
        "http://127.0.0.1:5173",
        "http://localhost:4200",
        "http://127.0.0.1:4200"
    ];

builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy.WithOrigins(allowedOrigins)
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

builder.Services.AddDbContext<ApplicationDbContext>(options =>
{
    var conn = builder.Configuration.GetConnectionString("DefaultConnection")
        ?? "Host=localhost;Port=5432;Database=postgres;Username=postgres;Password=postgres";
    options.UseNpgsql(conn);
});

var serviceBusConn = builder.Configuration["ServiceBus:ConnectionString"]
    ?? "Endpoint=sb://localhost/;SharedAccessKeyName=RootManageSharedAccessKey;SharedAccessKey=AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA=";
builder.Services.AddSingleton(new ServiceBusClient(serviceBusConn));

var app = builder.Build();

var autoEnsureCreated = app.Configuration.GetValue("Database:AutoEnsureCreated", false);
if (autoEnsureCreated)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.EnsureCreated();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "IMSOP.SupplyChainService" })).AllowAnonymous();
app.MapGet("/ready", async (ApplicationDbContext db, CancellationToken cancellationToken) =>
{
    var canConnect = await db.Database.CanConnectAsync(cancellationToken);
    return canConnect
        ? Results.Ok(new { status = "ready", service = "IMSOP.SupplyChainService" })
        : Results.Json(new { status = "not-ready", service = "IMSOP.SupplyChainService" }, statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();
app.MapControllers();

app.Run();
