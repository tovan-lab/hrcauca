import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const GEMINI_MODEL = "gemini-2.5-flash";
const CONFIRM_PHRASES = ["xác nhận", "dong y", "đồng ý", "ok", "oke", "confirm", "thực hiện"];
const CANCEL_PHRASES = ["hủy", "huy", "không", "khong", "cancel", "thôi", "dừng"];

type ChatMessage = {
  role: string;
  content?: string;
};

type QueryResult = {
  count?: number;
  data?: any[];
  message?: string;
  error?: string;
};

type MutationPayload = {
  action: "delete_shifts" | "add_shifts" | "update_shifts";
  date: string;
  employee_names: string[];
  shift_details?: {
    start_time?: string;
    end_time?: string;
    shift_type?: "PART_TIME_4H" | "FULL_TIME_8H";
  };
};

type GeminiFunctionCall = {
  name: string;
  args?: Record<string, unknown>;
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function normalizeText(text: string) {
  return text
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim();
}

function includesAny(text: string, phrases: string[]) {
  const normalized = normalizeText(text);
  return phrases.some((phrase) => normalized.includes(normalizeText(phrase)));
}

function latestUserMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "user" && message.content) return message.content.trim();
  }
  return "";
}

function previousAssistantMessage(messages: ChatMessage[]) {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    const message = messages[i];
    if (message.role === "assistant" && message.content) return message.content.trim();
  }
  return "";
}

function hasPendingConfirmation(messages: ChatMessage[]) {
  const lastAssistant = previousAssistantMessage(messages);
  return normalizeText(lastAssistant).includes("ban co muon xac nhan thay doi nay khong");
}

function getSystemPrompt(role: string, today: string) {
  const base = `Bạn là Trợ lý AI HR của hệ thống "HR Cậu Cả".

Quy tắc chung:
- Luôn trả lời bằng tiếng Việt tự nhiên, ngắn gọn, rõ ràng.
- Không tiết lộ SQL, API, tool name hay chi tiết kỹ thuật nội bộ.
- Nếu có danh sách, ưu tiên markdown dễ đọc.
- Hôm nay là ${today}.`;

  if (role === "HR") {
    return `${base}

Vai trò của bạn: HR chỉ được phép đọc dữ liệu.
- Chỉ truy vấn thông tin ca làm, chấm công, đánh giá, nhân sự.
- Nếu người dùng yêu cầu thay đổi dữ liệu, từ chối rõ ràng và hướng dẫn liên hệ Admin.
- Tuyệt đối không thực hiện mutation.`;
  }

  return `${base}

Vai trò của bạn: ADMIN.
- Có thể truy vấn và thay đổi dữ liệu.
- Với mọi yêu cầu thay đổi ca làm, phải tóm tắt hành động trước và kết thúc bằng đúng câu:
"Bạn có muốn xác nhận thay đổi này không?"
- Chỉ thực hiện mutation sau khi người dùng xác nhận.`;
}

const queryTool = {
  type: "function",
  function: {
    name: "query_hr_data",
    description: "Tra cứu dữ liệu HR: ca làm, chấm công, đánh giá, danh sách nhân viên.",
    parameters: {
      type: "object",
      properties: {
        query_type: {
          type: "string",
          enum: ["shifts", "attendance", "evaluations", "employees"],
        },
        date: { type: "string" },
        date_from: { type: "string" },
        date_to: { type: "string" },
        branch_id: { type: "string" },
        employee_name: { type: "string" },
      },
      required: ["query_type"],
    },
  },
};

const mutationTool = {
  type: "function",
  function: {
    name: "execute_shift_mutation",
    description: "Thực hiện thay đổi ca làm việc. Chỉ gọi sau khi người dùng xác nhận.",
    parameters: {
      type: "object",
      properties: {
        action: {
          type: "string",
          enum: ["delete_shifts", "add_shifts", "update_shifts"],
        },
        date: { type: "string" },
        employee_names: {
          type: "array",
          items: { type: "string" },
        },
        shift_details: {
          type: "object",
          properties: {
            start_time: { type: "string" },
            end_time: { type: "string" },
            shift_type: { type: "string", enum: ["PART_TIME_4H", "FULL_TIME_8H"] },
          },
        },
      },
      required: ["action", "date", "employee_names"],
    },
  },
};

function toGeminiRole(role: string): "user" | "model" {
  return role === "assistant" ? "model" : "user";
}

function buildGeminiContents(messages: ChatMessage[]) {
  return messages
    .filter((message) => typeof message?.content === "string" && message.content.trim().length > 0)
    .map((message) => ({
      role: toGeminiRole(message.role),
      parts: [{ text: message.content!.trim() }],
    }));
}

function buildGeminiTools(role: string) {
  const tools = role === "ADMIN" ? [queryTool, mutationTool] : [queryTool];
  return [
    {
      functionDeclarations: tools.map((tool) => ({
        name: tool.function.name,
        description: tool.function.description,
        parameters: tool.function.parameters,
      })),
    },
  ];
}

async function callGemini(payload: Record<string, unknown>, apiKey: string) {
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`, {
    method: "POST",
    headers: {
      "x-goog-api-key": apiKey,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Gemini API error ${response.status}: ${body}`);
  }

  return response.json();
}

function extractTextFromGemini(data: any): string {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part: any) => part?.text)
    .filter((text: unknown): text is string => typeof text === "string" && text.length > 0)
    .join("\n")
    .trim();
}

function extractFunctionCallsFromGemini(data: any): GeminiFunctionCall[] {
  const parts = data?.candidates?.[0]?.content?.parts || [];
  return parts
    .map((part: any) => part?.functionCall)
    .filter((call: unknown): call is GeminiFunctionCall => Boolean(call?.name));
}

function inferDateFromMessage(message: string, today: string) {
  const normalized = normalizeText(message);
  if (normalized.includes("hom nay")) return today;
  return today;
}

async function executeQuery(
  args: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
  callerBranchId: string | null,
  callerRole: string,
): Promise<QueryResult> {
  const queryType = args.query_type as string;
  const date = args.date as string | undefined;
  const dateFrom = args.date_from as string | undefined;
  const dateTo = args.date_to as string | undefined;
  const branchId = args.branch_id as string | undefined;
  const employeeName = args.employee_name as string | undefined;

  const { data: branchList } = await supabaseAdmin.from("branches").select("id, branch_name");
  const branchMap = Object.fromEntries((branchList || []).map((b: any) => [b.id, b.branch_name]));

  if (queryType === "shifts") {
    let query = supabaseAdmin.from("shifts").select("id, user_id, shift_date, start_time, end_time, shift_type");
    if (date) query = query.eq("shift_date", date);
    if (dateFrom) query = query.gte("shift_date", dateFrom);
    if (dateTo) query = query.lte("shift_date", dateTo);

    const { data: shifts } = await query;
    if (!shifts || shifts.length === 0) return { count: 0, data: [], message: "Không tìm thấy ca làm." };

    const userIds = [...new Set(shifts.map((s: any) => s.user_id))];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, name, branch_id").in("user_id", userIds);
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    let result = shifts.map((s: any) => {
      const p = profileMap[s.user_id] || {};
      return {
        name: p.name || "Không rõ",
        branch: branchMap[p.branch_id] || "Chưa phân chi nhánh",
        branch_id: p.branch_id,
        date: s.shift_date,
        start: s.start_time?.slice(0, 5),
        end: s.end_time?.slice(0, 5),
        type: s.shift_type,
      };
    });

    if (callerRole === "HR" && callerBranchId) result = result.filter((r: any) => r.branch_id === callerBranchId);
    if (branchId) result = result.filter((r: any) => r.branch_id === branchId);
    if (employeeName) {
      const lower = employeeName.toLowerCase();
      result = result.filter((r: any) => r.name.toLowerCase().includes(lower));
    }

    return { count: result.length, data: result };
  }

  if (queryType === "attendance") {
    let query = supabaseAdmin.from("check_ins").select("id, user_id, check_in_time, check_out_time, attendance_status, late_minutes, branch_id");
    if (date) query = query.gte("check_in_time", `${date}T00:00:00`).lt("check_in_time", `${date}T23:59:59`);
    if (dateFrom) query = query.gte("check_in_time", `${dateFrom}T00:00:00`);
    if (dateTo) query = query.lt("check_in_time", `${dateTo}T23:59:59`);

    const { data: checkins } = await query.limit(300);
    if (!checkins || checkins.length === 0) return { count: 0, data: [], message: "Không tìm thấy dữ liệu chấm công." };

    const userIds = [...new Set(checkins.map((c: any) => c.user_id))];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, name, branch_id").in("user_id", userIds);
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    let result = checkins.map((c: any) => {
      const p = profileMap[c.user_id] || {};
      return {
        name: p.name || "Không rõ",
        branch: branchMap[p.branch_id] || branchMap[c.branch_id] || "Chưa phân chi nhánh",
        branch_id: p.branch_id || c.branch_id,
        check_in: c.check_in_time,
        check_out: c.check_out_time,
        status: c.attendance_status,
        late_minutes: c.late_minutes,
      };
    });

    if (callerRole === "HR" && callerBranchId) result = result.filter((r: any) => r.branch_id === callerBranchId);
    if (employeeName) {
      const lower = employeeName.toLowerCase();
      result = result.filter((r: any) => r.name.toLowerCase().includes(lower));
    }

    return { count: result.length, data: result };
  }

  if (queryType === "evaluations") {
    let query = supabaseAdmin.from("evaluations").select("employee_id, total_score, evaluation_date, bonus_score, manager_comment, branch_id");
    if (dateFrom) query = query.gte("evaluation_date", dateFrom);
    if (dateTo) query = query.lte("evaluation_date", dateTo);

    const { data: evaluations } = await query.limit(200);
    if (!evaluations || evaluations.length === 0) return { count: 0, data: [], message: "Không tìm thấy đánh giá." };

    const userIds = [...new Set(evaluations.map((e: any) => e.employee_id))];
    const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, name, branch_id").in("user_id", userIds);
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    let result = evaluations.map((e: any) => {
      const p = profileMap[e.employee_id] || {};
      return {
        name: p.name || "Không rõ",
        branch: branchMap[p.branch_id] || branchMap[e.branch_id] || "Chưa phân chi nhánh",
        branch_id: p.branch_id || e.branch_id,
        total_score: e.total_score,
        date: e.evaluation_date,
        bonus: e.bonus_score,
        comment: e.manager_comment,
      };
    });

    if (callerRole === "HR" && callerBranchId) result = result.filter((r: any) => r.branch_id === callerBranchId);
    if (employeeName) {
      const lower = employeeName.toLowerCase();
      result = result.filter((r: any) => r.name.toLowerCase().includes(lower));
    }

    return { count: result.length, data: result };
  }

  if (queryType === "employees") {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, name, email, department, branch_id, status, is_active");
    let result = (profiles || []).map((p: any) => ({
      name: p.name,
      email: p.email,
      department: p.department,
      branch: branchMap[p.branch_id] || "Chưa phân chi nhánh",
      branch_id: p.branch_id,
      status: p.status,
      active: p.is_active,
    }));

    if (callerRole === "HR" && callerBranchId) result = result.filter((r: any) => r.branch_id === callerBranchId);
    if (employeeName) {
      const lower = employeeName.toLowerCase();
      result = result.filter((r: any) => r.name.toLowerCase().includes(lower));
    }

    return { count: result.length, data: result };
  }

  return { error: "Loại truy vấn không hợp lệ." };
}

async function executeMutation(
  args: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const action = args.action as string;
  const date = args.date as string;
  const names = (args.employee_names as string[]) || [];
  const shiftDetails = args.shift_details as MutationPayload["shift_details"] | undefined;

  const { data: allProfiles } = await supabaseAdmin.from("profiles").select("user_id, name, branch_id");
  const matched: { user_id: string; name: string; branch_id: string | null }[] = [];
  const notFound: string[] = [];

  for (const inputName of names) {
    const lower = normalizeText(inputName);
    const found = (allProfiles || []).find((p: any) => normalizeText(p.name || "").includes(lower));
    if (found) matched.push({ user_id: found.user_id, name: found.name, branch_id: found.branch_id });
    else notFound.push(inputName);
  }

  if (action === "delete_shifts") {
    const deleted: string[] = [];
    const noShift: string[] = [];

    for (const emp of matched) {
      const { data: existing } = await supabaseAdmin.from("shifts").select("id").eq("user_id", emp.user_id).eq("shift_date", date);
      if (existing && existing.length > 0) {
        await supabaseAdmin.from("shifts").delete().eq("user_id", emp.user_id).eq("shift_date", date);
        deleted.push(emp.name);
      } else {
        noShift.push(emp.name);
      }
    }

    return { action: "delete_shifts", deleted, not_found: notFound, no_shift: noShift, date };
  }

  if (action === "add_shifts") {
    const added: string[] = [];
    const alreadyExists: string[] = [];
    const startTime = shiftDetails?.start_time || "08:00";
    const endTime = shiftDetails?.end_time || "17:00";
    const shiftType = shiftDetails?.shift_type || "FULL_TIME_8H";

    for (const emp of matched) {
      const { data: existing } = await supabaseAdmin.from("shifts").select("id").eq("user_id", emp.user_id).eq("shift_date", date);
      if (existing && existing.length > 0) {
        alreadyExists.push(emp.name);
      } else {
        await supabaseAdmin.from("shifts").insert({
          user_id: emp.user_id,
          shift_date: date,
          start_time: startTime,
          end_time: endTime,
          shift_type: shiftType,
        });
        added.push(emp.name);
      }
    }

    return { action: "add_shifts", added, already_exists: alreadyExists, not_found: notFound, date };
  }

  return { error: "Hành động không hợp lệ." };
}

function buildSummaryReplyFromQuery(message: string, result: QueryResult, today: string) {
  const normalized = normalizeText(message);
  const rows = result.data || [];

  if (normalized.includes("bao nhieu") && (normalized.includes("nguoi lam") || normalized.includes("người làm"))) {
    return `Hôm nay (${today}) có **${result.count || 0}** người có ca làm.`;
  }

  if (normalized.includes("ca toi")) {
    const evening = rows.filter((row: any) => (row.start || "") >= "17:00" || (row.end || "") >= "21:00");
    if (evening.length === 0) return "Hôm nay chưa có dữ liệu ca tối.";
    return [
      `Ca tối hôm nay có **${evening.length}** người:`,
      ...evening.slice(0, 20).map((row: any, index: number) => `${index + 1}. ${row.name} (${row.start}-${row.end})`),
    ].join("\n");
  }

  if (normalized.includes("di muon") || normalized.includes("đi muộn")) {
    const lateRows = rows
      .filter((row: any) => Number(row.late_minutes || 0) > 0)
      .sort((a: any, b: any) => Number(b.late_minutes || 0) - Number(a.late_minutes || 0));

    if (lateRows.length === 0) return "Không có nhân viên đi muộn trong dữ liệu đã tra cứu.";

    return [
      `Có **${lateRows.length}** lượt đi muộn:`,
      ...lateRows.slice(0, 20).map((row: any, index: number) => `${index + 1}. ${row.name} - ${row.late_minutes} phút`),
    ].join("\n");
  }

  if (result.message) return result.message;
  if (typeof result.count === "number") return `Đã tìm thấy **${result.count}** kết quả.`;

  return "Tôi đã xử lý xong yêu cầu.";
}

function inferFallbackIntent(message: string, role: string, today: string): { queryArgs?: Record<string, unknown>; reply?: string } {
  const normalized = normalizeText(message);

  if (role !== "ADMIN" && (
    normalized.includes("cho nghi") ||
    normalized.includes("them ca") ||
    normalized.includes("xoa ca") ||
    normalized.includes("sua ca")
  )) {
    return { reply: "Bạn không có quyền thực hiện thay đổi dữ liệu. Vui lòng liên hệ Admin." };
  }

  if (normalized.includes("bao nhieu") && (normalized.includes("nguoi lam") || normalized.includes("người làm"))) {
    return { queryArgs: { query_type: "shifts", date: today } };
  }

  if (normalized.includes("ca toi")) {
    return { queryArgs: { query_type: "shifts", date: today } };
  }

  if (normalized.includes("cham cong") || normalized.includes("chấm công") || normalized.includes("di muon") || normalized.includes("đi muộn")) {
    return { queryArgs: { query_type: "attendance", date: today } };
  }

  if (normalized.includes("danh gia") || normalized.includes("đánh giá")) {
    return { queryArgs: { query_type: "evaluations", date_from: today, date_to: today } };
  }

  if (normalized.includes("nhan vien") || normalized.includes("nhân viên")) {
    return { queryArgs: { query_type: "employees" } };
  }

  return {
    reply: "Tôi chưa hiểu rõ yêu cầu này trong chế độ dự phòng. Bạn hãy hỏi theo các mẫu như: hôm nay có bao nhiêu người làm, ai làm ca tối nay, thống kê chấm công hôm nay.",
  };
}

function extractMutationFromMessage(message: string, today: string): MutationPayload | null {
  const normalized = normalizeText(message);

  if (normalized.includes("cho") && normalized.includes("nghi")) {
    const employeeMatch = message.match(/nhân viên\s+(.+?)(?:\s+hôm nay|\s+ngày|\s*$)/i);
    return {
      action: "delete_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: employeeMatch?.[1] ? [employeeMatch[1].trim()] : [],
    };
  }

  if (normalized.includes("them ca")) {
    const employeeMatch = message.match(/nhân viên\s+(.+?)(?:\s+hôm nay|\s+ngày|\s*$)/i);
    return {
      action: "add_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: employeeMatch?.[1] ? [employeeMatch[1].trim()] : [],
      shift_details: {
        start_time: "08:00",
        end_time: "17:00",
        shift_type: "FULL_TIME_8H",
      },
    };
  }

  return null;
}

function summarizeMutationRequest(payload: MutationPayload) {
  if (!payload.employee_names.length) {
    return "Tôi chưa xác định được nhân viên cần thay đổi. Hãy ghi rõ tên nhân viên.";
  }

  if (payload.action === "delete_shifts") {
    return `Tôi sẽ xóa ca làm ngày **${payload.date}** cho: **${payload.employee_names.join(", ")}**.\n\nBạn có muốn xác nhận thay đổi này không?`;
  }

  if (payload.action === "add_shifts") {
    const start = payload.shift_details?.start_time || "08:00";
    const end = payload.shift_details?.end_time || "17:00";
    return `Tôi sẽ thêm ca làm ngày **${payload.date}** (${start}-${end}) cho: **${payload.employee_names.join(", ")}**.\n\nBạn có muốn xác nhận thay đổi này không?`;
  }

  return "Tôi đã hiểu yêu cầu thay đổi. Bạn có muốn xác nhận thay đổi này không?";
}

async function handleFallback(
  message: string,
  messages: ChatMessage[],
  role: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  callerBranchId: string | null,
  today: string,
) {
  const pendingConfirmation = hasPendingConfirmation(messages.slice(0, -1));

  if (pendingConfirmation && role === "ADMIN") {
    if (includesAny(message, CANCEL_PHRASES)) {
      return { reply: "Đã hủy thay đổi theo yêu cầu của bạn.", mutations: false };
    }

    if (includesAny(message, CONFIRM_PHRASES)) {
      const sourceMessage = messages
        .slice(0, -1)
        .filter((item) => item.role === "user" && item.content)
        .map((item) => item.content!.trim())
        .reverse()
        .find((content) => extractMutationFromMessage(content, today));

      const payload = sourceMessage ? extractMutationFromMessage(sourceMessage, today) : null;
      if (!payload || payload.employee_names.length === 0) {
        return { reply: "Không xác định được thay đổi cần thực hiện. Hãy gửi lại yêu cầu cụ thể hơn.", mutations: false };
      }

      const result = await executeMutation(payload, supabaseAdmin);
      return {
        reply: `Đã thực hiện thay đổi thành công.\n\n\`\`\`json\n${JSON.stringify(result, null, 2)}\n\`\`\``,
        mutations: true,
      };
    }
  }

  if (role === "ADMIN") {
    const mutationPayload = extractMutationFromMessage(message, today);
    if (mutationPayload) {
      return {
        reply: summarizeMutationRequest(mutationPayload),
        mutations: false,
      };
    }
  }

  const inferred = inferFallbackIntent(message, role, today);
  if (inferred.reply) {
    return { reply: inferred.reply, mutations: false };
  }

  const result = await executeQuery(inferred.queryArgs || {}, supabaseAdmin, callerBranchId, role);
  if (result.error) {
    return { reply: result.error, mutations: false };
  }

  return {
    reply: buildSummaryReplyFromQuery(message, result, today),
    mutations: false,
  };
}

serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    const authHeader = req.headers.get("authorization") || "";
    const token = authHeader.replace("Bearer ", "");
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const anonKey = Deno.env.get("SUPABASE_PUBLISHABLE_KEY") || Deno.env.get("SUPABASE_ANON_KEY")!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { data: { user }, error: authError } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: "Unauthorized" }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roles } = await supabaseAdmin.from("user_roles").select("role").eq("user_id", user.id);
    const userRole = roles?.[0]?.role || "EMPLOYEE";

    if (userRole === "EMPLOYEE") {
      return jsonResponse({ error: "Chỉ Admin/HR mới có quyền sử dụng Trợ lý AI." }, 403);
    }

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("branch_id").eq("user_id", user.id).single();
    const callerBranchId = callerProfile?.branch_id || null;
    const { messages } = await req.json();
    const safeMessages = Array.isArray(messages) ? messages as ChatMessage[] : [];
    const currentMessage = latestUserMessage(safeMessages);
    const today = new Date().toISOString().split("T")[0];

    const geminiApiKey = Deno.env.get("GEMINI_API_KEY");
    if (!geminiApiKey) {
      const fallback = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, today);
      return jsonResponse({ ...fallback, role: userRole, mode: "fallback" });
    }

    try {
      const systemPrompt = getSystemPrompt(userRole, today);
      const contents = buildGeminiContents(safeMessages);
      const tools = buildGeminiTools(userRole);

      const data = await callGemini({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents,
        tools,
      }, geminiApiKey);

      const functionCalls = extractFunctionCallsFromGemini(data);
      if (functionCalls.length === 0) {
        return jsonResponse({
          reply: extractTextFromGemini(data) || "Xin lỗi, tôi chưa hiểu rõ yêu cầu.",
          mutations: false,
          role: userRole,
          mode: "gemini",
        });
      }

      const toolResults: any[] = [];
      let hasMutation = false;

      for (const functionCall of functionCalls) {
        const args = functionCall.args || {};

        if (functionCall.name === "query_hr_data") {
          const result = await executeQuery(args, supabaseAdmin, callerBranchId, userRole);
          toolResults.push({
            role: "user",
            parts: [{
              functionResponse: {
                name: functionCall.name,
                response: { result },
              },
            }],
          });
        } else if (functionCall.name === "execute_shift_mutation") {
          if (userRole !== "ADMIN") {
            toolResults.push({
              role: "user",
              parts: [{
                functionResponse: {
                  name: functionCall.name,
                  response: { error: "Bạn không có quyền thay đổi dữ liệu." },
                },
              }],
            });
          } else {
            const result = await executeMutation(args, supabaseAdmin);
            toolResults.push({
              role: "user",
              parts: [{
                functionResponse: {
                  name: functionCall.name,
                  response: { result },
                },
              }],
            });
            hasMutation = true;
          }
        }
      }

      const followData = await callGemini({
        system_instruction: { parts: [{ text: systemPrompt }] },
        contents: [...contents, data.candidates?.[0]?.content, ...toolResults].filter(Boolean),
        tools,
      }, geminiApiKey);

      return jsonResponse({
        reply: extractTextFromGemini(followData) || "Đã xử lý xong.",
        mutations: hasMutation,
        role: userRole,
        mode: "gemini",
      });
    } catch (error) {
      console.error("Gemini flow failed, switching to fallback:", error);
      const fallback = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, today);
      return jsonResponse({
        ...fallback,
        role: userRole,
        mode: "fallback",
        warning: error instanceof Error ? error.message : "Gemini flow failed",
      });
    }
  } catch (error) {
    console.error("ai-shift-assistant error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
