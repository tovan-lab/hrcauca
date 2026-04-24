import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type ConfigPayload = {
  action?: "get_api_settings" | "save_api_settings";
  openaiApiKey?: string;
  resendApiKey?: string;
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const anonKey = Deno.env.get("SUPABASE_ANON_KEY")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    const callerClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });
    const admin = createClient(supabaseUrl, serviceRoleKey);

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await callerClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }

    const callerId = claims.claims.sub as string;
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roleSet = new Set((roles ?? []).map((item: { role: string }) => item.role));
    const canManageApi = roleSet.has("IT") || roleSet.has("HR");
    if (!canManageApi) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as ConfigPayload;

    if (body.action === "get_api_settings") {
      const { data, error } = await admin
        .from("system_api_configs")
        .select("service, api_key, updated_at")
        .in("service", ["openai", "resend"]);
      if (error) throw error;

      const openai = data?.find((item) => item.service === "openai");
      const resend = data?.find((item) => item.service === "resend");

      return json({
        success: true,
        openaiApiKey: openai?.api_key ?? "",
        resendApiKey: resend?.api_key ?? "",
        updatedAt: {
          openai: openai?.updated_at ?? null,
          resend: resend?.updated_at ?? null,
        },
      });
    }

    if (body.action === "save_api_settings") {
      const updates: { service: "openai" | "resend"; api_key: string; updated_by: string; updated_at: string }[] = [];

      if (typeof body.openaiApiKey === "string") {
        updates.push({
          service: "openai",
          api_key: body.openaiApiKey.trim(),
          updated_by: callerId,
          updated_at: new Date().toISOString(),
        });
      }

      if (typeof body.resendApiKey === "string") {
        updates.push({
          service: "resend",
          api_key: body.resendApiKey.trim(),
          updated_by: callerId,
          updated_at: new Date().toISOString(),
        });
      }

      if (updates.length === 0) {
        return json({ error: "Không có cấu hình API để lưu." }, 400);
      }

      const { error } = await admin
        .from("system_api_configs")
        .upsert(updates, { onConflict: "service" });
      if (error) throw error;

      return json({ success: true });
    }

    return json({ error: "Unsupported action" }, 400);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
