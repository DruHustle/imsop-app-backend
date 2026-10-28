export const release = {
  revision: /^[a-f0-9]{40}$/.test(process.env.APP_REVISION || "")
    ? process.env.APP_REVISION
    : "unknown",
  apiContract: 2,
  capabilities: [
    "purchase-pagination-v1",
    "scoped-reviews-v1",
    "customer-order-search-v1",
  ],
  nodeSchema: "005_provisioning_audit.sql",
  supplyChainSchema: "202610270002_PurchaseReceiving",
};
