import fs from "node:fs";
import path from "node:path";

export function integrationEnabled(key: string): boolean {
  const value = process.env[key];
  if (value === undefined || value === "false") return false;
  if (value === "true") return true;
  throw new Error(`${key} must be true or false`);
}

// References are operator-controlled absolute paths, never request parameters.
export function serverSecret(key: string): string | undefined {
  const inline = process.env[key],
    file = process.env[key + "_FILE"];
  if (inline && file)
    throw new Error(`Configure only one credential source for ${key}`);
  if (!file) {
    if (!inline) return undefined;
    if (!inline.trim() || inline.length > 16384 || /[\r\n]/.test(inline))
      throw new Error(`The server credential for ${key} is invalid`);
    return inline.trim();
  }
  try {
    if (
      !path.isAbsolute(file) ||
      !fs.statSync(file).isFile() ||
      fs.statSync(file).size > 16384
    )
      throw new Error();
    const value = fs.readFileSync(file, "utf8").trim();
    if (!value || /[\r\n]/.test(value)) throw new Error();
    return value;
  } catch {
    throw new Error(
      `The server credential reference for ${key} is unavailable`,
    );
  }
}

function endpoint(value: string | undefined, name: string): URL {
  try {
    const url = new URL(value || "");
    if (
      url.username ||
      url.password ||
      url.hash ||
      url.search ||
      (url.protocol !== "https:" &&
        !(
          process.env.NODE_ENV === "test" &&
          url.protocol === "http:" &&
          ["127.0.0.1", "localhost", "sink"].includes(url.hostname)
        ))
    )
      throw new Error();
    return url;
  } catch {
    throw new Error(
      `${name} requires an operator-configured HTTPS endpoint without credentials or query parameters`,
    );
  }
}

export function forecastConfiguration() {
  if (!integrationEnabled("FORECAST_ENABLED")) return null;
  const url = endpoint(process.env.FORECAST_PROVIDER_URL, "Forecast");
  const name = process.env.FORECAST_PROVIDER_NAME;
  const maxHorizon = Number(process.env.FORECAST_MAX_HORIZON_DAYS || 30);
  if (
    !name ||
    name.length > 100 ||
    !Number.isInteger(maxHorizon) ||
    maxHorizon < 1 ||
    maxHorizon > 90
  )
    throw new Error(
      "Enabled forecasting requires a provider name and a 1–90 day horizon",
    );
  return {
    url: url.href,
    name,
    maxHorizon,
    token: serverSecret("FORECAST_PROVIDER_TOKEN"),
  };
}

export function sapConfiguration() {
  if (!integrationEnabled("SAP_ENABLED")) return null;
  const url = endpoint(process.env.SAP_SERVICE_URL, "SAP");
  url.pathname = url.pathname.replace(/\/+$/, "") + "/";
  const token = serverSecret("SAP_BEARER_TOKEN");
  let workspaces: unknown;
  try {
    workspaces = JSON.parse(process.env.SAP_WORKSPACE_ALLOWLIST || "[]");
  } catch {
    throw new Error(
      "SAP workspace authorization must be an explicit UUID array",
    );
  }
  if (
    !token ||
    !Array.isArray(workspaces) ||
    !workspaces.length ||
    workspaces.some(
      (w) =>
        typeof w !== "string" ||
        !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(
          w,
        ),
    )
  )
    throw new Error(
      "Enabled SAP requires a server credential and an explicit workspace allowlist",
    );
  return {
    url: url.href,
    token,
    workspaces: (workspaces as string[]).map((w) => w.toLowerCase()),
  };
}

export function assertIntegrationConfiguration() {
  forecastConfiguration();
  sapConfiguration();
}
