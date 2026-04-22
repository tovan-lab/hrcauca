// Edge function: xóa user khỏi auth.users (chỉ ADMIN/HR)
// Hỗ trợ 2 mode:
//   - by_email: dọn user mồ côi (không có profile) — chỉ cần email
//   - by_user_id: xóa hẳn 1 nhân viên đang tồn tại (có profile)
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader?.startsWith("Bearer ")) {
      return json({ error: "Unauthorized" }, 401);
    }

    const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
    const ANON = Deno.env.get("SUPABASE_ANON_KEY")!;
    const SERVICE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Client với JWT của caller — để xác thực và check role
    const userClient = createClient(SUPABASE_URL, ANON, {
      global: { headers: { Authorization: authHeader } },
    });

    const token = authHeader.replace("Bearer ", "");
    const { data: claims, error: claimsErr } = await userClient.auth.getClaims(token);
    if (claimsErr || !claims?.claims?.sub) {
      return json({ error: "Unauthorized" }, 401);
    }
    const callerId = claims.claims.sub as string;

    // Check role: phải là ADMIN hoặc HR
    const admin = createClient(SUPABASE_URL, SERVICE);
    const { data: roles } = await admin
      .from("user_roles")
      .select("role")
      .eq("user_id", callerId);
    const roleSet = new Set((roles ?? []).map((r: any) => r.role));
    if (!roleSet.has("ADMIN") && !roleSet.has("HR")) {
      return json({ error: "Forbidden — chỉ ADMIN/HR mới được dọn user" }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const { email, user_id } = body as { email?: string; user_id?: string };

    let targetUserId: string | null = user_id ?? null;

    // Mode 1: tìm theo email (dùng cho user mồ côi)
    if (!targetUserId && email) {
      const normalized = String(email).trim().toLowerCase();
      // Duyệt qua admin.listUsers (paginated)
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

    // HR chỉ được xóa user trong cùng chi nhánh (nếu user đó có profile)
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
      // Nếu target có profile → phải cùng chi nhánh. Nếu mồ côi (không profile) → cho phép.
      if (targetProfile && targetProfile.branch_id !== callerProfile?.branch_id) {
        return json({ error: "Bạn không có quyền xóa nhân viên ngoài chi nhánh của mình." }, 403);
      }
      // Không cho HR (Quản lý) tự xóa chính mình
      if (targetUserId === callerId) {
        return json({ error: "Không thể tự xóa tài khoản của chính mình." }, 400);
      }
    }

    // Dọn dữ liệu liên quan trước (để không bị orphan)
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

    // Cuối cùng: xóa khỏi auth.users
    const { error: delErr } = await admin.auth.admin.deleteUser(targetUserId);
    if (delErr) {
      return json({ error: `Xóa khỏi auth.users thất bại: ${delErr.message}` }, 500);
    }

    return json({ success: true, deleted_user_id: targetUserId });
  } catch (e: any) {
    return json({ error: e?.message ?? String(e) }, 500);
  }
});

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}
