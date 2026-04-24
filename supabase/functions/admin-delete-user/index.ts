import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_DELETE_WINDOW_SECONDS = 300;
const ADMIN_DELETE_MAX_REQUESTS = 10;

async function enforceAdminActionRateLimit(
  admin: ReturnType<typeof createClient>,
  userId: string,
  actionKey: string,
  targetHint: string,
  limit: number,
  windowSeconds: number,
) {
  const windowStartIso = new Date(Date.now() - windowSeconds * 1000).toISOString();

  const { count, error: countError } = await admin
    .from("admin_action_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .eq("action_key", actionKey)
    .gte("created_at", windowStartIso);

  if (countError) return { ok: false, status: 500, error: `Rate limit check failed: ${countError.message}` };
  if ((count || 0) >= limit) return { ok: false, status: 429, error: "Bạn thao tác quá nhanh. Vui lòng thử lại sau vài phút." };

  const { error: insertError } = await admin
    .from("admin_action_rate_limits")
    .insert({
      user_id: userId,
      action_key: actionKey,
      target_hint: targetHint.slice(0, 200),
    });

  if (insertError) return { ok: false, status: 500, error: `Rate limit write failed: ${insertError.message}` };
  return { ok: true, status: 200, error: "" };
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

    const userClient = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claims.claims.sub as string;

    const admin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("ADMIN") && !roleSet.has("HR")) {
      return json({ error: "Forbidden - chỉ ADMIN/HR mới được dọn user" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { email, user_id } = body as { email?: string; user_id?: string };

    const rateLimit = await enforceAdminActionRateLimit(
      admin,
      callerId,
      "admin_delete_user",
      email || user_id || "",
      ADMIN_DELETE_MAX_REQUESTS,
      ADMIN_DELETE_WINDOW_SECONDS,
    );
    if (!rateLimit.ok) {
      return json({ error: rateLimit.error }, rateLimit.status);
    }

    let targetUserId: string | null = user_id ?? null;

    if (!targetUserId && email) {
      const normalized = String(email).trim().toLowerCase();
      let page = 1;
      while (page < 50) {
        const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
        if (error) return json({ error: error.message }, 500);
        const found = data.users.find((u) => (u.email ?? "").toLowerCase() === normalized);
        if (found) {
          targetUserId = found.id;
          break;
        }
        if (data.users.length < 200) break;
        page++;
      }
      if (!targetUserId) {
        return json({ error: `Không tìm thấy user với email ${normalized} trong hệ thống xác thực.` }, 404);
      }
    }

    if (!targetUserId) {
      return json({ error: "Thiếu email hoặc user_id" }, 400);
    }

    const { data: targetRoles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", targetUserId);
    const targetRoleSet = new Set((targetRoles ?? []).map((r: { role: string }) => r.role));
    if (targetRoleSet.has("IT")) {
      return json({ error: "Không được xóa tài khoản IT." }, 403);
    }

    if (!roleSet.has("ADMIN") && roleSet.has("HR")) {
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("branch_id")
        .eq("user_id", callerId)
        .maybeSingle();
      const { data: targetProfile } = await admin
        .from("profiles")
        .select("branch_id")
        .eq("user_id", targetUserId)
        .maybeSingle();

      if (targetProfile && targetProfile.branch_id !== callerProfile?.branch_id) {
        return json({ error: "Bạn không có quyền xóa nhân viên ngoài chi nhánh của mình." }, 403);
      }
      if (targetUserId === callerId) {
        return json({ error: "Không thể tự xóa tài khoản của chính mình." }, 400);
      }
    }

    await Promise.all([
      admin.from("check_ins").delete().eq("user_id", targetUserId),
      admin.from("shifts").delete().eq("user_id", targetUserId),
      admin.from("evaluations").delete().eq("employee_id", targetUserId),
      admin.from("feedback").delete().eq("user_id", targetUserId),
      admin.from("user_roles").delete().eq("user_id", targetUserId),
      admin.from("hr_notifications").delete().eq("user_id", targetUserId),
      admin.from("early_checkout_requests").delete().eq("employee_id", targetUserId),
    ]);
    await admin.from("profiles").delete().eq("user_id", targetUserId);

    const { error: deleteError } = await admin.auth.admin.deleteUser(targetUserId);
    if (deleteError) {
      return json({ error: `Xóa khỏi auth.users thất bại: ${deleteError.message}` }, 500);
    }

    return json({ success: true, deleted_user_id: targetUserId });
  } catch (error: any) {
    return json({ error: error?.message ?? String(error) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
