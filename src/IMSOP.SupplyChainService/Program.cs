using IMSOP.Common;
using Azure.Messaging.ServiceBus;
using IMSOP.SupplyChainService.Data;
using Microsoft.EntityFrameworkCore;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
IMSOP.SupplyChainService.OrderTransportSettings.Resolve(builder.Configuration,builder.Environment.IsDevelopment());
builder.Logging.ClearProviders();
builder.Logging.AddJsonConsole();
builder.Logging.AddFilter("Microsoft.EntityFrameworkCore.Database.Command", LogLevel.Warning);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();

var configuredJwtSecret = builder.Configuration["JWT_SECRET"];
if (!builder.Environment.IsDevelopment() && string.IsNullOrWhiteSpace(configuredJwtSecret)) throw new InvalidOperationException("JWT_SECRET is required.");
var jwtSecret = configuredJwtSecret ?? "development-only-change-me-32-characters";
if (jwtSecret.Length < 32) throw new InvalidOperationException("JWT_SECRET must contain at least 32 characters.");
builder.Services.AddAuthentication(JwtBearerDefaults.AuthenticationScheme).AddJwtBearer(options =>
{
    options.TokenValidationParameters = new TokenValidationParameters
    {
        ValidateIssuer = true, ValidIssuer = "imsop-api", ValidateAudience = true, ValidAudience = "imsop-web",
        ValidateIssuerSigningKey = true, IssuerSigningKey = new SymmetricSecurityKey(Encoding.UTF8.GetBytes(jwtSecret)), ValidateLifetime = true,
        ClockSkew = TimeSpan.FromSeconds(30)
    };
    options.Events = new JwtBearerEvents
    {
        OnTokenValidated = SessionBoundary.Validate,
        OnChallenge = SessionBoundary.Challenge,
        OnMessageReceived = context =>
        {
            if (!context.Request.Headers.ContainsKey("Authorization")) context.Token = context.Request.Cookies["imsop_access"];
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

var allowedOrigins = SessionBoundary.ResolveAllowedOrigins(builder.Configuration, !builder.Environment.IsDevelopment());

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

builder.Services.AddHttpContextAccessor();
builder.Services.AddHostedService<IMSOP.SupplyChainService.OrderDispatcher>();
builder.Services.AddSingleton<IMSOP.SupplyChainService.IOrderTransport,IMSOP.SupplyChainService.OrderTransport>();
builder.Services.AddHttpClient("order-transport", client => client.Timeout=TimeSpan.FromSeconds(15));

builder.Services.AddHttpClient("session-boundary", client => client.Timeout = TimeSpan.FromSeconds(3));
var app = builder.Build();
app.UseImsopBoundary(allowedOrigins);

var autoMigrate = app.Configuration.GetValue("Database:AutoMigrate", false);
if (autoMigrate)
{
    using var scope = app.Services.CreateScope();
    var db = scope.ServiceProvider.GetRequiredService<ApplicationDbContext>();
    db.Database.OpenConnection();
    try {
        db.Database.ExecuteSqlRaw("SELECT pg_advisory_lock(491697,2)");
        db.Database.Migrate();
    } finally {
        db.Database.ExecuteSqlRaw("SELECT pg_advisory_unlock(491697,2)");
        db.Database.CloseConnection();
    }
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/version", () => Results.Ok(ReleaseIdentity.Current)).AllowAnonymous();
app.MapGet("/health", () => Results.Ok(new { status = "ok", release = ReleaseIdentity.Current, service = "IMSOP.SupplyChainService" })).AllowAnonymous();
app.MapGet("/ready", async (ApplicationDbContext db, CancellationToken cancellationToken) =>
{
    var applied=await db.Database.GetAppliedMigrationsAsync(cancellationToken);
    var canConnect=applied.Contains("202610270002_PurchaseReceiving");
    return canConnect
        ? Results.Ok(new { status = "ready", service = "IMSOP.SupplyChainService" })
        : Results.Json(new { status = "not-ready", service = "IMSOP.SupplyChainService" }, statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();
app.MapControllers();

app.Run();
