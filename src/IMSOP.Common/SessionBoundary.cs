using System.Net.Http.Json;
using System.Security.Claims;
using System.Text.Json;
using Microsoft.AspNetCore.Authentication.JwtBearer;
using Microsoft.AspNetCore.Builder;
using Microsoft.AspNetCore.Http;
using Microsoft.Extensions.DependencyInjection;
using Microsoft.Extensions.Logging;
using Microsoft.Extensions.Configuration;

namespace IMSOP.Common;
public static class SessionBoundary
{
 public static string[] ResolveAllowedOrigins(IConfiguration configuration,bool production)
 {
  var origins=(configuration["CORS_ALLOWED_ORIGINS"]??configuration["ALLOWED_ORIGIN"])?
      .Split(',',StringSplitOptions.RemoveEmptyEntries|StringSplitOptions.TrimEntries)
   ?? configuration.GetSection("Cors:AllowedOrigins").Get<string[]>()
   ?? (production?[]:new[]{"http://localhost:3000","http://127.0.0.1:3000","http://localhost:5173","http://127.0.0.1:5173","http://localhost:4200","http://127.0.0.1:4200"});
  origins=origins.Select(origin=>origin.Trim().TrimEnd('/')).ToArray();
  if(origins.Length==0||origins.Any(origin=>!Uri.TryCreate(origin,UriKind.Absolute,out var uri)
   || !new[]{"http","https"}.Contains(uri.Scheme) || uri.UserInfo.Length>0 || uri.AbsolutePath!="/" || uri.Query.Length>0 || uri.Fragment.Length>0
   || production&&uri.Scheme!="https"))throw new InvalidOperationException("Configure explicit valid HTTPS frontend origins for production.");
  return origins.Distinct(StringComparer.Ordinal).ToArray();
 }
 public static async Task Validate(TokenValidatedContext context)
 {
  try {
   var config=context.HttpContext.RequestServices.GetRequiredService<Microsoft.Extensions.Configuration.IConfiguration>();
   var origin=config["NODE_API_URL"] ?? "http://127.0.0.1:3001";
   if(!origin.StartsWith("http")) origin="http://"+origin;
   using var request=new HttpRequestMessage(HttpMethod.Get,origin.TrimEnd('/')+"/api/auth/session");
   var token=context.Request.Headers.Authorization.ToString();
   if(!string.IsNullOrEmpty(token)) request.Headers.TryAddWithoutValidation("Authorization",token);
   else request.Headers.TryAddWithoutValidation("Cookie","imsop_access="+context.Request.Cookies["imsop_access"]);
   request.Headers.TryAddWithoutValidation("X-Request-ID",context.HttpContext.TraceIdentifier);
   var factory=context.HttpContext.RequestServices.GetRequiredService<IHttpClientFactory>();
   using var response=await factory.CreateClient("session-boundary").SendAsync(request,context.HttpContext.RequestAborted);
   if(!response.IsSuccessStatusCode) { if(response.StatusCode != System.Net.HttpStatusCode.Unauthorized) context.HttpContext.Items["session-unavailable"]=true; context.Fail("Session is expired or unavailable"); return; }
   var session=await response.Content.ReadFromJsonAsync<JsonElement>();
   var identity=(ClaimsIdentity)context.Principal!.Identity!;
   foreach(var claim in identity.FindAll(ClaimTypes.Role).ToArray()) identity.RemoveClaim(claim);
   foreach(var type in new[]{"workspace_id","organization_id"}) foreach(var claim in identity.FindAll(type).ToArray()) identity.RemoveClaim(claim);
   identity.AddClaim(new Claim(ClaimTypes.Role,session.GetProperty("role").GetString()!));
   if(session.GetProperty("workspaceId").ValueKind==JsonValueKind.String) identity.AddClaim(new Claim("workspace_id",session.GetProperty("workspaceId").GetString()!));
   if(session.GetProperty("organizationId").ValueKind==JsonValueKind.String) identity.AddClaim(new Claim("organization_id",session.GetProperty("organizationId").GetString()!));
  } catch { context.HttpContext.Items["session-unavailable"]=true; context.Fail("Session verification unavailable"); }
 }
 public static async Task Challenge(JwtBearerChallengeContext context) {
  if(context.HttpContext.Items.ContainsKey("session-unavailable")) {
   context.HandleResponse();context.Response.StatusCode=503;
   await context.Response.WriteAsJsonAsync(new {error="Session verification temporarily unavailable",code="SESSION_UNAVAILABLE"});
  }
 }
 public static void UseImsopBoundary(this WebApplication app, string[] allowedOrigins)
 {
  app.Use(async (context,next)=> {
   var candidate=context.Request.Headers["X-Request-ID"].ToString();
   context.TraceIdentifier=System.Text.RegularExpressions.Regex.IsMatch(candidate,"^[a-zA-Z0-9-]{8,64}$") ? candidate : Guid.NewGuid().ToString();
   context.Request.Headers["X-Request-ID"]=context.TraceIdentifier;
   context.Response.Headers["X-Request-ID"]=context.TraceIdentifier;
   context.Response.OnStarting(()=>{context.Response.Headers["X-Request-ID"]=context.TraceIdentifier;return Task.CompletedTask;});
   var watch=System.Diagnostics.Stopwatch.StartNew();
   if(context.Request.Cookies.ContainsKey("imsop_access") && !context.Request.Headers.ContainsKey("Authorization") && !new[]{"GET","HEAD","OPTIONS"}.Contains(context.Request.Method)
    && !allowedOrigins.Contains(context.Request.Headers.Origin.ToString())) {
    context.Response.StatusCode=403; await context.Response.WriteAsJsonAsync(new { error="Cross-site session request blocked" }); return;
   }
   await next();
   app.Logger.LogInformation("request {CorrelationId} {Method} {Status} {DurationMs}",context.TraceIdentifier,context.Request.Method,context.Response.StatusCode,watch.ElapsedMilliseconds);
  });
 }
}
