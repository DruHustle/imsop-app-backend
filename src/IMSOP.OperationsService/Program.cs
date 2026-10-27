using IMSOP.Common;
using System.Text;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Authorization;
using Microsoft.IdentityModel.Tokens;

var builder = WebApplication.CreateBuilder(args);
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

builder.Services.AddHttpClient("session-boundary", client => client.Timeout = TimeSpan.FromSeconds(3));
var app = builder.Build();
app.UseImsopBoundary(allowedOrigins);

app.UseCors("Frontend");
app.UseAuthentication();
app.UseAuthorization();

app.MapGet("/version", () => Results.Ok(ReleaseIdentity.Current)).AllowAnonymous();
app.MapGet("/health", () => Results.Ok(new { status = "ok", release = ReleaseIdentity.Current, service = "IMSOP.OperationsService" })).AllowAnonymous();
app.MapControllers();

app.Run();
