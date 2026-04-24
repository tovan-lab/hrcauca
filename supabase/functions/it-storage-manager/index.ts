import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

type CleanupCategory = "check_in_images" | "shifts" | "evaluations";

type StoragePayload = {
  action?: "cleanup" | "export";
  dateFrom?: string;
  dateTo?: string;
  categories?: CleanupCategory[];
};

function json(data: unknown, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeStoragePath(url: string | null): string | null {
  if (!url || url.startsWith("data:")) return null;
  const match = url.match(/checkin-images\/([^?]+)/);
  if (match) return match[1];
  if (/^[a-z0-9-]+\/\d+\.(jpg|jpeg|png|webp)$/i.test(url)) return url;
  return null;
}

function parseDateRange(dateFrom: string, dateTo: string) {
  const from = new Date(`${dateFrom}T00:00:00.000Z`);
  const to = new Date(`${dateTo}T23:59:59.999Z`);

  if (Number.isNaN(from.getTime()) || Number.isNaN(to.getTime())) {
    throw new Error("Khoảng ngày không hợp lệ.");
  }
  if (from > to) {
    throw new Error("Ngày bắt đầu phải nhỏ hơn hoặc bằng ngày kết thúc.");
  }

  return { from, to };
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
    if (!roleSet.has("IT")) {
      return json({ error: "Forbidden" }, 403);
    }

    const body = (await req.json().catch(() => ({}))) as StoragePayload;
    if (body.action !== "cleanup" && body.action !== "export") {
      return json({ error: "Unsupported action" }, 400);
    }

    const dateFrom = String(body.dateFrom ?? "");
    const dateTo = String(body.dateTo ?? "");
    const categories = Array.isArray(body.categories) ? body.categories : [];

    if (!dateFrom || !dateTo || categories.length === 0) {
      return json({ error: "Thiếu khoảng ngày hoặc danh mục xử lý." }, 400);
    }

    const { from, to } = parseDateRange(dateFrom, dateTo);
    const fromIso = from.toISOString();
    const toIso = to.toISOString();
    const fromDateStr = from.toISOString().slice(0, 10);
    const toDateStr = to.toISOString().slice(0, 10);

    if (body.action === "export") {
      const exportData: Record<string, unknown[]> = {};

      if (categories.includes("check_in_images")) {
        const { data, error } = await admin
          .from("check_ins")
          .select("id, user_id, branch_id, shift_id, check_in_time, check_out_time, image_url, late_minutes, early_leave_minutes, attendance_status")
          .gte("check_in_time", fromIso)
          .lte("check_in_time", toIso)
          .order("check_in_time", { ascending: true });
        if (error) throw error;
        exportData.check_in_images = data ?? [];
      }

      if (categories.includes("shifts")) {
        const { data, error } = await admin
          .from("shifts")
          .select("id, user_id, actual_branch_id, shift_date, start_time, end_time, shift_type, created_at, updated_at")
          .gte("shift_date", fromDateStr)
          .lte("shift_date", toDateStr)
          .order("shift_date", { ascending: true });
        if (error) throw error;
        exportData.shifts = data ?? [];
      }

      if (categories.includes("evaluations")) {
        const { data, error } = await admin
          .from("evaluations")
          .select("id, employee_id, hr_id, branch_id, evaluation_date, total_score, bonus_score, manager_comment, created_at, updated_at")
          .gte("evaluation_date", fromDateStr)
          .lte("evaluation_date", toDateStr)
          .order("evaluation_date", { ascending: true });
        if (error) throw error;
        exportData.evaluations = data ?? [];
      }

      return json({
        success: true,
        exported_at: new Date().toISOString(),
        date_from: fromDateStr,
        date_to: toDateStr,
        categories,
        data: exportData,
      });
    }

    const results: { category: string; count: number }[] = [];

    for (const category of categories) {
      if (category === "check_in_images") {
        const { data: records, error } = await admin
          .from("check_ins")
          .select("id, image_url")
          .gte("check_in_time", fromIso)
          .lte("check_in_time", toIso);
        if (error) throw error;

        const storagePaths = (records ?? [])
          .map((record) => normalizeStoragePath(record.image_url))
          .filter((value): value is string => Boolean(value));

        for (let i = 0; i < storagePaths.length; i += 100) {
          const batch = storagePaths.slice(i, i + 100);
          if (batch.length > 0) {
            const { error: removeError } = await admin.storage.from("checkin-images").remove(batch);
            if (removeError) throw removeError;
          }
        }

        const { data: deletedRows, error: deleteError } = await admin
          .from("check_ins")
          .delete()
          .gte("check_in_time", fromIso)
          .lte("check_in_time", toIso)
          .select("id");
        if (deleteError) throw deleteError;

        results.push({ category: "Ảnh chấm công", count: deletedRows?.length ?? 0 });
      }

      if (category === "shifts") {
        const { data, error } = await admin
          .from("shifts")
          .delete()
          .gte("shift_date", fromDateStr)
          .lte("shift_date", toDateStr)
          .select("id");
        if (error) throw error;
        results.push({ category: "Nhật ký ca làm", count: data?.length ?? 0 });
      }

      if (category === "evaluations") {
        const { data, error } = await admin
          .from("evaluations")
          .delete()
          .gte("evaluation_date", fromDateStr)
          .lte("evaluation_date", toDateStr)
          .select("id");
        if (error) throw error;
        results.push({ category: "Bảng chấm điểm", count: data?.length ?? 0 });
      }
    }

    return json({ success: true, results });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return json({ error: message }, 500);
  }
});
