using Azure.Messaging.ServiceBus;
namespace IMSOP.SupplyChainService;
public interface IOrderTransport { Task Send(Guid messageId,string body,CancellationToken ct); }
public class OrderTransport(IConfiguration config,IHostEnvironment environment,IHttpClientFactory clients) : IOrderTransport {
 public async Task Send(Guid messageId,string body,CancellationToken ct) {
  var testSink=config["Verification:TransportUrl"];
  if(environment.IsDevelopment() && !string.IsNullOrEmpty(testSink)) {
   using var request=new HttpRequestMessage(HttpMethod.Post,testSink){Content=new StringContent(body,System.Text.Encoding.UTF8,"application/json")};
   request.Headers.Add("Idempotency-Key",messageId.ToString());
   using var response=await clients.CreateClient("order-transport").SendAsync(request,ct);response.EnsureSuccessStatusCode();return;
  }
  var queue=config["ServiceBus:OrderQueueName"];var connection=config["ServiceBus:ConnectionString"];
  if(string.IsNullOrWhiteSpace(queue)||string.IsNullOrWhiteSpace(connection))throw new InvalidOperationException("Transport configuration missing");
  await using var client=new ServiceBusClient(connection,new ServiceBusClientOptions{RetryOptions=new ServiceBusRetryOptions{MaxRetries=2,TryTimeout=TimeSpan.FromSeconds(10)}});
  await using var sender=client.CreateSender(queue);
  await sender.SendMessageAsync(new ServiceBusMessage(body){MessageId=messageId.ToString(),ContentType="application/json",CorrelationId=messageId.ToString()},ct);
 }
}
