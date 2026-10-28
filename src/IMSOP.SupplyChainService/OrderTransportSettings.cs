using Azure.Messaging.ServiceBus;
using System.Text.Json.Serialization;
namespace IMSOP.SupplyChainService;

public sealed class OrderTransportSettings
{
 public bool Enabled { get; init; }
 public string? Queue { get; init; }
 [JsonIgnore] public string? ConnectionString { get; init; }
 public string? VerificationUrl { get; init; }
 public static OrderTransportSettings Resolve(IConfiguration config, bool development)
 {
  if(!config.GetValue("ServiceBus:Enabled",false))return new();
  var sink=config["Verification:TransportUrl"];
  if(development&&!string.IsNullOrWhiteSpace(sink)) {
   if(!Uri.TryCreate(sink,UriKind.Absolute,out var target)||!new[]{"http","https"}.Contains(target.Scheme)||target.UserInfo.Length>0||target.Fragment.Length>0)
    throw new InvalidOperationException("Invalid isolated order transport endpoint");
   return new(){Enabled=true,VerificationUrl=sink};
  }
  var connection=config["ServiceBus:ConnectionString"];var file=config["ServiceBus:ConnectionStringFile"];
  if(!string.IsNullOrEmpty(connection)&&!string.IsNullOrEmpty(file))throw new InvalidOperationException("Choose one server-side order transport credential source");
  if(!string.IsNullOrEmpty(file)) {
   try {
    if(!Path.IsPathRooted(file)||new FileInfo(file).Length>16384)throw new IOException();
    connection=File.ReadAllText(file).Trim();
   } catch {throw new InvalidOperationException("Order transport credential reference is unavailable");}
  }
  var queue=config["ServiceBus:OrderQueueName"];
  if(string.IsNullOrWhiteSpace(connection)||connection.Contains('\n')||connection.Contains('\r')||string.IsNullOrWhiteSpace(queue)||queue.Length>260||!System.Text.RegularExpressions.Regex.IsMatch(queue,"^[a-zA-Z0-9._/-]+$"))
   throw new InvalidOperationException("Enabled order dispatch requires a server credential and queue name");
  try {
   var parsed=ServiceBusConnectionStringProperties.Parse(connection);
   if(parsed.Endpoint.Scheme!="sb"||string.IsNullOrWhiteSpace(parsed.FullyQualifiedNamespace)||
    string.IsNullOrWhiteSpace(parsed.SharedAccessSignature)&&(string.IsNullOrWhiteSpace(parsed.SharedAccessKeyName)||string.IsNullOrWhiteSpace(parsed.SharedAccessKey))||
    !string.IsNullOrEmpty(parsed.EntityPath)&&parsed.EntityPath!=queue)throw new FormatException();
  }catch {throw new InvalidOperationException("Order transport configuration is invalid");}
  return new(){Enabled=true,Queue=queue,ConnectionString=connection};
 }
}
