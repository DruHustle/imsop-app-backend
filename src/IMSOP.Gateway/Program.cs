using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;
using Yarp.ReverseProxy.Configuration;

var builder = WebApplication.CreateBuilder(args);

builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

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
        OnMessageReceived = context =>
        {
            if (string.IsNullOrEmpty(context.Token)) context.Token = context.Request.Cookies["imsop_access"];
            return Task.CompletedTask;
        }
    };
});
builder.Services.AddAuthorization(options => options.FallbackPolicy = new AuthorizationPolicyBuilder().RequireAuthenticatedUser().Build());

static string ServiceAddress(IConfiguration configuration, string key, string fallback)
{
    var value = configuration[key] ?? fallback;
    if (!value.StartsWith("http://", StringComparison.OrdinalIgnoreCase) &&
        !value.StartsWith("https://", StringComparison.OrdinalIgnoreCase))
    {
        value = $"http://{value}";
    }

    return value.EndsWith('/') ? value : $"{value}/";
}

var nodeApiAddress = ServiceAddress(builder.Configuration, "NODE_API_URL", "127.0.0.1:3001");
var operationsAddress = ServiceAddress(builder.Configuration, "OPERATIONS_SERVICE_URL", "127.0.0.1:5101");
var supplyChainAddress = ServiceAddress(builder.Configuration, "SUPPLY_CHAIN_SERVICE_URL", "127.0.0.1:5102");

var routes = new[]
{
    new RouteConfig
    {
        RouteId = "supply-chain",
        ClusterId = "supply-chain",
        Order = 1,
        Match = new RouteMatch { Path = "/supply-chain/{**catch-all}" },
        Transforms = [new Dictionary<string, string> { ["PathRemovePrefix"] = "/supply-chain" }]
    },
    new RouteConfig
    {
        RouteId = "operations-service",
        ClusterId = "operations-service",
        Order = 2,
        Match = new RouteMatch { Path = "/operations-service/{**catch-all}" },
        Transforms = [new Dictionary<string, string> { ["PathRemovePrefix"] = "/operations-service" }]
    },
    new RouteConfig
    {
        RouteId = "node-api",
        ClusterId = "node-api",
        Order = 100,
        Match = new RouteMatch { Path = "{**catch-all}" }
    }
};

var clusters = new[]
{
    new ClusterConfig
    {
        ClusterId = "node-api",
        Destinations = new Dictionary<string, DestinationConfig> { ["primary"] = new() { Address = nodeApiAddress } }
    },
    new ClusterConfig
    {
        ClusterId = "operations-service",
        Destinations = new Dictionary<string, DestinationConfig> { ["primary"] = new() { Address = operationsAddress } }
    },
    new ClusterConfig
    {
        ClusterId = "supply-chain",
        Destinations = new Dictionary<string, DestinationConfig> { ["primary"] = new() { Address = supplyChainAddress } }
    }
};

builder.Services.AddReverseProxy().LoadFromMemory(routes, clusters);
builder.Services.AddHttpClient("readiness", client => client.Timeout = TimeSpan.FromSeconds(3));

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

var app = builder.Build();

if (app.Environment.IsDevelopment())
{
    app.UseSwagger();
    app.UseSwaggerUI();
}

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/health", () => Results.Ok(new { status = "ok", service = "IMSOP.Gateway" })).AllowAnonymous();
app.MapGet("/ready", async (IHttpClientFactory clients, CancellationToken cancellationToken) =>
{
    var client = clients.CreateClient("readiness");
    var dependencies = new[]
    {
        (Name: "node-api", Url: new Uri(new Uri(nodeApiAddress), "ready")),
        (Name: "operations-service", Url: new Uri(new Uri(operationsAddress), "health")),
        (Name: "supply-chain", Url: new Uri(new Uri(supplyChainAddress), "ready"))
    };

    var checks = await Task.WhenAll(dependencies.Select(async dependency =>
    {
        try
        {
            using var response = await client.GetAsync(dependency.Url, cancellationToken);
            return new { dependency.Name, Healthy = response.IsSuccessStatusCode };
        }
        catch
        {
            return new { dependency.Name, Healthy = false };
        }
    }));

    return checks.All(check => check.Healthy)
        ? Results.Ok(new { status = "ready", dependencies = checks })
        : Results.Json(new { status = "not-ready", dependencies = checks }, statusCode: StatusCodes.Status503ServiceUnavailable);
}).AllowAnonymous();
app.MapControllers();
app.MapReverseProxy().AllowAnonymous();

app.Run();
