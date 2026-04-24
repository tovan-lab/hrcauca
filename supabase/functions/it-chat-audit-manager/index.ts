import { createClient } from 'npm:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function jsonResponse(body: Record<string, unknown>, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('authorization') || '';
    const token = authHeader.replace('Bearer ', '');
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const anonKey = Deno.env.get('SUPABASE_PUBLISHABLE_KEY') || Deno.env.get('SUPABASE_ANON_KEY')!;

    const supabaseUser = createClient(supabaseUrl, anonKey, {
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const {
      data: { user },
      error: authError,
    } = await supabaseUser.auth.getUser();

    if (authError || !user) {
      return jsonResponse({ error: 'Unauthorized' }, 401);
    }

    const supabaseAdmin = createClient(supabaseUrl, serviceRoleKey);
    const { data: roleRows, error: roleError } = await supabaseAdmin
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id);

    if (roleError || roleRows?.[0]?.role !== 'IT') {
      return jsonResponse({ error: 'Chỉ IT mới được truy cập lịch sử chat AI.' }, 403);
    }

    const body = await req.json();
    const action = body?.action;

    if (action === 'list') {
      const dateFrom = body?.dateFrom;
      const dateTo = body?.dateTo;

      if (!dateFrom || !dateTo) {
        return jsonResponse({ error: 'Thiếu khoảng ngày lọc.' }, 400);
      }

      const { data: logs, error } = await supabaseAdmin
        .from('ai_chat_audit_logs')
        .select('id, conversation_id, actor_name, user_role, branch_id, user_message, assistant_reply, mutations_applied, metadata, created_at')
        .in('user_role', ['ADMIN', 'HR'])
        .gte('created_at', `${dateFrom}T00:00:00.000Z`)
        .lte('created_at', `${dateTo}T23:59:59.999Z`)
        .order('created_at', { ascending: false })
        .limit(1000);

      if (error) {
        return jsonResponse({ error: error.message }, 500);
      }

      const branchIds = Array.from(new Set((logs ?? []).map((log) => log.branch_id).filter(Boolean)));
      const userIds = Array.from(new Set((logs ?? []).map((log) => log.actor_name).filter(Boolean)));

      let branchMap = new Map<string, string>();
      if (branchIds.length > 0) {
        const { data: branches } = await supabaseAdmin
          .from('branches')
          .select('id, branch_name')
          .in('id', branchIds);
        branchMap = new Map((branches ?? []).map((branch) => [branch.id, branch.branch_name]));
      }

      const records = (logs ?? []).map((log) => ({
        ...log,
        branch_name: log.branch_id ? branchMap.get(log.branch_id) ?? null : null,
      }));

      const conversationCount = new Set(records.map((record) => record.conversation_id)).size;
      const actorCount = new Set(records.map((record) => `${record.user_role}:${record.actor_name ?? 'unknown'}`)).size;
      const mutationCount = records.filter((record) => record.mutations_applied).length;

      return jsonResponse({
        records,
        summary: {
          totalMessages: records.length,
          totalConversations: conversationCount,
          totalMutations: mutationCount,
          totalActors: actorCount,
        },
      });
    }

    if (action === 'delete') {
      const ids = Array.isArray(body?.ids) ? body.ids.filter((id: unknown) => typeof id === 'string') : [];
      if (ids.length === 0) {
        return jsonResponse({ error: 'Không có bản ghi nào được chọn để xóa.' }, 400);
      }

      const { data: toDelete, error: selectError } = await supabaseAdmin
        .from('ai_chat_audit_logs')
        .select('id')
        .in('id', ids)
        .in('user_role', ['ADMIN', 'HR']);

      if (selectError) {
        return jsonResponse({ error: selectError.message }, 500);
      }

      const matchedIds = (toDelete ?? []).map((row) => row.id);
      if (matchedIds.length === 0) {
        return jsonResponse({ deletedCount: 0 });
      }

      const { error: deleteError } = await supabaseAdmin
        .from('ai_chat_audit_logs')
        .delete()
        .in('id', matchedIds);

      if (deleteError) {
        return jsonResponse({ error: deleteError.message }, 500);
      }

      return jsonResponse({ deletedCount: matchedIds.length });
    }

    return jsonResponse({ error: 'Action không hợp lệ.' }, 400);
  } catch (error) {
    return jsonResponse(
      { error: error instanceof Error ? error.message : 'Unknown error' },
      500,
    );
  }
});
