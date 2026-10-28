using Azure.Messaging.ServiceBus;
namespace IMSOP.SupplyChainService;
public interface IOrderTransport { Task Send(Guid messageId,string body,CancellationToken ct); }
public class OrderTransport(IConfiguration config,IHostEnvironment environment,IHttpClientFactory clients) : IOrderTransport {
 public async Task Send(Guid messageId,string body,CancellationToken ct) {
  var settings=OrderTransportSettings.Resolve(config,environment.IsDevelopment());
  if(!settings.Enabled)throw new InvalidOperationException("Order dispatch is disabled; durable drafts are retained");
  var testSink=settings.VerificationUrl;
  if(testSink is not null) {
   using var request=new HttpRequestMessage(HttpMethod.Post,testSink){Content=new StringContent(body,System.Text.Encoding.UTF8,"application/json")};
   request.Headers.Add("Idempotency-Key",messageId.ToString());
   using var response=await clients.CreateClient("order-transport").SendAsync(request,ct);response.EnsureSuccessStatusCode();return;
  }
  var queue=settings.Queue!;var connection=settings.ConnectionString!;
  await using var client=new ServiceBusClient(connection,new ServiceBusClientOptions{RetryOptions=new ServiceBusRetryOptions{MaxRetries=2,TryTimeout=TimeSpan.FromSeconds(10)}});
  await using var sender=client.CreateSender(queue);
  await sender.SendMessageAsync(new ServiceBusMessage(body){MessageId=messageId.ToString(),ContentType="application/json",CorrelationId=messageId.ToString()},ct);
 }
}
