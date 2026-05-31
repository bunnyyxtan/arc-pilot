import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvFiles } from "../contracts/runtime";
import { logger } from "../logger";

let serviceClient: SupabaseClient | null = null;

function getServerConfig() {
  loadEnvFiles();
  return {
    url: process.env.NEXT_PUBLIC_SUPABASE_URL,
    serviceRoleKey: process.env.SUPABASE_SERVICE_ROLE_KEY
  };
}

export function createServiceRoleSupabaseClient() {
  const { url, serviceRoleKey } = getServerConfig();
  const missing = [
    !url ? "NEXT_PUBLIC_SUPABASE_URL" : null,
    !serviceRoleKey ? "SUPABASE_SERVICE_ROLE_KEY" : null
  ].filter(Boolean);

  if (missing.length > 0) {
    throw new Error(`Supabase server configuration missing: ${missing.join(", ")}.`);
  }

  serviceClient ??= createClient(url!, serviceRoleKey!, {
    auth: {
      autoRefreshToken: false,
      persistSession: false
    }
  });
  return serviceClient;
}

export function getOptionalServiceRoleSupabaseClient() {
  try {
    return createServiceRoleSupabaseClient();
  } catch (error) {
    logger.warn("supabase.server", "client:unavailable", { error }, "Supabase service client is not configured");
    return null;
  }
}
