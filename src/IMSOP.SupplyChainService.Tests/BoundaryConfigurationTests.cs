using IMSOP.Common;
using Microsoft.Extensions.Configuration;
using Xunit;
namespace IMSOP.SupplyChainService.Tests;
public class BoundaryConfigurationTests
{
 [Fact]
 public void PublicReleaseAdvertisesTheImplementedOptionalAdapterContract()
 {
  using var release=System.Text.Json.JsonDocument.Parse(System.Text.Json.JsonSerializer.Serialize(ReleaseIdentity.Current));
  Assert.Contains("optional-adapters-v1",release.RootElement.GetProperty("capabilities").EnumerateArray().Select(value=>value.GetString()));
  Assert.Equal(2,release.RootElement.GetProperty("apiContract").GetInt32());
 }
 [Fact]
 public void ProductionRejectsMissingOrDevelopmentOriginFallbacks()
 {
  var empty=new ConfigurationBuilder().Build();
  Assert.Throws<InvalidOperationException>(()=>SessionBoundary.ResolveAllowedOrigins(empty,true));
  var insecure=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"ALLOWED_ORIGIN","http://localhost:5173"}}).Build();
  Assert.Throws<InvalidOperationException>(()=>SessionBoundary.ResolveAllowedOrigins(insecure,true));
  Assert.NotEmpty(SessionBoundary.ResolveAllowedOrigins(empty,false));
 }
 [Fact]
 public void FirstPartyProductionOriginIsExplicitAndNormalizedAcrossServices()
 {
  var config=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"ALLOWED_ORIGIN","https://imsop.test/"},{"Cors:AllowedOrigins:0","http://localhost:5173"}}).Build();
  Assert.Equal(new[]{"https://imsop.test"},SessionBoundary.ResolveAllowedOrigins(config,true));
  var invalid=new ConfigurationBuilder().AddInMemoryCollection(new Dictionary<string,string?>{{"CORS_ALLOWED_ORIGINS","https://imsop.test/private"}}).Build();
  Assert.Throws<InvalidOperationException>(()=>SessionBoundary.ResolveAllowedOrigins(invalid,true));
 }
}
