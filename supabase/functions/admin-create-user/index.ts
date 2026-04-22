import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

const ADMIN_CREATE_WINDOW_SECONDS = 300;
const ADMIN_CREATE_MAX_REQUESTS = 10;

type CreateUserPayload = {
  email?: string;
  password?: string;
  name?: string;
  role?: "EMPLOYEE" | "HR" | "ADMIN";
  branch_id?: string | null;
};

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
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("ADMIN") && !roleSet.has("HR")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as CreateUserPayload;
    const email = String(body.email ?? "").trim().toLowerCase();
    const password = String(body.password ?? "");
    const name = String(body.name ?? "").trim();
    const targetRole = (body.role ?? "EMPLOYEE") as "EMPLOYEE" | "HR" | "ADMIN";
    const targetBranchId = body.branch_id ?? null;

    if (!email || !password || !name) {
      return json({ error: "Thiếu email, mật khẩu hoặc họ tên" }, 400);
    }
    if (password.length < 6) {
      return json({ error: "Mật khẩu phải có ít nhất 6 ký tự" }, 400);
    }

    const rateLimit = await enforceAdminActionRateLimit(
      admin,
      callerId,
      "admin_create_user",
      email,
      ADMIN_CREATE_MAX_REQUESTS,
      ADMIN_CREATE_WINDOW_SECONDS,
    );
    if (!rateLimit.ok) {
      return json({ error: rateLimit.error }, rateLimit.status);
    }

    let callerBranchId: string | null = null;
    if (!roleSet.has("ADMIN")) {
      const { data: callerProfile } = await admin
        .from("profiles")
        .select("branch_id")
        .eq("user_id", callerId)
        .maybeSingle();
      callerBranchId = callerProfile?.branch_id ?? null;

      if (targetRole === "ADMIN") {
        return json({ error: "HR không được tạo tài khoản ADMIN" }, 403);
      }
      if (targetBranchId !== null && targetBranchId !== callerBranchId) {
        return json({ error: "HR chỉ được tạo nhân viên trong chi nhánh của mình" }, 403);
      }
    }

    const effectiveBranchId = roleSet.has("ADMIN") ? targetBranchId : callerBranchId;

    let existingUserId: string | null = null;
    for (let page = 1; page < 50; page++) {
      const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
      if (error) return json({ error: error.message }, 500);
      const found = data.users.find((u) => (u.email ?? "").toLowerCase() === email);
      if (found) {
        existingUserId = found.id;
        break;
      }
      if (data.users.length < 200) break;
    }

    let userId: string;
    let mode: "created_new" | "updated_existing";

    if (!existingUserId) {
      const { data, error } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error || !data.user) {
        return json({ error: error?.message ?? "Không thể tạo user auth" }, 500);
      }
      userId = data.user.id;
      mode = "created_new";
    } else {
      const { error } = await admin.auth.admin.updateUserById(existingUserId, {
        password,
        email_confirm: true,
        user_metadata: { name },
      });
      if (error) {
        return json({ error: `Không thể cập nhật user hiện có: ${error.message}` }, 500);
      }
      userId = existingUserId;
      mode = "updated_existing";
    }

    for (let i = 0; i < 10; i++) {
      const { data: profile } = await admin
        .from("profiles")
        .select("user_id")
        .eq("user_id", userId)
        .maybeSingle();
      if (profile) break;
      await new Promise((resolve) => setTimeout(resolve, 200));
    }

    const { error: profileError } = await admin
      .from("profiles")
      .upsert({
        user_id: userId,
        email,
        name,
        status: "active",
        is_active: true,
        branch_id: effectiveBranchId,
      }, { onConflict: "user_id" });
    if (profileError) {
      return json({ error: `Không thể cập nhật profile: ${profileError.message}` }, 500);
    }

    await admin.from("user_roles").delete().eq("user_id", userId);
    const { error: roleInsertError } = await admin
      .from("user_roles")
      .insert({ user_id: userId, role: targetRole });
    if (roleInsertError) {
      return json({ error: `Không thể gán role: ${roleInsertError.message}` }, 500);
    }

    return json({
      success: true,
      user_id: userId,
      email,
      role: targetRole,
      branch_id: effectiveBranchId,
      status: "active",
      mode,
    });
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
