import { createHash } from "node:crypto";
import { sapConfiguration } from "../config/integrations";

// Read-only OData service metadata. No business record synchronization or ownership mapping is inferred.
export async function readSapMetadata(workspaceId: string, request = fetch) {
  const config = sapConfiguration();
  if (!config) return { status: "not-configured" as const };
  if (!config.workspaces.includes(workspaceId))
    return { status: "not-authorized" as const };
  const response = await request(new URL("$metadata", config.url), {
    method: "GET",
    redirect: "error",
    signal: AbortSignal.timeout(10000),
    headers: {
      Accept:
        "application/xml, application/atom+xml, application/edmx+xml, text/xml",
      Authorization: "Bearer " + config.token,
    },
  });
  if (
    !response.ok ||
    !response.body ||
    !/^(application|text)\/(?:[a-z.+-]*\+)?xml\b/i.test(
      response.headers.get("content-type") || "",
    )
  )
    throw new Error("SAP metadata unavailable");
  const reader = response.body.getReader(),
    chunks: Uint8Array[] = [];
  let bytes = 0;
  try {
    for (;;) {
      const chunk = await reader.read();
      if (chunk.done) break;
      bytes += chunk.value.length;
      if (bytes > 1024 * 1024) throw new Error("SAP metadata limit exceeded");
      chunks.push(chunk.value);
    }
  } finally {
    await reader.cancel();
  }
  const body = Buffer.concat(chunks),
    text = body.toString("utf8");
  if (
    /<!DOCTYPE|<!ENTITY/i.test(text) ||
    !/<(?:[A-Za-z_][\w.-]*:)?Edmx\b/.test(text) ||
    !/<(?:[A-Za-z_][\w.-]*:)?DataServices\b/.test(text) ||
    !/<\/(?:[A-Za-z_][\w.-]*:)?Edmx\s*>\s*$/.test(text)
  )
    throw new Error("SAP did not return OData metadata");
  return {
    status: "observed" as const,
    sha256: createHash("sha256").update(body).digest("hex"),
    bytes,
    checkedAt: new Date().toISOString(),
    scope: "read-only service metadata; no business records synchronized",
  };
}
