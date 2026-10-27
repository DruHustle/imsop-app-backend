namespace IMSOP.Common;
public static class ReleaseIdentity {
 public static object Current => new { revision=System.Text.RegularExpressions.Regex.IsMatch(Environment.GetEnvironmentVariable("APP_REVISION")??"","^[a-f0-9]{40}$") ? Environment.GetEnvironmentVariable("APP_REVISION") : "unknown",apiContract=2,nodeSchema="004_delivery_forecasts.sql",supplyChainSchema="202610270002_PurchaseReceiving" };
}
