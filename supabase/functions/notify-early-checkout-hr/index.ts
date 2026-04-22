// Notify HR (or fallback ADMIN) about a new early-checkout request.
// Runs with service role so it can bypass RLS on profiles/user_roles.
// Called best-effort from the client right after the request is inserted.

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

interface Body {
  requestId: string
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, serviceKey)

    const body = (await req.json()) as Body
    if (!body?.requestId) {
      return new Response(JSON.stringify({ error: 'requestId required' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Validate caller via JWT — only authenticated users can trigger
    const authHeader = req.headers.get('Authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    const userClient = createClient(supabaseUrl, Deno.env.get('SUPABASE_ANON_KEY')!, {
      global: { headers: { Authorization: authHeader } },
    })
    const { data: { user } } = await userClient.auth.getUser()
    if (!user) {
      return new Response(JSON.stringify({ error: 'unauthorized' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Load the request (service role bypasses RLS)
    const { data: ecr, error: ecrErr } = await supabase
      .from('early_checkout_requests')
      .select('id, employee_id, branch_id, shift_id, check_in_id, reason, approval_token, requested_at')
      .eq('id', body.requestId)
      .maybeSingle()
    if (ecrErr || !ecr) {
      return new Response(JSON.stringify({ error: 'request not found' }), {
        status: 404,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Caller must be the employee who owns the request
    if (ecr.employee_id !== user.id) {
      return new Response(JSON.stringify({ error: 'forbidden' }), {
        status: 403,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }
    if (!ecr.approval_token) {
      return new Response(JSON.stringify({ error: 'no approval token' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    // Employee profile (for name + check-in time)
    const [{ data: empProfile }, { data: ci }, shiftRes] = await Promise.all([
      supabase.from('profiles').select('name').eq('user_id', ecr.employee_id).maybeSingle(),
      supabase.from('check_ins').select('check_in_time').eq('id', ecr.check_in_id).maybeSingle(),
      ecr.shift_id
        ? supabase.from('shifts').select('shift_date, start_time, end_time').eq('id', ecr.shift_id).maybeSingle()
        : Promise.resolve({ data: null as any }),
    ])

    const shift = (shiftRes as any).data
    const shiftDate = shift?.shift_date || ''
    const shiftStart = shift?.start_time ? (shift.start_time as string).slice(0, 5) : ''
    const shiftEnd = shift?.end_time ? (shift.end_time as string).slice(0, 5) : ''

    // Compute earlyMinutes from shift end vs requested_at
    let earlyMinutes = 0
    if (shift?.end_time && shift?.shift_date) {
      const endTime = shift.end_time as string
      const startTime = shift.start_time as string
      const baseDate = shift.shift_date as string
      let endDate = baseDate
      if (endTime <= startTime) {
        const [y, m, d] = baseDate.split('-').map(Number)
        const next = new Date(Date.UTC(y, m - 1, d + 1))
        endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
      }
      // VN local end → UTC
      const [yy, mm, dd] = endDate.split('-').map(Number)
      const [hh, mi] = endTime.split(':').map(Number)
      const endUtc = new Date(Date.UTC(yy, mm - 1, dd, hh, mi) - 7 * 60 * 60 * 1000)
      const reqAt = new Date(ecr.requested_at).getTime()
      earlyMinutes = Math.max(0, Math.round((endUtc.getTime() - reqAt) / 60000))
    }

    // Find recipients: HR users in the same branch; fallback to all ADMINs
    let recipients: { email: string; name: string }[] = []

    if (ecr.branch_id) {
      const { data: hrRows } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(name, email, branch_id)')
        .eq('role', 'HR')
      const filtered = (hrRows || []).filter((r: any) => r.profiles?.branch_id === ecr.branch_id && r.profiles?.email)
      recipients = filtered.map((r: any) => ({ email: r.profiles.email, name: r.profiles.name || 'HR' }))
    }

    if (recipients.length === 0) {
      const { data: adminRows } = await supabase
        .from('user_roles')
        .select('user_id, profiles!inner(name, email)')
        .eq('role', 'ADMIN')
      recipients = (adminRows || [])
        .filter((r: any) => r.profiles?.email)
        .map((r: any) => ({ email: r.profiles.email, name: r.profiles.name || 'Quản lý' }))
    }

    if (recipients.length === 0) {
      return new Response(JSON.stringify({ ok: false, reason: 'no_recipients' }), {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      })
    }

    const checkInLabel = (() => {
      if (!ci?.check_in_time) return ''
      const d = new Date(ci.check_in_time)
      const local = new Date(d.getTime() + 7 * 60 * 60 * 1000)
      return `${String(local.getUTCHours()).padStart(2, '0')}:${String(local.getUTCMinutes()).padStart(2, '0')}`
    })()

    const base = `${supabaseUrl}/functions/v1/approve-early-checkout-by-token`
    const approveUrl = `${base}?t=${encodeURIComponent(ecr.approval_token)}&a=approve`
    const rejectUrl = `${base}?t=${encodeURIComponent(ecr.approval_token)}&a=reject`

    const sendResults = await Promise.allSettled(
      recipients.map((r) =>
        supabase.functions.invoke('send-transactional-email', {
          body: {
            templateName: 'early-checkout-approval-request',
            recipientEmail: r.email,
            idempotencyKey: `early-co-${ecr.id}-${r.email}`,
            templateData: {
              hrName: r.name,
              employeeName: empProfile?.name || 'Nhân viên',
              shiftDate,
              shiftStart,
              shiftEnd,
              checkInTime: checkInLabel,
              earlyMinutes,
              reason: ecr.reason || '',
              approveUrl,
              rejectUrl,
            },
          },
        }),
      ),
    )

    const sent = sendResults.filter((r) => r.status === 'fulfilled').length
    const failed = sendResults.length - sent

    return new Response(
      JSON.stringify({ ok: true, recipients: recipients.length, sent, failed }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    )
  } catch (e) {
    console.error('notify-early-checkout-hr error', e)
    return new Response(JSON.stringify({ error: String((e as Error).message || e) }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }
})
