export const release = {
  revision: /^[a-f0-9]{40}$/.test(process.env.APP_REVISION || "")
    ? process.env.APP_REVISION
    : "unknown",
  apiContract: 2,
  nodeSchema: "003_projection_provenance.sql",
  supplyChainSchema: "202610270001_DurableOrders",
};
