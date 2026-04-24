import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.49.4";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

const OPENAI_MODEL = "gpt-4.1-mini";
const AI_CHAT_WINDOW_SECONDS = 60;
const AI_CHAT_MAX_REQUESTS_PER_WINDOW = 12;
const CONFIRM_PHRASES = ["xác nhận", "dong y", "đồng ý", "ok", "oke", "confirm", "thực hiện"];
const CANCEL_PHRASES = ["hủy", "huy", "không", "khong", "cancel", "thôi", "dừng"];

type ChatMessage = {
  role: string;
  content?: string;
};

type QueryResult = {
  count?: number;
  data?: any[];
  missing_checkin?: any[];
  scheduled_count?: number;
  message?: string;
  error?: string;
};

type ActorContext = {
  callerRole: string;
  callerBranchId: string | null;
  actorName?: string | null;
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

type EvaluationPayload = {
  employee_name: string;
  employee_id: string;
  evaluation_date: string;
  categories_scores: Record<string, Record<string, number>>;
  feedback_events: string[];
  bonus_score: number;
  manager_comment: string;
  total_score: number;
  branch_id: string | null;
};

type ChatAuditPayload = {
  conversationId: string;
  userId: string;
  userRole: string;
  branchId: string | null;
  actorName: string | null;
  userMessage: string;
  assistantReply: string;
  mutationsApplied: boolean;
  metadata?: Record<string, unknown>;
};

const EVALUATION_CATEGORIES = [
  {
    key: "thai_do",
    label: "Thái độ & tác phong",
    criteria: [
      { key: "than_thien", label: "Thân thiện, chào hỏi", max: 10 },
      { key: "khong_thai_do", label: "Không thái độ, không cãi khách", max: 10 },
      { key: "ton_trong", label: "Tôn trọng đồng nghiệp", max: 5 },
    ],
  },
  {
    key: "ky_nang",
    label: "Kỹ năng phục vụ",
    criteria: [
      { key: "ghi_order", label: "Ghi order chính xác", max: 10 },
      { key: "hieu_menu", label: "Hiểu menu, tư vấn", max: 5 },
      { key: "dung_quy_trinh", label: "Đúng quy trình phục vụ", max: 5 },
    ],
  },
  {
    key: "toc_do",
    label: "Tốc độ & hiệu suất",
    criteria: [
      { key: "phuc_vu_nhanh", label: "Phục vụ nhanh, không để khách chờ", max: 10 },
      { key: "quan_ly_ban", label: "Quản lý nhiều bàn tốt", max: 10 },
    ],
  },
  {
    key: "tuan_thu",
    label: "Tuân thủ quy định",
    criteria: [
      { key: "dong_phuc", label: "Đồng phục", max: 5 },
      { key: "khong_dien_thoai", label: "Không dùng điện thoại", max: 5 },
      { key: "khong_tu_tap", label: "Không tụ tập", max: 5 },
    ],
  },
  {
    key: "tinh_than",
    label: "Tinh thần làm việc",
    criteria: [
      { key: "chu_dong", label: "Chủ động", max: 5 },
      { key: "ho_tro", label: "Hỗ trợ đồng đội", max: 5 },
    ],
  },
] as const;

const FEEDBACK_EVENTS = [
  { key: "khach_khen", label: "khách khen", points: 10 },
  { key: "nhac_nhe", label: "nhắc nhở", points: -5 },
  { key: "phan_nan_truc_tiep", label: "phàn nàn trực tiếp", points: -10 },
  { key: "phan_nan_quan_ly", label: "phàn nàn lên quản lý", points: -20 },
] as const;

type OpenAIFunctionCall = {
  id?: string;
  function?: {
    name?: string;
    arguments?: string;
  };
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

function actorLabel(actor: ActorContext) {
  if (actor.actorName) return actor.actorName;
  return actor.callerRole === "HR" ? "Quản lý" : "HR";
}

function formatDisplayDate(date: string) {
  const [year, month, day] = date.split("-");
  return day && month && year ? `${day}/${month}/${year}` : date;
}

async function enqueueTransactionalEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: Record<string, unknown>,
) {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL");
    const serviceRoleKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!supabaseUrl || !serviceRoleKey) {
      console.warn("send-transactional-email skipped: missing Supabase env");
      return;
    }

    const response = await fetch(`${supabaseUrl}/functions/v1/send-transactional-email`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${serviceRoleKey}`,
        apikey: serviceRoleKey,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const errorText = await response.text();
      console.warn("send-transactional-email failed:", response.status, errorText);
    }
  } catch (error) {
    console.warn("send-transactional-email exception:", error);
  }
}

async function sendShiftAssignedEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  employee: { user_id: string; name: string },
  date: string,
  startTime: string,
  endTime: string,
  actor: ActorContext,
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, name")
    .eq("user_id", employee.user_id)
    .maybeSingle();

  if (!profile?.email) return;

  await enqueueTransactionalEmail(supabaseAdmin, {
    templateName: "shift-assigned",
    recipientEmail: profile.email,
    idempotencyKey: `ai-shift-assigned-${employee.user_id}-${date}-${startTime}-${endTime}`,
    templateData: {
      name: profile.name || employee.name,
      shiftDate: formatDisplayDate(date),
      startTime: startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      assignedBy: actorLabel(actor),
    },
  });
}

async function sendShiftCancelledEmail(
  supabaseAdmin: ReturnType<typeof createClient>,
  employee: { user_id: string; name: string },
  date: string,
  startTime: string,
  endTime: string,
  actor: ActorContext,
  reason?: string,
) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("email, name")
    .eq("user_id", employee.user_id)
    .maybeSingle();

  if (!profile?.email) return;

  await enqueueTransactionalEmail(supabaseAdmin, {
    templateName: "shift-cancelled",
    recipientEmail: profile.email,
    idempotencyKey: `ai-shift-cancelled-${employee.user_id}-${date}-${startTime}-${endTime}`,
    templateData: {
      name: profile.name || employee.name,
      shiftDate: formatDisplayDate(date),
      startTime: startTime.slice(0, 5),
      endTime: endTime.slice(0, 5),
      cancelledBy: actorLabel(actor),
      reason,
    },
  });
}

async function getItRecipients(
  supabaseAdmin: ReturnType<typeof createClient>,
) {
  const { data, error } = await supabaseAdmin
    .from("user_roles")
    .select("user_id")
    .eq("role", "IT");

  if (error || !data?.length) {
    console.error("Failed to load IT recipients:", error);
    return [];
  }

  const userIds = data.map((item) => item.user_id).filter(Boolean);
  const { data: profiles, error: profileError } = await supabaseAdmin
    .from("profiles")
    .select("user_id, email, name")
    .in("user_id", userIds);

  if (profileError) {
    console.error("Failed to load IT recipient profiles:", profileError);
    return [];
  }

  return (profiles ?? []).filter((profile) => profile.email);
}

async function notifyItUsersOpenAICreditExhausted(
  supabaseAdmin: ReturnType<typeof createClient>,
  actorName: string | null,
  userRole: string,
) {
  const recipients = await getItRecipients(supabaseAdmin);
  if (recipients.length === 0) return;

  const happenedAt = new Date().toISOString();
  const hourBucket = happenedAt.slice(0, 13);
  const requesterRole = userRole === "ADMIN" ? "HR" : "Quản lý";

  for (const recipient of recipients) {
    await enqueueTransactionalEmail(supabaseAdmin, {
      templateName: "ai-credit-exhausted-alert",
      recipientEmail: recipient.email,
      idempotencyKey: `ai-credit-exhausted-${recipient.user_id}-${hourBucket}`,
      templateData: {
        requesterName: actorName || "Không rõ",
        requesterRole,
        happenedAt,
      },
    });
  }
}

async function enforceAiChatRateLimit(
  supabaseAdmin: ReturnType<typeof createClient>,
  userId: string,
  message: string,
) {
  const windowStartIso = new Date(Date.now() - AI_CHAT_WINDOW_SECONDS * 1000).toISOString();

  const { count, error: countError } = await supabaseAdmin
    .from("ai_chat_rate_limits")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", windowStartIso);

  if (countError) {
    throw new Error(`Rate limit check failed: ${countError.message}`);
  }

  if ((count || 0) >= AI_CHAT_MAX_REQUESTS_PER_WINDOW) {
    return { allowed: false };
  }

  const { error: insertError } = await supabaseAdmin
    .from("ai_chat_rate_limits")
    .insert({
      user_id: userId,
      message_preview: message.slice(0, 200),
    });

  if (insertError) {
    throw new Error(`Rate limit write failed: ${insertError.message}`);
  }

  return { allowed: true };
}

async function logAiChatTurn(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: ChatAuditPayload,
) {
  try {
    const { error } = await supabaseAdmin.from("ai_chat_audit_logs").insert({
      conversation_id: payload.conversationId,
      user_id: payload.userId,
      user_role: payload.userRole,
      branch_id: payload.branchId,
      actor_name: payload.actorName,
      user_message: payload.userMessage,
      assistant_reply: payload.assistantReply,
      mutations_applied: payload.mutationsApplied,
      metadata: payload.metadata || {},
    });

    if (error) {
      console.error("Failed to log ai chat audit:", error);
    }
  } catch (error) {
    console.error("ai chat audit exception:", error);
  }
}

async function getSystemApiKey(
  supabaseAdmin: ReturnType<typeof createClient>,
  service: "openai" | "resend",
) {
  const { data, error } = await supabaseAdmin
    .from("system_api_configs")
    .select("api_key")
    .eq("service", service)
    .maybeSingle();

  if (error) {
    console.error(`Failed to load ${service} api key override:`, error);
    return null;
  }

  const value = data?.api_key?.trim();
  return value ? value : null;
}

function buildLoggedResponse(
  body: Record<string, unknown>,
  status: number,
  audit: ChatAuditPayload | null,
  supabaseAdmin: ReturnType<typeof createClient> | null,
) {
  if (audit && supabaseAdmin) {
    const assistantReply = typeof body.reply === "string"
      ? body.reply
      : typeof body.error === "string"
      ? body.error
      : "";
    void logAiChatTurn(supabaseAdmin, {
      ...audit,
      assistantReply,
      mutationsApplied: Boolean(body.mutations),
      metadata: {
        ...(audit.metadata || {}),
        status,
        mode: body.mode,
        warning: body.warning,
      },
    });
  }

  return jsonResponse(body, status);
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

function previousUserMessage(messages: ChatMessage[]) {
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

function canMutate(role: string) {
  return role === "ADMIN" || role === "HR";
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

Vai trò của bạn: QUẢN LÝ CHI NHÁNH.
- Có thể truy vấn thông tin trong hệ thống liên quan đến ca làm, chấm công, đánh giá, nhân sự và chi nhánh của mình.
- Có thể xếp ca, thêm ca, hủy ca cho nhân viên thuộc chi nhánh mình quản lý.
- Với mọi yêu cầu thay đổi ca làm, phải tóm tắt hành động trước và kết thúc bằng đúng câu:
"Bạn có muốn xác nhận thay đổi này không?"
- Chỉ thực hiện mutation sau khi người dùng xác nhận.
- Không được thay đổi dữ liệu ngoài phạm vi chi nhánh của mình.`;
  }

  return `${base}

Vai trò của bạn: HR TOÀN HỆ THỐNG.
- Có thể truy vấn và thay đổi dữ liệu toàn hệ thống.
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
          enum: ["shifts", "attendance", "evaluations", "employees", "branches", "monthly_summary"],
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

function buildOpenAIMessages(messages: ChatMessage[], systemPrompt: string) {
  const chatMessages = messages
    .filter((message) => typeof message?.content === "string" && message.content.trim().length > 0)
    .map((message) => ({
      role: message.role === "assistant" ? "assistant" : "user",
      content: message.content!.trim(),
    }));

  return [{ role: "system", content: systemPrompt }, ...chatMessages];
}

function buildOpenAITools(role: string) {
  return canMutate(role) ? [queryTool, mutationTool] : [queryTool];
}

async function callOpenAI(payload: Record<string, unknown>, apiKey: string) {
  const response = await fetch("https://api.openai.com/v1/chat/completions", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`OpenAI API error ${response.status}: ${body}`);
  }

  return response.json();
}

function extractTextFromOpenAI(data: any): string {
  return data?.choices?.[0]?.message?.content?.trim() || "";
}

function extractFunctionCallsFromOpenAI(data: any): OpenAIFunctionCall[] {
  return data?.choices?.[0]?.message?.tool_calls || [];
}

function parseFunctionArgs(rawArgs?: string) {
  if (!rawArgs) return {};

  try {
    return JSON.parse(rawArgs) as Record<string, unknown>;
  } catch {
    return {};
  }
}

function buildToolMessages(toolCalls: OpenAIFunctionCall[], toolResults: any[]) {
  const assistantToolCallMessage = {
    role: "assistant",
    content: null,
    tool_calls: toolCalls.map((toolCall) => ({
      id: toolCall.id,
      type: "function",
      function: {
        name: toolCall.function?.name,
        arguments: toolCall.function?.arguments || "{}",
      },
    })),
  };

  const toolMessages = toolCalls.map((toolCall, index) => ({
    role: "tool",
    tool_call_id: toolCall.id,
    content: JSON.stringify(toolResults[index] || {}),
  }));

  return [assistantToolCallMessage, ...toolMessages];
}

function isOpenAIQuotaError(error: unknown) {
  const message = error instanceof Error ? error.message.toLowerCase() : String(error).toLowerCase();

  return [
    "insufficient_quota",
    "billing_hard_limit_reached",
    "exceeded your current quota",
    "credit balance is too low",
    "quota",
  ].some((token) => message.includes(token));
}

function inferDateFromMessage(message: string, today: string) {
  const normalized = normalizeText(message);
  if (normalized.includes("hom nay")) return today;
  return today;
}

function getMonthRange(date: string) {
  const baseDate = new Date(`${date}T00:00:00`);
  const year = baseDate.getUTCFullYear();
  const month = baseDate.getUTCMonth();
  const start = new Date(Date.UTC(year, month, 1));
  const end = new Date(Date.UTC(year, month + 1, 0));

  return {
    start: start.toISOString().slice(0, 10),
    end: end.toISOString().slice(0, 10),
  };
}

function calculateShiftHours(startTime?: string | null, endTime?: string | null) {
  if (!startTime || !endTime) return 0;

  const [startHour, startMinute] = startTime.split(":").map((value) => Number(value || 0));
  const [endHour, endMinute] = endTime.split(":").map((value) => Number(value || 0));

  let startTotalMinutes = startHour * 60 + startMinute;
  let endTotalMinutes = endHour * 60 + endMinute;
  if (endTotalMinutes <= startTotalMinutes) endTotalMinutes += 24 * 60;

  return Math.max(0, (endTotalMinutes - startTotalMinutes) / 60);
}

function getFlatEvaluationCriteria() {
  return EVALUATION_CATEGORIES.flatMap((category) =>
    category.criteria.map((criterion) => ({
      categoryKey: category.key,
      categoryLabel: category.label,
      criterionKey: criterion.key,
      criterionLabel: criterion.label,
      max: criterion.max,
    }))
  );
}

function buildInitialEvaluationScores() {
  return Object.fromEntries(
    EVALUATION_CATEGORIES.map((category) => [
      category.key,
      Object.fromEntries(category.criteria.map((criterion) => [criterion.key, 0])),
    ]),
  );
}

function extractNumericScore(message: string) {
  const match = normalizeText(message).match(/\b(\d{1,3})\b/);
  return match ? Number(match[1]) : null;
}

function isYesMessage(message: string) {
  const normalized = normalizeText(message);
  return ["co", "có", "yes", "y", "ok"].some((item) => normalized === normalizeText(item) || normalized.includes(normalizeText(item)));
}

function isNoMessage(message: string) {
  const normalized = normalizeText(message);
  return ["khong", "không", "ko", "kh", "no"].some((item) => normalized === normalizeText(item) || normalized.includes(normalizeText(item)));
}

function hasActiveEvaluationPrompt(messages: ChatMessage[]) {
  const lastAssistant = previousAssistantMessage(messages);
  const normalized = normalizeText(lastAssistant);
  return (
    normalized.includes("anh muon cham diem cho ai") ||
    normalized.includes("dang cham diem cho") ||
    normalized.includes("phan diem co ban da xong") ||
    normalized.includes("ca nay co doanh thu tren 100 trieu khong") ||
    normalized.includes("hay nhap nhan xet quan ly cho")
  );
}

function shouldUseDeterministicFallback(message: string, messages: ChatMessage[]) {
  const normalized = normalizeText(message);
  const refersToPriorContext =
    normalized.includes("ca do") ||
    normalized.includes("nguoi do") ||
    normalized.includes("ban do") ||
    normalized.includes("ca nay");
  const mentionsMutation =
    normalized.includes("xoa") ||
    normalized.includes("huy") ||
    normalized.includes("sua") ||
    normalized.includes("doi") ||
    normalized.includes("them ca") ||
    normalized.includes("xep ca");
  const startsEvaluation =
    normalized.includes("cham diem") ||
    normalized.includes("chấm điểm") ||
    normalized.includes("danh gia nhan vien") ||
    normalized.includes("đánh giá nhân viên");

  return hasActiveEvaluationPrompt(messages) || startsEvaluation || (refersToPriorContext && mentionsMutation);
}

function isMissingCheckinIntent(message: string) {
  const normalized = normalizeText(message);
  return (
    normalized.includes("khong checkin") ||
    normalized.includes("khong check-in") ||
    normalized.includes("khong cham cong") ||
    normalized.includes("chua checkin") ||
    normalized.includes("chua check-in") ||
    normalized.includes("chua cham cong")
  );
}

function isAttendanceNameFollowUp(message: string) {
  const normalized = normalizeText(message);
  return (
    normalized.includes("gui ten") ||
    normalized.includes("cho toi ten") ||
    normalized.includes("liet ke ten") ||
    normalized.includes("gui danh sach") ||
    normalized.includes("danh sach ten")
  );
}

function formatMissingCheckinReply(result: QueryResult, today: string, includeNames: boolean) {
  const missingRows = (result.missing_checkin || []) as Array<{ name?: string }>;

  if (missingRows.length === 0) {
    return `Hôm nay (${today}) không có nhân viên nào bị thiếu check-in trong phạm vi tra cứu.`;
  }

  const lines = [`Hôm nay (${today}) có **${missingRows.length}** nhân viên chưa check-in.`];

  if (includeNames || missingRows.length <= 10) {
    lines.push(...missingRows.map((row, index) => `${index + 1}. ${row.name || "Không rõ"}`));
  } else {
    lines.push("Nếu cần danh sách tên, hãy nói: `gửi tên cho tôi`.");
  }

  return lines.join("\n");
}

function inferEmployeeNameFromMessage(message: string) {
  const trimmedMessage = message.trim();
  const stopTokens = [
    "hôm nay",
    "ngày mai",
    "ngày",
    "trong hôm nay",
    "trong ngày",
    "từ",
    "lúc",
    "ca",
    "chi nhánh",
    "nghỉ",
    "xóa",
    "xoa",
    "hủy",
    "huy",
    "sửa",
    "sua",
    "đổi",
    "doi",
    "cho tôi",
    "giúp tôi",
    "dùm tôi",
  ];

  const cleanupCandidate = (rawCandidate?: string | null) => {
    if (!rawCandidate) return undefined;
    let candidate = rawCandidate.trim();
    for (const token of stopTokens) {
      const index = normalizeText(candidate).indexOf(normalizeText(token));
      if (index > 0) {
        candidate = candidate.slice(0, index).trim();
      }
    }
    candidate = candidate.replace(/[,.!?]+$/g, "").trim();
    return isLikelyEmployeeName(candidate) ? candidate : undefined;
  };

  const explicitEmployee = message.match(/nhân viên\s+(.+)/i);
  const explicitCandidate = cleanupCandidate(explicitEmployee?.[1]);
  if (explicitCandidate) return explicitCandidate;

  const forPerson = message.match(/cho\s+(.+)/i);
  const forCandidate = cleanupCandidate(forPerson?.[1]);
  if (forCandidate) return forCandidate;

  const ofPerson = message.match(/của\s+(.+)/i);
  const ofCandidate = cleanupCandidate(ofPerson?.[1]);
  if (ofCandidate) return ofCandidate;

  const trailingName = message.match(/(?:cho tôi|giúp tôi|dùm tôi|đi)\s+([A-Za-zÀ-ỹ][A-Za-zÀ-ỹ\s]{1,60})$/i);
  if (trailingName?.[1]) {
    const candidate = trailingName[1].trim();
    if (isLikelyEmployeeName(candidate)) return candidate;
  }

  const endingName = message.match(/(?:\s|^)([A-Za-zÀ-ỹ]+(?:\s+[A-Za-zÀ-ỹ]+){1,4})$/i);
  if (endingName?.[1]) {
    const candidate = endingName[1].trim();
    if (isLikelyEmployeeName(candidate)) return candidate;
  }

  if (trimmedMessage.length > 0 && isLikelyEmployeeName(trimmedMessage)) {
    return trimmedMessage;
  }

  return undefined;
}

function isLikelyEmployeeName(candidate: string) {
  const normalized = normalizeText(candidate);
  if (!normalized) return false;

  const blockedPhrases = [
    "nhan vien",
    "lam",
    "ca",
    "toi",
    "hom nay",
    "ngay mai",
    "chi nhanh",
    "tu",
    "den",
    "sang",
    "chieu",
    "nguoi do",
    "nguoi nay",
    "ban ay",
    "ban do",
    "cho toi",
    "giup toi",
    "dum toi",
    "sua ca",
    "doi ca",
    "nghi",
    "trong hom nay",
    "trong ngay",
    "xoa ca",
    "huy ca",
  ];

  if (blockedPhrases.some((phrase) => normalized === phrase || normalized.includes(`${phrase} `) || normalized.endsWith(` ${phrase}`))) {
    return false;
  }

  if (normalized.length < 2) return false;
  return true;
}

function inferShiftTimesFromMessage(message: string) {
  const compact = message.match(/(\d{1,2})[:h](\d{2})?\s*(?:-|đến|toi|tới|den)\s*(\d{1,2})[:h](\d{2})?/i);
  if (!compact) return undefined;

  const startHour = compact[1].padStart(2, "0");
  const startMinute = (compact[2] || "00").padStart(2, "0");
  const endHour = compact[3].padStart(2, "0");
  const endMinute = (compact[4] || "00").padStart(2, "0");

  return {
    start_time: `${startHour}:${startMinute}`,
    end_time: `${endHour}:${endMinute}`,
    shift_type: "FULL_TIME_8H" as const,
  };
}

function inferSingleTimeFromMessage(message: string) {
  const match = message.match(/(?:từ|luc|lúc|tu)\s*(\d{1,2})[:h](\d{2})?/i);
  if (!match) return undefined;
  return `${match[1].padStart(2, "0")}:${(match[2] || "00").padStart(2, "0")}`;
}

function inferEmployeeNameFromAssistantContext(messages: ChatMessage[]) {
  const assistantHistory = messages
    .filter((item) => item.role === "assistant" && item.content)
    .map((item) => item.content!.trim())
    .reverse();

  for (const content of assistantHistory) {
    const numberedMatches = [...content.matchAll(/\d+\.\s+(.+?)(?:\s+-\s+\d{4}-\d{2}-\d{2}|\s+\(\d{2}:\d{2}-\d{2}:\d{2}\)|$)/g)];
    if (numberedMatches.length === 1) {
      const candidate = numberedMatches[0][1]?.trim();
      if (candidate && isLikelyEmployeeName(candidate)) return candidate;
    }

    const singleShiftMatch = content.match(/cho:\s+\*\*(.+?)\*\*/i);
    if (singleShiftMatch?.[1] && isLikelyEmployeeName(singleShiftMatch[1].trim())) {
      return singleShiftMatch[1].trim();
    }

    const singleListMatch = content.match(/1\.\s+(.+?)(?:\s+-\s+\d{4}-\d{2}-\d{2}|\s+\(\d{2}:\d{2}-\d{2}:\d{2}\)|$)/i);
    if (singleListMatch?.[1] && isLikelyEmployeeName(singleListMatch[1].trim())) {
      return singleListMatch[1].trim();
    }
  }

  return undefined;
}

function buildMutationPatchFromMessage(
  message: string,
  messages: ChatMessage[],
): Partial<MutationPayload> | null {
  const inferredName = inferEmployeeNameFromMessage(message) || inferEmployeeNameFromAssistantContext(messages);
  const inferredTimes = inferShiftTimesFromMessage(message);
  const normalized = normalizeText(message);
  const refersToPreviousPerson =
    normalized.includes("nguoi do") ||
    normalized.includes("nguoi nay") ||
    normalized.includes("ban ay") ||
    normalized.includes("ban do");
  const contextualName = refersToPreviousPerson ? inferEmployeeNameFromAssistantContext(messages) : undefined;
  const resolvedName = inferEmployeeNameFromMessage(message) || contextualName;

  if (!resolvedName && !inferredTimes) return null;

  return {
    employee_names: resolvedName ? [resolvedName] : [],
    shift_details: inferredTimes,
  };
}

function findLatestDiscussedMutation(messages: ChatMessage[], today: string) {
  const history = messages
    .filter((item) => item.role === "user" && item.content)
    .map((item) => item.content!.trim())
    .reverse();

  for (const content of history) {
    const normalized = normalizeText(content);
    if (includesAny(content, CONFIRM_PHRASES) || includesAny(content, CANCEL_PHRASES)) continue;
    if (normalized === "confirm" || normalized === "cancel") continue;
    const payload = extractMutationFromMessage(content, today);
    if (payload) return payload;
  }

  return null;
}

function mergeWithPreviousMutation(
  current: MutationPayload | null,
  previous: MutationPayload | null,
  patch?: Partial<MutationPayload> | null,
): MutationPayload | null {
  if (!current && previous && patch) {
    return {
      action: previous.action,
      date: previous.date,
      employee_names: patch.employee_names?.length ? patch.employee_names : previous.employee_names,
      shift_details: {
        start_time: patch.shift_details?.start_time || previous.shift_details?.start_time,
        end_time: patch.shift_details?.end_time || previous.shift_details?.end_time,
        shift_type: patch.shift_details?.shift_type || previous.shift_details?.shift_type || "FULL_TIME_8H",
      },
    };
  }

  if (!current) return previous;
  if (!previous) return current;

  return {
    action: current.action,
    date: current.date || previous.date,
    employee_names: current.employee_names.length > 0
      ? current.employee_names
      : patch?.employee_names?.length
      ? patch.employee_names
      : previous.employee_names,
    shift_details: {
      start_time: current.shift_details?.start_time || patch?.shift_details?.start_time || previous.shift_details?.start_time,
      end_time: current.shift_details?.end_time || patch?.shift_details?.end_time || previous.shift_details?.end_time,
      shift_type: current.shift_details?.shift_type || patch?.shift_details?.shift_type || previous.shift_details?.shift_type || "FULL_TIME_8H",
    },
  };
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
  const referenceDate = date || dateFrom || new Date().toISOString().slice(0, 10);

  const { data: branchList } = await supabaseAdmin.from("branches").select("id, branch_name");
  const branchMap = Object.fromEntries((branchList || []).map((b: any) => [b.id, b.branch_name]));

  if (queryType === "shifts") {
    let query = supabaseAdmin.from("shifts").select("id, user_id, shift_date, start_time, end_time, shift_type, actual_branch_id");
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
      const resolvedBranchId = s.actual_branch_id || p.branch_id || null;
      return {
        name: p.name || "Không rõ",
        branch: branchMap[resolvedBranchId] || "Chưa phân chi nhánh",
        branch_id: resolvedBranchId,
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
    const effectiveDate = date || (dateFrom && dateFrom === dateTo ? dateFrom : null);
    let scheduledShifts: any[] = [];

    if (effectiveDate) {
      const { data: shifts } = await supabaseAdmin
        .from("shifts")
        .select("user_id, shift_date, start_time, end_time, actual_branch_id")
        .eq("shift_date", effectiveDate);
      scheduledShifts = shifts || [];
    }

    const profileUserIds = [...new Set([
      ...((checkins || []).map((c: any) => c.user_id)),
      ...scheduledShifts.map((shift: any) => shift.user_id),
    ])];

    if (profileUserIds.length === 0) {
      return { count: 0, data: [], missing_checkin: [], message: "Không tìm thấy dữ liệu chấm công." };
    }

    const { data: profiles } = await supabaseAdmin
      .from("profiles")
      .select("user_id, name, branch_id")
      .in("user_id", profileUserIds);
    const profileMap = Object.fromEntries((profiles || []).map((p: any) => [p.user_id, p]));

    let result = (checkins || []).map((c: any) => {
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

    let missingCheckin = scheduledShifts
      .filter((shift: any) => !(checkins || []).some((checkin: any) => checkin.user_id === shift.user_id))
      .map((shift: any) => {
        const profile = profileMap[shift.user_id] || {};
        const resolvedBranchId = shift.actual_branch_id || profile.branch_id || null;

        return {
          user_id: shift.user_id,
          name: profile.name || "Không rõ",
          branch: branchMap[resolvedBranchId] || "Chưa phân chi nhánh",
          branch_id: resolvedBranchId,
          date: shift.shift_date,
          start: shift.start_time?.slice(0, 5),
          end: shift.end_time?.slice(0, 5),
        };
      });

    if (callerRole === "HR" && callerBranchId) {
      missingCheckin = missingCheckin.filter((row: any) => row.branch_id === callerBranchId);
    }
    if (branchId) {
      missingCheckin = missingCheckin.filter((row: any) => row.branch_id === branchId);
    }
    if (employeeName) {
      const lower = employeeName.toLowerCase();
      missingCheckin = missingCheckin.filter((row: any) => row.name.toLowerCase().includes(lower));
    }

    return {
      count: result.length,
      data: result,
      missing_checkin: missingCheckin,
      scheduled_count: scheduledShifts.length,
    };
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

  if (queryType === "branches") {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("user_id, branch_id, name");
    const counts = new Map<string, number>();
    for (const profile of profiles || []) {
      if (!profile.branch_id) continue;
      counts.set(profile.branch_id, (counts.get(profile.branch_id) || 0) + 1);
    }

    let result = (branchList || []).map((branch: any) => ({
      id: branch.id,
      branch_name: branch.branch_name,
      employee_count: counts.get(branch.id) || 0,
    }));

    return { count: result.length, data: result };
  }

  if (queryType === "monthly_summary") {
    const range = getMonthRange(referenceDate);

    const { data: shiftRows } = await supabaseAdmin
      .from("shifts")
      .select("user_id, shift_date, start_time, end_time, actual_branch_id")
      .gte("shift_date", range.start)
      .lte("shift_date", range.end);

    const { data: evaluationRows } = await supabaseAdmin
      .from("evaluations")
      .select("employee_id, total_score, evaluation_date, branch_id")
      .gte("evaluation_date", range.start)
      .lte("evaluation_date", range.end);

    const editMonthKey = range.start.slice(0, 7);
    const { data: penaltyRows } = await supabaseAdmin
      .from("shift_edit_logs")
      .select("employee_id, edit_count, penalty_amount, edit_month")
      .eq("edit_month", editMonthKey);

    const { data: attendanceRows } = await supabaseAdmin
      .from("check_ins")
      .select("user_id, late_minutes, early_leave_minutes, branch_id, check_in_time")
      .gte("check_in_time", `${range.start}T00:00:00`)
      .lt("check_in_time", `${range.end}T23:59:59`);

    const userIds = [
      ...new Set([
        ...((shiftRows || []).map((row: any) => row.user_id)),
        ...((evaluationRows || []).map((row: any) => row.employee_id)),
        ...((penaltyRows || []).map((row: any) => row.employee_id)),
        ...((attendanceRows || []).map((row: any) => row.user_id)),
      ]),
    ];

    const { data: profiles } = userIds.length > 0
      ? await supabaseAdmin.from("profiles").select("user_id, name, branch_id").in("user_id", userIds)
      : { data: [] as any[] };

    const profileMap = Object.fromEntries((profiles || []).map((profile: any) => [profile.user_id, profile]));

    const filteredShifts = (shiftRows || []).filter((row: any) => {
      const profile = profileMap[row.user_id] || {};
      const resolvedBranchId = row.actual_branch_id || profile.branch_id || null;
      if (callerRole === "HR" && callerBranchId && resolvedBranchId !== callerBranchId) return false;
      if (branchId && resolvedBranchId !== branchId) return false;
      return true;
    });

    const filteredEvaluations = (evaluationRows || []).filter((row: any) => {
      const profile = profileMap[row.employee_id] || {};
      const resolvedBranchId = row.branch_id || profile.branch_id || null;
      if (callerRole === "HR" && callerBranchId && resolvedBranchId !== callerBranchId) return false;
      if (branchId && resolvedBranchId !== branchId) return false;
      return true;
    });

    const filteredPenalties = (penaltyRows || []).filter((row: any) => {
      const profile = profileMap[row.employee_id] || {};
      const resolvedBranchId = profile.branch_id || null;
      if (callerRole === "HR" && callerBranchId && resolvedBranchId !== callerBranchId) return false;
      if (branchId && resolvedBranchId !== branchId) return false;
      return true;
    });

    const filteredAttendance = (attendanceRows || []).filter((row: any) => {
      const profile = profileMap[row.user_id] || {};
      const resolvedBranchId = row.branch_id || profile.branch_id || null;
      if (callerRole === "HR" && callerBranchId && resolvedBranchId !== callerBranchId) return false;
      if (branchId && resolvedBranchId !== branchId) return false;
      return true;
    });

    const shiftHoursByUser = new Map<string, number>();
    const shiftCountByUser = new Map<string, number>();

    for (const row of filteredShifts) {
      shiftCountByUser.set(row.user_id, (shiftCountByUser.get(row.user_id) || 0) + 1);
      shiftHoursByUser.set(
        row.user_id,
        (shiftHoursByUser.get(row.user_id) || 0) + calculateShiftHours(row.start_time, row.end_time),
      );
    }

    const penaltyByUser = new Map<string, { penalty_amount: number; edit_count: number }>();
    for (const row of filteredPenalties) {
      const previous = penaltyByUser.get(row.employee_id) || { penalty_amount: 0, edit_count: 0 };
      penaltyByUser.set(row.employee_id, {
        penalty_amount: previous.penalty_amount + Number(row.penalty_amount || 0),
        edit_count: previous.edit_count + Number(row.edit_count || 0),
      });
    }

    const lowScore = [...filteredEvaluations].sort((a: any, b: any) => Number(a.total_score || 0) - Number(b.total_score || 0))[0];
    const topPenaltyEntry = [...penaltyByUser.entries()].sort((a, b) => b[1].penalty_amount - a[1].penalty_amount)[0];
    const topShiftEntry = [...shiftCountByUser.entries()].sort((a, b) => b[1] - a[1])[0];
    const topHoursEntry = [...shiftHoursByUser.entries()].sort((a, b) => b[1] - a[1])[0];
    const lateRows = filteredAttendance.filter((row: any) => Number(row.late_minutes || 0) > 0);
    const totalLateMinutes = lateRows.reduce((sum: number, row: any) => sum + Number(row.late_minutes || 0), 0);
    const attentionRows = [
      lowScore
        ? {
            type: "low_score",
            label: "Điểm thấp nhất",
            employee_name: profileMap[lowScore.employee_id]?.name || "Không rõ",
            value: Number(lowScore.total_score || 0),
          }
        : null,
      topPenaltyEntry
        ? {
            type: "penalty",
            label: "Bị phạt nhiều nhất",
            employee_name: profileMap[topPenaltyEntry[0]]?.name || "Không rõ",
            value: topPenaltyEntry[1].penalty_amount,
            edit_count: topPenaltyEntry[1].edit_count,
          }
        : null,
    ].filter(Boolean);

    return {
      count: filteredShifts.length,
      data: [
        {
          month_start: range.start,
          month_end: range.end,
          total_shifts: filteredShifts.length,
          total_hours: Number(
            [...shiftHoursByUser.values()].reduce((sum, value) => sum + value, 0).toFixed(2),
          ),
          total_employees: new Set(filteredShifts.map((row: any) => row.user_id)).size,
          total_late_cases: lateRows.length,
          total_late_minutes: totalLateMinutes,
          lowest_score_employee: lowScore
            ? {
                name: profileMap[lowScore.employee_id]?.name || "Không rõ",
                score: Number(lowScore.total_score || 0),
              }
            : null,
          highest_penalty_employee: topPenaltyEntry
            ? {
                name: profileMap[topPenaltyEntry[0]]?.name || "Không rõ",
                penalty_amount: topPenaltyEntry[1].penalty_amount,
                edit_count: topPenaltyEntry[1].edit_count,
              }
            : null,
          most_shifts_employee: topShiftEntry
            ? {
                name: profileMap[topShiftEntry[0]]?.name || "Không rõ",
                shift_count: topShiftEntry[1],
              }
            : null,
          most_hours_employee: topHoursEntry
            ? {
                name: profileMap[topHoursEntry[0]]?.name || "Không rõ",
                total_hours: Number(topHoursEntry[1].toFixed(2)),
              }
            : null,
          attention_items: attentionRows,
        },
      ],
    };
  }

  return { error: "Loại truy vấn không hợp lệ." };
}

async function executeMutation(
  args: Record<string, unknown>,
  supabaseAdmin: ReturnType<typeof createClient>,
  actor: ActorContext,
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

  if (actor.callerRole === "HR" && actor.callerBranchId) {
    const outOfBranch = matched.filter((emp) => emp.branch_id !== actor.callerBranchId);
    if (outOfBranch.length > 0) {
      return {
        error: `Bạn chỉ được thay đổi ca cho nhân viên thuộc chi nhánh của mình. Không hợp lệ: ${outOfBranch.map((emp) => emp.name).join(", ")}`,
      };
    }
  }

  if (action === "delete_shifts") {
    const deleted: string[] = [];
    const noShift: string[] = [];

    for (const emp of matched) {
      const { data: existing } = await supabaseAdmin
        .from("shifts")
        .select("id, start_time, end_time")
        .eq("user_id", emp.user_id)
        .eq("shift_date", date);
      if (existing && existing.length > 0) {
        await supabaseAdmin.from("shifts").delete().eq("user_id", emp.user_id).eq("shift_date", date);
        deleted.push(emp.name);
        for (const shift of existing) {
          await sendShiftCancelledEmail(
            supabaseAdmin,
            emp,
            date,
            String(shift.start_time),
            String(shift.end_time),
            actor,
            "Ca làm đã được cập nhật từ Trợ lý AI HR",
          );
        }
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
          actual_branch_id: actor.callerRole === "HR" ? actor.callerBranchId : (emp.branch_id || null),
        });
        added.push(emp.name);
        await sendShiftAssignedEmail(supabaseAdmin, emp, date, startTime, endTime, actor);
      }
    }

    return { action: "add_shifts", added, already_exists: alreadyExists, not_found: notFound, date, start_time: startTime, end_time: endTime };
  }

  if (action === "update_shifts") {
    const updated: string[] = [];
    const noShift: string[] = [];
    const startTime = shiftDetails?.start_time || "08:00";
    const endTime = shiftDetails?.end_time || "17:00";
    const shiftType = shiftDetails?.shift_type || "FULL_TIME_8H";

    for (const emp of matched) {
      const { data: existing } = await supabaseAdmin
        .from("shifts")
        .select("id, start_time, end_time, actual_branch_id")
        .eq("user_id", emp.user_id)
        .eq("shift_date", date);
      if (existing && existing.length > 0) {
        for (const shift of existing) {
          await sendShiftCancelledEmail(
            supabaseAdmin,
            emp,
            date,
            String(shift.start_time),
            String(shift.end_time),
            actor,
            "Ca làm cũ đã được thay đổi từ Trợ lý AI HR",
          );
        }
        await supabaseAdmin
          .from("shifts")
          .update({
            start_time: startTime,
            end_time: endTime,
            shift_type: shiftType,
            actual_branch_id: actor.callerRole === "HR"
              ? actor.callerBranchId
              : (existing[0]?.actual_branch_id || emp.branch_id || null),
          })
          .eq("user_id", emp.user_id)
          .eq("shift_date", date);
        updated.push(emp.name);
        await sendShiftAssignedEmail(supabaseAdmin, emp, date, startTime, endTime, actor);
      } else {
        noShift.push(emp.name);
      }
    }

    return { action: "update_shifts", updated, not_found: notFound, no_shift: noShift, date, start_time: startTime, end_time: endTime };
  }

  return { error: "Hành động không hợp lệ." };
}

async function getAvailableEmployeesForEvaluation(
  supabaseAdmin: ReturnType<typeof createClient>,
  callerRole: string,
  callerBranchId: string | null,
  date: string,
) {
  const { data: shifts } = await supabaseAdmin
    .from("shifts")
    .select("user_id, actual_branch_id")
    .eq("shift_date", date);

  if (!shifts || shifts.length === 0) return [];

  const userIds = [...new Set(shifts.map((item: any) => item.user_id))];
  const { data: profiles } = await supabaseAdmin
    .from("profiles")
    .select("user_id, name, branch_id")
    .in("user_id", userIds);

  const profileMap = Object.fromEntries((profiles || []).map((item: any) => [item.user_id, item]));

  return shifts
    .map((shift: any) => {
      const profile = profileMap[shift.user_id] || {};
      const resolvedBranchId = shift.actual_branch_id || profile.branch_id || null;
      return {
        user_id: shift.user_id,
        name: profile.name || "Không rõ",
        branch_id: resolvedBranchId,
      };
    })
    .filter((item: any) => !(callerRole === "HR" && callerBranchId && item.branch_id !== callerBranchId));
}

function buildEvaluationSelectionReply(date: string, employees: { name: string }[]) {
  if (employees.length === 0) {
    return `Hôm nay (${date}) không có nhân viên nào có ca để chấm điểm trong phạm vi bạn quản lý.`;
  }

  return [
    `Hôm nay (${date}) có ${employees.length} nhân viên có ca để chấm điểm:`,
    ...employees.map((employee, index) => `${index + 1}. ${employee.name}`),
    "",
    "Anh muốn chấm điểm cho ai?",
  ].join("\n");
}

function buildEvaluationCriterionPrompt(employeeName: string, date: string, stepIndex: number) {
  const criteria = getFlatEvaluationCriteria();
  const criterion = criteria[stepIndex];
  return `Đang chấm điểm cho **${employeeName}** ngày **${date}**.\nMục ${stepIndex + 1}/${criteria.length}: **${criterion.criterionLabel}** (${criterion.categoryLabel}, 0-${criterion.max}). Anh muốn cho mấy điểm?`;
}

async function createEvaluation(
  supabaseAdmin: ReturnType<typeof createClient>,
  payload: EvaluationPayload,
  actor: { id: string; role: string; branchId: string | null },
) {
  const { data: existing } = await supabaseAdmin
    .from("evaluations")
    .select("id")
    .eq("employee_id", payload.employee_id)
    .eq("evaluation_date", payload.evaluation_date)
    .maybeSingle();

  if (actor.role === "HR" && actor.branchId && payload.branch_id !== actor.branchId) {
    return { error: "Bạn chỉ được chấm điểm cho nhân viên thuộc chi nhánh mình quản lý." };
  }

  if (existing?.id) {
    const { error, data } = await supabaseAdmin
      .from("evaluations")
      .update({
        hr_id: actor.id,
        total_score: payload.total_score,
        categories_scores: payload.categories_scores,
        feedback_events: payload.feedback_events,
        bonus_score: payload.bonus_score,
        manager_comment: payload.manager_comment,
        branch_id: payload.branch_id,
      })
      .eq("id", existing.id)
      .select()
      .single();

    if (error) return { error: error.message };
    return { data, updated: true };
  }

  const { data, error } = await supabaseAdmin
    .from("evaluations")
    .insert({
      employee_id: payload.employee_id,
      hr_id: actor.id,
      evaluation_date: payload.evaluation_date,
      total_score: payload.total_score,
      categories_scores: payload.categories_scores,
      feedback_events: payload.feedback_events,
      bonus_score: payload.bonus_score,
      manager_comment: payload.manager_comment,
      branch_id: payload.branch_id,
    })
    .select()
    .single();

  if (error) return { error: error.message };
  return { data, updated: false };
}

async function handleEvaluationConversation(
  message: string,
  messages: ChatMessage[],
  supabaseAdmin: ReturnType<typeof createClient>,
  actor: { id: string; role: string; branchId: string | null },
  today: string,
) {
  const normalized = normalizeText(message);
  const assistantHistory = messages.filter((item) => item.role === "assistant" && item.content).map((item) => item.content!.trim());
  const lastAssistant = assistantHistory[assistantHistory.length - 1] || "";
  const employeesToday = await getAvailableEmployeesForEvaluation(supabaseAdmin, actor.role, actor.branchId, today);

  if (
    normalized.includes("cham diem") ||
    normalized.includes("chấm điểm") ||
    normalized.includes("danh gia nhan vien") ||
    normalized.includes("đánh giá nhân viên")
  ) {
    return { reply: buildEvaluationSelectionReply(today, employeesToday), mutations: false };
  }

  if (lastAssistant.includes("Anh muốn chấm điểm cho ai?")) {
    const chosenName = inferEmployeeNameFromMessage(message) || inferEmployeeNameFromAssistantContext(messages);
    const employee = employeesToday.find((item) => normalizeText(item.name).includes(normalizeText(chosenName || "")));
    if (!employee) {
      return { reply: "Tôi chưa xác định đúng nhân viên có ca hôm nay trong phạm vi bạn quản lý. Hãy nói lại đúng tên nhân viên.", mutations: false };
    }
    return { reply: buildEvaluationCriterionPrompt(employee.name, today, 0), mutations: false };
  }

  const criteria = getFlatEvaluationCriteria();
  const criterionPromptMatch = lastAssistant.match(/Đang chấm điểm cho \*\*(.+?)\*\* ngày \*\*(\d{4}-\d{2}-\d{2})\*\*\.\nMục (\d+)\/(\d+):/);
  if (criterionPromptMatch) {
    const employeeName = criterionPromptMatch[1].trim();
    const evaluationDate = criterionPromptMatch[2];
    const score = extractNumericScore(message);
    const currentStep = Number(criterionPromptMatch[3]) - 1;
    const criterion = criteria[currentStep];

    if (score === null || score < 0 || score > criterion.max) {
      return { reply: `Điểm cho mục **${criterion.criterionLabel}** phải nằm trong khoảng 0-${criterion.max}. Anh nhập lại giúp tôi.`, mutations: false };
    }

    const scores = buildInitialEvaluationScores();
    let lastEmployeeName = employeeName;
    let scorePointer = 0;
    for (let index = 0; index < messages.length; index += 1) {
      const assistantMessage = messages[index];
      if (assistantMessage.role !== "assistant" || !assistantMessage.content) continue;
      const match = assistantMessage.content.match(/Đang chấm điểm cho \*\*(.+?)\*\* ngày \*\*(\d{4}-\d{2}-\d{2})\*\*\.\nMục (\d+)\/(\d+):/);
      if (!match) continue;
      lastEmployeeName = match[1].trim();
      const promptStep = Number(match[3]) - 1;
      const userAnswer = messages[index + 1];
      if (!userAnswer || userAnswer.role !== "user" || !userAnswer.content) continue;
      const parsedScore = extractNumericScore(userAnswer.content);
      const config = criteria[promptStep];
      if (parsedScore !== null && parsedScore >= 0 && parsedScore <= config.max) {
        scores[config.categoryKey][config.criterionKey] = parsedScore;
        scorePointer = Math.max(scorePointer, promptStep + 1);
      }
    }

    scores[criterion.categoryKey][criterion.criterionKey] = score;
    scorePointer = Math.max(scorePointer, currentStep + 1);

    if (scorePointer < criteria.length) {
      return {
        reply: buildEvaluationCriterionPrompt(lastEmployeeName, evaluationDate, scorePointer),
        mutations: false,
      };
    }

    return {
      reply: `Phần điểm cơ bản đã xong cho **${lastEmployeeName}**.\nAnh có muốn bật sự kiện phản hồi nào không? Chọn trong: **khách khen**, **nhắc nhở**, **phàn nàn trực tiếp**, **phàn nàn lên quản lý**. Nếu không có, trả lời **không**.`,
      mutations: false,
    };
  }

  const feedbackPromptActive = lastAssistant.includes("Phần điểm cơ bản đã xong cho");
  if (feedbackPromptActive) {
    const employeeMatch = lastAssistant.match(/cho \*\*(.+?)\*\*/);
    const employeeName = employeeMatch?.[1]?.trim() || "";
    const activeEvents = FEEDBACK_EVENTS.filter((event) => normalized.includes(normalizeText(event.label))).map((event) => event.key);
    if (!isNoMessage(message) && activeEvents.length === 0) {
      return { reply: "Tôi chưa hiểu sự kiện phản hồi. Anh hãy chọn: khách khen, nhắc nhở, phàn nàn trực tiếp, phàn nàn lên quản lý; hoặc trả lời `không`.", mutations: false };
    }

    return {
      reply: `Đã ghi nhận phản hồi cho **${employeeName}**. Ca này có doanh thu trên 100 triệu không? Trả lời **có** hoặc **không**.`,
      mutations: false,
    };
  }

  const bonusPromptActive = lastAssistant.includes("Ca này có doanh thu trên 100 triệu không?");
  if (bonusPromptActive) {
    if (!isYesMessage(message) && !isNoMessage(message)) {
      return { reply: "Anh hãy trả lời rõ **có** hoặc **không** để tôi chốt phần bonus.", mutations: false };
    }
    const employeeName = inferEmployeeNameFromAssistantContext(messages) || "nhân viên này";
    return {
      reply: `Hãy nhập nhận xét quản lý cho **${employeeName}** để tôi hoàn tất chấm điểm.`,
      mutations: false,
    };
  }

  const commentPromptActive = lastAssistant.includes("Hãy nhập nhận xét quản lý cho");
  if (commentPromptActive) {
    const employeeName = inferEmployeeNameFromAssistantContext(messages);
    const employee = employeesToday.find((item) => normalizeText(item.name).includes(normalizeText(employeeName || "")));
    if (!employee) {
      return { reply: "Tôi không còn xác định chắc nhân viên đang được chấm điểm. Anh bắt đầu lại giúp tôi bằng câu `Tôi muốn chấm điểm cho nhân viên ca hôm nay`.", mutations: false };
    }

    const scores = buildInitialEvaluationScores();
    for (let index = 0; index < messages.length; index += 1) {
      const assistantMessage = messages[index];
      if (assistantMessage.role !== "assistant" || !assistantMessage.content) continue;
      const match = assistantMessage.content.match(/Đang chấm điểm cho \*\*(.+?)\*\* ngày \*\*(\d{4}-\d{2}-\d{2})\*\*\.\nMục (\d+)\/(\d+):/);
      if (!match || normalizeText(match[1]) !== normalizeText(employee.name)) continue;
      const promptStep = Number(match[3]) - 1;
      const userAnswer = messages[index + 1];
      if (!userAnswer || userAnswer.role !== "user" || !userAnswer.content) continue;
      const parsedScore = extractNumericScore(userAnswer.content);
      const config = criteria[promptStep];
      if (parsedScore !== null && parsedScore >= 0 && parsedScore <= config.max) {
        scores[config.categoryKey][config.criterionKey] = parsedScore;
      }
    }

    let feedbackEvents: string[] = [];
    let bonusScore = 0;
    for (let index = 0; index < messages.length; index += 1) {
      const assistantMessage = messages[index];
      if (assistantMessage.role !== "assistant" || !assistantMessage.content) continue;
      if (assistantMessage.content.includes("Phần điểm cơ bản đã xong cho")) {
        const userAnswer = messages[index + 1];
        if (userAnswer?.role === "user" && userAnswer.content && !isNoMessage(userAnswer.content)) {
          feedbackEvents = FEEDBACK_EVENTS
            .filter((event) => normalizeText(userAnswer.content || "").includes(normalizeText(event.label)))
            .map((event) => event.key);
        }
      }
      if (assistantMessage.content.includes("Ca này có doanh thu trên 100 triệu không?")) {
        const userAnswer = messages[index + 1];
        if (userAnswer?.role === "user" && userAnswer.content && isYesMessage(userAnswer.content)) {
          bonusScore = 5;
        }
      }
    }

    const baseScore = Object.values(scores).reduce(
      (sum, categoryScores) => sum + Object.values(categoryScores).reduce((inner, value) => inner + Number(value || 0), 0),
      0,
    );
    const feedbackScore = FEEDBACK_EVENTS
      .filter((event) => feedbackEvents.includes(event.key))
      .reduce((sum, event) => sum + event.points, 0);
    const totalScore = baseScore + feedbackScore + bonusScore;

    const saveResult = await createEvaluation(
      supabaseAdmin,
      {
        employee_name: employee.name,
        employee_id: employee.user_id,
        evaluation_date: today,
        categories_scores: scores,
        feedback_events: feedbackEvents,
        bonus_score: bonusScore,
        manager_comment: message.trim(),
        total_score: totalScore,
        branch_id: employee.branch_id,
      },
      actor,
    );

    if (saveResult.error) {
      return { reply: `Tôi chưa thể lưu chấm điểm cho **${employee.name}**. Chi tiết: ${saveResult.error}`, mutations: false };
    }

    return {
      reply: `${saveResult.updated ? "Đã cập nhật" : "Đã lưu"} chấm điểm cho **${employee.name}** ngày **${today}** với tổng điểm **${totalScore}/100**. Phần hiệu suất sẽ tự cập nhật realtime theo luồng hiện tại của hệ thống.`,
      mutations: true,
    };
  }

  return null;
}

function buildSummaryReplyFromQuery(message: string, result: QueryResult, today: string) {
  const normalized = normalizeText(message);
  const rows = result.data || [];

  if (isMissingCheckinIntent(message)) {
    return formatMissingCheckinReply(result, today, false);
  }

  if (
    normalized.includes("thang nay") ||
    normalized.includes("tháng này") ||
    normalized.includes("tong so ca") ||
    normalized.includes("tổng số ca") ||
    normalized.includes("tong gio lam") ||
    normalized.includes("tổng giờ làm") ||
    normalized.includes("diem thap nhat") ||
    normalized.includes("điểm thấp nhất") ||
    normalized.includes("bi phat nhieu nhat") ||
    normalized.includes("bị phạt nhiều nhất")
  ) {
    const summary = rows[0] || {};
    if (!summary || Object.keys(summary).length === 0) {
      return "Tháng này chưa có đủ dữ liệu để tổng hợp.";
    }

    const lines = [
      `Tổng hợp tháng này (${summary.month_start} đến ${summary.month_end}):`,
      `- Tổng số ca: **${summary.total_shifts || 0}**`,
      `- Tổng giờ làm: **${summary.total_hours || 0}** giờ`,
      `- Số nhân viên có ca: **${summary.total_employees || 0}**`,
      `- Lượt đi muộn: **${summary.total_late_cases || 0}** (${summary.total_late_minutes || 0} phút)`,
    ];

    if (summary.lowest_score_employee) {
      lines.push(`- Nhân viên điểm thấp nhất: **${summary.lowest_score_employee.name}** (${summary.lowest_score_employee.score} điểm)`);
    }

    if (summary.highest_penalty_employee) {
      lines.push(`- Nhân viên bị phạt nhiều nhất: **${summary.highest_penalty_employee.name}** (${summary.highest_penalty_employee.penalty_amount} - ${summary.highest_penalty_employee.edit_count} lần chỉnh ca)`);
    }

    if (summary.most_shifts_employee) {
      lines.push(`- Nhân viên có nhiều ca nhất: **${summary.most_shifts_employee.name}** (${summary.most_shifts_employee.shift_count} ca)`);
    }

    if (summary.most_hours_employee) {
      lines.push(`- Nhân viên có nhiều giờ làm nhất: **${summary.most_hours_employee.name}** (${summary.most_hours_employee.total_hours} giờ)`);
    }

    return lines.join("\n");
  }

  if (normalized.includes("bao nhieu") && (normalized.includes("nguoi lam") || normalized.includes("người làm"))) {
    return `Hôm nay (${today}) có **${result.count || 0}** người có ca làm.`;
  }

  if ((normalized.includes("ca") || normalized.includes("lich") || normalized.includes("lịch")) && rows.length > 0) {
    return [
      `Tôi tìm thấy **${rows.length}** ca phù hợp:`,
      ...rows.slice(0, 20).map((row: any, index: number) => `${index + 1}. ${row.name} - ${row.date} (${row.start}-${row.end})`),
    ].join("\n");
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

  if (normalized.includes("cham diem") || normalized.includes("chấm điểm") || normalized.includes("danh gia") || normalized.includes("đánh giá")) {
    if (rows.length === 0) return "Hôm nay chưa có dữ liệu đánh giá.";
    return [
      `Có **${rows.length}** bản đánh giá phù hợp:` ,
      ...rows.slice(0, 20).map((row: any, index: number) => `${index + 1}. ${row.name} - ${row.total_score} điểm (${row.date})`),
    ].join("\n");
  }

  if (normalized.includes("chi nhanh") || normalized.includes("chi nhánh")) {
    if (rows.length === 0) return "Không tìm thấy dữ liệu chi nhánh.";
    return [
      `Có **${rows.length}** chi nhánh trong phạm vi bạn được xem:`,
      ...rows.slice(0, 20).map((row: any, index: number) => `${index + 1}. ${row.branch_name} - ${row.employee_count} nhân viên`),
    ].join("\n");
  }

  if (isAttendanceNameFollowUp(message) && (result.missing_checkin || []).length > 0) {
    return formatMissingCheckinReply(result, today, true);
  }

  if (result.message) return result.message;
  if (typeof result.count === "number") return `Đã tìm thấy **${result.count}** kết quả.`;

  return "Tôi đã xử lý xong yêu cầu.";
}

function inferFallbackIntent(message: string, role: string, today: string): { queryArgs?: Record<string, unknown>; reply?: string } {
  const normalized = normalizeText(message);

  if (!canMutate(role) && (
    normalized.includes("cho nghi") ||
    normalized.includes("them ca") ||
    normalized.includes("xoa ca") ||
    normalized.includes("huy ca") ||
    normalized.includes("sua ca")
  )) {
    return { reply: "Bạn không có quyền thực hiện thay đổi dữ liệu." };
  }

  if (normalized.includes("bao nhieu") && (normalized.includes("nguoi lam") || normalized.includes("người làm"))) {
    return { queryArgs: { query_type: "shifts", date: today } };
  }

  if (
    normalized.includes("thang nay") ||
    normalized.includes("tháng này") ||
    normalized.includes("tong so ca") ||
    normalized.includes("tổng số ca") ||
    normalized.includes("tong gio lam") ||
    normalized.includes("tổng giờ làm") ||
    normalized.includes("diem thap nhat") ||
    normalized.includes("điểm thấp nhất") ||
    normalized.includes("bi phat nhieu nhat") ||
    normalized.includes("bị phạt nhiều nhất") ||
    normalized.includes("van de gi") ||
    normalized.includes("vấn đề gì")
  ) {
    return { queryArgs: { query_type: "monthly_summary", date: today } };
  }

  if (normalized.includes("ca toi")) {
    return { queryArgs: { query_type: "shifts", date: today } };
  }

  if (isMissingCheckinIntent(message)) {
    return {
      queryArgs: {
        query_type: "attendance",
        date: today,
        employee_name: inferEmployeeNameFromMessage(message),
      },
    };
  }

  if (normalized.includes("cham cong") || normalized.includes("chấm công") || normalized.includes("di muon") || normalized.includes("đi muộn")) {
    return {
      queryArgs: {
        query_type: "attendance",
        date: today,
        employee_name: inferEmployeeNameFromMessage(message),
      },
    };
  }

  if (normalized.includes("danh gia") || normalized.includes("đánh giá")) {
    return {
      queryArgs: {
        query_type: "evaluations",
        date_from: today,
        date_to: today,
        employee_name: inferEmployeeNameFromMessage(message),
      },
    };
  }

  if (normalized.includes("cham diem") || normalized.includes("chấm điểm")) {
    return {
      queryArgs: {
        query_type: "evaluations",
        date_from: today,
        date_to: today,
        employee_name: inferEmployeeNameFromMessage(message),
      },
    };
  }

  if (normalized.includes("ca") || normalized.includes("lich") || normalized.includes("lịch")) {
    return {
      queryArgs: {
        query_type: "shifts",
        date: today,
        employee_name: inferEmployeeNameFromMessage(message),
      },
    };
  }

  if (normalized.includes("nhan vien") || normalized.includes("nhân viên")) {
    return { queryArgs: { query_type: "employees" } };
  }

  if (normalized.includes("chi nhanh") || normalized.includes("chi nhánh")) {
    return { queryArgs: { query_type: "branches" } };
  }

  return {
    reply: "Tôi chưa hiểu rõ yêu cầu này trong chế độ dự phòng. Bạn hãy hỏi theo các mẫu như: hôm nay có bao nhiêu người làm, ai làm ca tối nay, thống kê chấm công hôm nay.",
  };
}

function extractMutationFromMessage(message: string, today: string): MutationPayload | null {
  const normalized = normalizeText(message);
  const inferredName = inferEmployeeNameFromMessage(message);
  const inferredTimes = inferShiftTimesFromMessage(message);
  const inferredStart = inferSingleTimeFromMessage(message);

  if (
    (normalized.includes("cho") && normalized.includes("nghi")) ||
    normalized.includes("xoa ca") ||
    normalized.includes("xóa ca") ||
    normalized.includes("huy ca") ||
    normalized.includes("hủy ca")
  ) {
    return {
      action: "delete_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: inferredName ? [inferredName] : [],
    };
  }

  if (normalized.includes("them ca") || normalized.includes("xep ca") || normalized.includes("xếp ca")) {
    return {
      action: "add_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: inferredName ? [inferredName] : [],
      shift_details: inferredTimes || {
        start_time: "08:00",
        end_time: "17:00",
        shift_type: "FULL_TIME_8H",
      },
    };
  }

  if (normalized.includes("doi ca") || normalized.includes("đổi ca") || normalized.includes("sua ca") || normalized.includes("sửa ca")) {
    return {
      action: "update_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: inferredName ? [inferredName] : [],
      shift_details: inferredTimes || {
        start_time: inferredStart || "08:00",
        end_time: "17:00",
        shift_type: "FULL_TIME_8H",
      },
    };
  }

  if (normalized.includes("sua lai") || normalized.includes("sửa lại") || normalized.includes("doi lai") || normalized.includes("đổi lại")) {
    return {
      action: "update_shifts",
      date: inferDateFromMessage(message, today),
      employee_names: inferredName ? [inferredName] : [],
      shift_details: inferredTimes || {
        start_time: inferredStart || "08:00",
        end_time: "03:00",
        shift_type: "FULL_TIME_8H",
      },
    };
  }

  return null;
}

function summarizeMutationRequest(payload: MutationPayload) {
  if (!payload.employee_names.length) {
    return "Tôi chưa xác định rõ nhân viên cần thay đổi. Hãy ghi rõ tên nhân viên, ví dụ: `Xếp ca cho nhân viên Nguyễn Văn A hôm nay từ 19h đến 3h`.";
  }

  if (payload.action === "delete_shifts") {
    return `Tôi sẽ xóa ca làm ngày **${payload.date}** cho: **${payload.employee_names.join(", ")}**.\n\nBạn có muốn xác nhận thay đổi này không?`;
  }

  if (payload.action === "add_shifts") {
    const start = payload.shift_details?.start_time || "08:00";
    const end = payload.shift_details?.end_time || "17:00";
    return `Tôi sẽ thêm ca làm ngày **${payload.date}** từ **${start}** đến **${end}** cho: **${payload.employee_names.join(", ")}**.\n\nBạn có muốn xác nhận thay đổi này không?`;
  }

  if (payload.action === "update_shifts") {
    const start = payload.shift_details?.start_time || "08:00";
    const end = payload.shift_details?.end_time || "17:00";
    return `Tôi sẽ cập nhật ca làm ngày **${payload.date}** thành **${start}-${end}** cho: **${payload.employee_names.join(", ")}**.\n\nBạn có muốn xác nhận thay đổi này không?`;
  }

  return "Tôi đã hiểu yêu cầu thay đổi. Bạn có muốn xác nhận thay đổi này không?";
}

function summarizeMutationResult(result: Record<string, unknown>) {
  const action = result.action as string | undefined;
  const date = result.date as string | undefined;
  const startTime = result.start_time as string | undefined;
  const endTime = result.end_time as string | undefined;

  if (action === "add_shifts") {
    const added = ((result.added as string[] | undefined) || []).filter(Boolean);
    const alreadyExists = ((result.already_exists as string[] | undefined) || []).filter(Boolean);
    const notFound = ((result.not_found as string[] | undefined) || []).filter(Boolean);

    const lines = [];
    if (added.length > 0) {
      const timeRange = startTime && endTime ? ` (${startTime}-${endTime})` : "";
      lines.push(`Đã thêm ca ngày **${date}**${timeRange} cho: **${added.join(", ")}**.`);
    }
    if (alreadyExists.length > 0) lines.push(`Tôi không thêm mới vì các nhân viên này đã có ca trong ngày: **${alreadyExists.join(", ")}**. Nếu muốn, bạn có thể yêu cầu tôi **sửa ca** cho họ.`);
    if (notFound.length > 0) lines.push(`Không tìm thấy nhân viên: **${notFound.join(", ")}**.`);
    return lines.join("\n\n") || "Đã xử lý yêu cầu thêm ca.";
  }

  if (action === "delete_shifts") {
    const deleted = ((result.deleted as string[] | undefined) || []).filter(Boolean);
    const noShift = ((result.no_shift as string[] | undefined) || []).filter(Boolean);
    const notFound = ((result.not_found as string[] | undefined) || []).filter(Boolean);

    const lines = [];
    if (deleted.length > 0) lines.push(`Đã hủy ca ngày **${date}** cho: **${deleted.join(", ")}**.`);
    if (noShift.length > 0) lines.push(`Các nhân viên này không có ca để hủy: **${noShift.join(", ")}**.`);
    if (notFound.length > 0) lines.push(`Không tìm thấy nhân viên: **${notFound.join(", ")}**.`);
    return lines.join("\n\n") || "Đã xử lý yêu cầu hủy ca.";
  }

  if (action === "update_shifts") {
    const updated = ((result.updated as string[] | undefined) || []).filter(Boolean);
    const noShift = ((result.no_shift as string[] | undefined) || []).filter(Boolean);
    const notFound = ((result.not_found as string[] | undefined) || []).filter(Boolean);

    const lines = [];
    if (updated.length > 0) {
      const timeRange = startTime && endTime ? ` thành **${startTime}-${endTime}**` : "";
      lines.push(`Đã cập nhật ca ngày **${date}**${timeRange} cho: **${updated.join(", ")}**.`);
    }
    if (noShift.length > 0) lines.push(`Các nhân viên này chưa có ca để đổi: **${noShift.join(", ")}**.`);
    if (notFound.length > 0) lines.push(`Không tìm thấy nhân viên: **${notFound.join(", ")}**.`);
    return lines.join("\n\n") || "Đã xử lý yêu cầu đổi ca.";
  }

  return "Đã thực hiện thay đổi thành công.";
}

function findLatestMutationPayload(messages: ChatMessage[], today: string) {
  const sourceMessage = messages
    .filter((item) => item.role === "user" && item.content)
    .map((item) => item.content!.trim())
    .reverse()
    .find((content) => {
      const normalized = normalizeText(content);
      if (includesAny(content, CONFIRM_PHRASES) || includesAny(content, CANCEL_PHRASES)) return false;
      return Boolean(extractMutationFromMessage(content, today)) && normalized !== "confirm" && normalized !== "cancel";
    });

  return sourceMessage ? extractMutationFromMessage(sourceMessage, today) : null;
}

async function handleFallback(
  message: string,
  messages: ChatMessage[],
  role: string,
  supabaseAdmin: ReturnType<typeof createClient>,
  callerBranchId: string | null,
  actorName: string | null,
  actorUserId: string,
  today: string,
) {
  const evaluationFlow = await handleEvaluationConversation(
    message,
    messages.slice(0, -1),
    supabaseAdmin,
    { id: actorUserId, role, branchId: callerBranchId },
    today,
  );
  if (evaluationFlow) return evaluationFlow;

  const pendingConfirmation = hasPendingConfirmation(messages.slice(0, -1));
  const latestMutationPayload = findLatestMutationPayload(messages.slice(0, -1), today);

  if ((pendingConfirmation || latestMutationPayload) && canMutate(role)) {
    if (includesAny(message, CANCEL_PHRASES)) {
      return { reply: "Đã hủy thay đổi theo yêu cầu của bạn.", mutations: false };
    }

    if (includesAny(message, CONFIRM_PHRASES)) {
      const payload = latestMutationPayload;
      if (!payload || payload.employee_names.length === 0) {
        return { reply: "Không xác định được thay đổi cần thực hiện. Hãy gửi lại yêu cầu cụ thể hơn.", mutations: false };
      }

      const result = await executeMutation(payload, supabaseAdmin, { callerRole: role, callerBranchId, actorName });
      return {
        reply: result.error
          ? result.error
          : summarizeMutationResult(result as Record<string, unknown>),
        mutations: !result.error,
      };
    }
  }

  if (canMutate(role)) {
    const rawMutationPayload = extractMutationFromMessage(message, today);
    const mutationPatch = buildMutationPatchFromMessage(message, messages.slice(0, -1));
    const mutationPayload = mergeWithPreviousMutation(rawMutationPayload, latestMutationPayload, mutationPatch);
    if (mutationPayload) {
      if (!mutationPayload.employee_names.length) {
        return {
          reply: "Tôi chưa xác định rõ nhân viên cần thao tác. Hãy nói rõ tên nhân viên, ví dụ: `Sửa ca cho nhân viên Phạm Trọng hôm nay từ 20h đến 3h`.",
          mutations: false,
        };
      }

      if (mutationPayload.action === "update_shifts" && !rawMutationPayload?.shift_details?.start_time && !rawMutationPayload?.shift_details?.end_time) {
        return {
          reply: "Tôi hiểu bạn muốn sửa ca, nhưng chưa đủ giờ làm mới. Hãy nói rõ, ví dụ: `Sửa ca Phạm Trọng hôm nay từ 20h đến 3h`.",
          mutations: false,
        };
      }

      return {
        reply: summarizeMutationRequest(mutationPayload),
        mutations: false,
      };
    }
  }

  const previousUser = previousUserMessage(messages.slice(0, -1));
  const previousAssistant = previousAssistantMessage(messages.slice(0, -1));
  const asksMissingCheckinNames =
    isAttendanceNameFollowUp(message) &&
    (isMissingCheckinIntent(previousUser) || isMissingCheckinIntent(previousAssistant));

  if (asksMissingCheckinNames) {
    const attendanceResult = await executeQuery(
      { query_type: "attendance", date: today },
      supabaseAdmin,
      callerBranchId,
      role,
    );

    if (attendanceResult.error) {
      return { reply: attendanceResult.error, mutations: false };
    }

    return {
      reply: formatMissingCheckinReply(attendanceResult, today, true),
      mutations: false,
    };
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

    const requestBody = await req.json();
    const { messages, conversation_id: rawConversationId } = requestBody || {};
    const conversationId = typeof rawConversationId === "string" && rawConversationId.trim().length > 0
      ? rawConversationId.trim()
      : crypto.randomUUID();

    if (userRole === "EMPLOYEE") {
      return buildLoggedResponse(
        { error: "Chỉ HR và Quản lý mới có quyền sử dụng Trợ lý AI." },
        403,
        null,
        supabaseAdmin,
      );
    }

    const { data: callerProfile } = await supabaseAdmin.from("profiles").select("branch_id, name").eq("user_id", user.id).single();
    const callerBranchId = callerProfile?.branch_id || null;
    const actorName = callerProfile?.name || null;
    const safeMessages = Array.isArray(messages) ? messages as ChatMessage[] : [];
    const currentMessage = latestUserMessage(safeMessages);
    const today = new Date().toISOString().split("T")[0];
    const auditBase: ChatAuditPayload = {
      conversationId,
      userId: user.id,
      userRole,
      branchId: callerBranchId,
      actorName,
      userMessage: currentMessage,
      assistantReply: "",
      mutationsApplied: false,
    };

    // Deterministic confirmation path:
    // if there is a pending mutation summary and user presses confirm/cancel,
    // execute the fallback confirmation flow immediately instead of asking the model again.
    if (hasPendingConfirmation(safeMessages.slice(0, -1)) && (includesAny(currentMessage, CONFIRM_PHRASES) || includesAny(currentMessage, CANCEL_PHRASES))) {
      const confirmed = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, actorName, user.id, today);
      return buildLoggedResponse({ ...confirmed, role: userRole, mode: "confirmation" }, 200, auditBase, supabaseAdmin);
    }

    const rateLimit = await enforceAiChatRateLimit(supabaseAdmin, user.id, currentMessage);
    if (!rateLimit.allowed) {
      return buildLoggedResponse({
        error: `Bạn gửi yêu cầu quá nhanh. Vui lòng đợi khoảng ${AI_CHAT_WINDOW_SECONDS} giây rồi thử lại.`,
      }, 429, auditBase, supabaseAdmin);
    }

    if (shouldUseDeterministicFallback(currentMessage, safeMessages.slice(0, -1))) {
      const deterministic = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, actorName, user.id, today);
      return buildLoggedResponse({ ...deterministic, role: userRole, mode: "deterministic" }, 200, auditBase, supabaseAdmin);
    }

    const openAiApiKey = (await getSystemApiKey(supabaseAdmin, "openai")) || Deno.env.get("OPENAI_API_KEY");
    if (!openAiApiKey) {
      const fallback = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, actorName, user.id, today);
      return buildLoggedResponse({ ...fallback, role: userRole, mode: "fallback" }, 200, auditBase, supabaseAdmin);
    }

    try {
      const systemPrompt = getSystemPrompt(userRole, today);
      const messagesForOpenAI = buildOpenAIMessages(safeMessages, systemPrompt);
      const tools = buildOpenAITools(userRole);

      const data = await callOpenAI({
        model: OPENAI_MODEL,
        messages: messagesForOpenAI,
        tools,
        tool_choice: "auto",
      }, openAiApiKey);

      const functionCalls = extractFunctionCallsFromOpenAI(data);
      if (functionCalls.length === 0) {
        return buildLoggedResponse({
          reply: extractTextFromOpenAI(data) || "Xin lỗi, tôi chưa hiểu rõ yêu cầu.",
          mutations: false,
          role: userRole,
          mode: "openai",
        }, 200, auditBase, supabaseAdmin);
      }

      const toolResults: any[] = [];
      let hasMutation = false;

      for (const functionCall of functionCalls) {
        const functionName = functionCall.function?.name || "";
        const args = parseFunctionArgs(functionCall.function?.arguments);

        if (functionName === "query_hr_data") {
          const result = await executeQuery(args, supabaseAdmin, callerBranchId, userRole);
          toolResults.push({ result });
        } else if (functionName === "execute_shift_mutation") {
          if (!canMutate(userRole)) {
            toolResults.push({ error: "Bạn không có quyền thay đổi dữ liệu." });
          } else {
            const result = await executeMutation(args, supabaseAdmin, { callerRole: userRole, callerBranchId, actorName });
            toolResults.push({ result });
            hasMutation = !result.error;
          }
        }
      }

      const followData = await callOpenAI({
        model: OPENAI_MODEL,
        messages: [
          ...messagesForOpenAI,
          ...buildToolMessages(functionCalls, toolResults),
        ],
        tools,
      }, openAiApiKey);

      return buildLoggedResponse({
        reply: extractTextFromOpenAI(followData) || "Đã xử lý xong.",
        mutations: hasMutation,
        role: userRole,
        mode: "openai",
      }, 200, auditBase, supabaseAdmin);
    } catch (error) {
      if (isOpenAIQuotaError(error)) {
        await notifyItUsersOpenAICreditExhausted(supabaseAdmin, actorName, userRole);
        return buildLoggedResponse({
          error: "OpenAI đã hết credit. Vui lòng gửi yêu cầu cấp token. Hệ thống đã thông báo tới IT.",
          role: userRole,
          mode: "openai_quota_exhausted",
        }, 402, auditBase, supabaseAdmin);
      }

      console.error("OpenAI flow failed, switching to fallback:", error);
      const fallback = await handleFallback(currentMessage, safeMessages, userRole, supabaseAdmin, callerBranchId, actorName, user.id, today);
      return buildLoggedResponse({
        ...fallback,
        role: userRole,
        mode: "fallback",
        warning: error instanceof Error ? error.message : "OpenAI flow failed",
      }, 200, auditBase, supabaseAdmin);
    }
  } catch (error) {
    console.error("ai-shift-assistant error:", error);
    return jsonResponse({ error: error instanceof Error ? error.message : "Unknown error" }, 500);
  }
});
