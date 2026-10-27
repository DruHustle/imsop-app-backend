export const release = {
  revision: /^[a-f0-9]{40}$/.test(process.env.APP_REVISION || "")
    ? process.env.APP_REVISION
    : "unknown",
  apiContract: 2,
  nodeSchema: "005_provisioning_audit.sql",
  supplyChainSchema: "202610270002_PurchaseReceiving",
};
