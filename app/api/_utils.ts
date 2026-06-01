import { NextResponse } from "next/server";
import { logger } from "../../lib/logger";
import { bigintJson } from "../../lib/sdk/types";
import { toBigIntSafe } from "../../lib/format/ids";

class RouteValidationError extends Error {}

// Shared API helpers keep response shapes stable while attaching safe debug context.
export function ok(data: unknown) {
  const safe = bigintJson(data);
  if (safe && typeof safe === "object" && !Array.isArray(safe)) {
    return NextResponse.json({ ok: true, ...(safe as Record<string, unknown>) });
  }
  return NextResponse.json({ ok: true, data: safe });
}

export function fail(error: unknown, status = 400, module = "api", action = "request") {
  const responseStatus = error instanceof RouteValidationError ? 400 : status;
  logger.error(module, `${action}:failed`, { status: responseStatus, error }, "API request failed");
  return NextResponse.json(
    { ok: false, error: error instanceof Error ? error.message : String(error) },
    { status: responseStatus }
  );
}

export async function readJson(request: Request) {
  try {
    return (await request.json()) as Record<string, unknown>;
  } catch (error) {
    logger.warn("api", "readJson:invalid", { error }, "Request JSON parsing failed");
    throw error;
  }
}

export function bodyPrivateKey(body: Record<string, unknown>, envName?: string) {
  const key = typeof body.privateKey === "string" ? body.privateKey : envName ? process.env[envName] : undefined;
  if (!key) {
    logger.warn("api", "privateKey:missing", { envName }, "Write route is missing a private key");
    throw new Error("privateKey is required for this local/demo write route.");
  }
  return key;
}

export function routeBigInt(value: string | undefined, label: string) {
  const id = toBigIntSafe(value);
  if (id === null) throw new RouteValidationError(`${label} must be a positive numeric identifier.`);
  return id;
}
