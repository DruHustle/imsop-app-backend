export function buildResetLink(base: string, token: string): string {
  const url = new URL(base);
  if (
    !["https:", "http:"].includes(url.protocol) ||
    url.username ||
    url.password
  )
    throw new Error("Invalid recovery URL");
  url.searchParams.delete("token");
  const [route, query = ""] = url.hash.slice(1).split("?");
  const params = new URLSearchParams(query);
  params.delete("token");
  params.set("token", token);
  url.hash = `${route || "/reset-password"}?${params}`;
  return url.toString();
}
