namespace IMSOP.Common;
public static class ReleaseIdentity {
 public static object Current => new { revision=System.Text.RegularExpressions.Regex.IsMatch(Environment.GetEnvironmentVariable("APP_REVISION")??"","^[a-f0-9]{40}$") ? Environment.GetEnvironmentVariable("APP_REVISION") : "unknown",apiContract=2,capabilities=new[]{"purchase-pagination-v1","scoped-reviews-v1","customer-order-search-v1"},nodeSchema="005_provisioning_audit.sql",supplyChainSchema="202610270002_PurchaseReceiving" };
}
