// Cron-driven function: scans for check-ins without check_out_time,
// groups them per branch, and (after the branch's last shift end + 2h)
// sends ONE summary email per branch per day to all HR users of that branch,
// then auto-closes those check-ins.
//
// Idempotency: uses email_send_log row with template_name='forgot-checkout-summary'
// and metadata.dedupe_key = `forgot-checkout-${branchId}-${YYYY-MM-DD}` to
// guarantee max 1 email per (branch, date).

import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

const TZ_OFFSET_MINUTES = 7 * 60 // Asia/Ho_Chi_Minh (UTC+7), no DST

function toLocal(d: Date): Date {
  return new Date(d.getTime() + TZ_OFFSET_MINUTES * 60 * 1000)
}
function localYMD(d: Date): string {
  const l = toLocal(d)
  return `${l.getUTCFullYear()}-${String(l.getUTCMonth() + 1).padStart(2, '0')}-${String(l.getUTCDate()).padStart(2, '0')}`
}
function ymdToVi(ymd: string): string {
  const [y, m, d] = ymd.split('-')
  return `${d}/${m}/${y}`
}
function fmtTime(iso: string): string {
  const l = toLocal(new Date(iso))
  return `${String(l.getUTCHours()).padStart(2, '0')}:${String(l.getUTCMinutes()).padStart(2, '0')}`
}
// Build a UTC Date from a local YYYY-MM-DD + HH:MM:SS
function localDateTimeToUTC(ymd: string, hms: string): Date {
  const [y, m, d] = ymd.split('-').map(Number)
  const [hh, mm, ss] = hms.split(':').map(Number)
  // Local time -> UTC: subtract offset
  return new Date(Date.UTC(y, m - 1, d, hh, mm, ss || 0) - TZ_OFFSET_MINUTES * 60 * 1000)
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders })

  const supabaseUrl = Deno.env.get('SUPABASE_URL')!
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  const supabase = createClient(supabaseUrl, supabaseServiceKey)

  const now = new Date()
  // Process the previous local day. If we're past 02:00 local, also try today's
  // already-finished shifts in case last shift ended early.
  const localNow = toLocal(now)
  const candidateDates: string[] = []
  // Always include "yesterday" in local timezone (handles overnight shifts ending early morning)
  const yesterdayLocal = new Date(Date.UTC(localNow.getUTCFullYear(), localNow.getUTCMonth(), localNow.getUTCDate() - 1))
  candidateDates.push(`${yesterdayLocal.getUTCFullYear()}-${String(yesterdayLocal.getUTCMonth() + 1).padStart(2, '0')}-${String(yesterdayLocal.getUTCDate()).padStart(2, '0')}`)
  // If currently past local 02:00, also consider today
  if (localNow.getUTCHours() >= 2) {
    candidateDates.push(localYMD(now))
  }

  const summary: Array<Record<string, unknown>> = []

  // Get all branches
  const { data: branches, error: bErr } = await supabase
    .from('branches')
    .select('id, branch_name')
  if (bErr) {
    console.error('Failed to load branches', bErr)
    return new Response(JSON.stringify({ error: bErr.message }), { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } })
  }

  for (const branch of branches || []) {
    for (const dateStr of candidateDates) {
      try {
        const dedupeKey = `forgot-checkout-${branch.id}-${dateStr}`

        // Idempotency: skip if a run row already exists for (branch, date)
        const { data: prior } = await supabase
          .from('forgot_checkout_runs')
          .select('id')
          .eq('branch_id', branch.id)
          .eq('report_date', dateStr)
          .maybeSingle()
        if (prior) {
          continue
        }

        // Find the last shift end_time for this branch on this date.
        // A shift "belongs to" the branch via shifts.actual_branch_id (after swap)
        // OR via the employee's home branch (profiles.branch_id) when actual_branch_id is null.
        // Simpler approach: query check_ins.branch_id which is set at check-in time.
        const { data: openCheckIns, error: ciErr } = await supabase
          .from('check_ins')
          .select('id, user_id, check_in_time, shift_id, branch_id')
          .eq('branch_id', branch.id)
          .is('check_out_time', null)

        if (ciErr) {
          console.error('check_ins query failed', ciErr)
          continue
        }
        if (!openCheckIns || openCheckIns.length === 0) continue

        // Filter by local date (check_in_time falls on dateStr)
        const onDate = openCheckIns.filter((c) => localYMD(new Date(c.check_in_time)) === dateStr)
        if (onDate.length === 0) continue

        // Load the related shifts to know each shift end_time
        const shiftIds = onDate.map((c) => c.shift_id).filter(Boolean) as string[]
        const userIds = onDate.map((c) => c.user_id)
        const [{ data: shifts }, { data: profiles }] = await Promise.all([
          shiftIds.length > 0
            ? supabase.from('shifts').select('id, user_id, shift_date, start_time, end_time').in('id', shiftIds)
            : Promise.resolve({ data: [] as any[] }),
          supabase.from('profiles').select('user_id, name, email').in('user_id', userIds),
        ])
        const shiftMap = new Map((shifts || []).map((s) => [s.id, s]))
        const profileMap = new Map((profiles || []).map((p) => [p.user_id, p]))

        // Compute last shift end on this date for the branch (across the open check-ins)
        let lastEndUtc: Date | null = null
        for (const ci of onDate) {
          const sh = ci.shift_id ? shiftMap.get(ci.shift_id) : null
          if (sh && sh.end_time && sh.shift_date) {
            // If end_time <= start_time => overnight, push to next local day
            const endTime = sh.end_time as string
            const startTime = sh.start_time as string
            const baseDate = sh.shift_date as string
            let endDate = baseDate
            if (endTime <= startTime) {
              const [y, m, d] = baseDate.split('-').map(Number)
              const next = new Date(Date.UTC(y, m - 1, d + 1))
              endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
            }
            const endUtc = localDateTimeToUTC(endDate, endTime)
            if (!lastEndUtc || endUtc > lastEndUtc) lastEndUtc = endUtc
          } else {
            // No shift linked: assume check_in + 8h as end
            const fallback = new Date(new Date(ci.check_in_time).getTime() + 8 * 3600 * 1000)
            if (!lastEndUtc || fallback > lastEndUtc) lastEndUtc = fallback
          }
        }
        if (!lastEndUtc) continue

        // Gate: only proceed if now >= lastEnd + 2h
        const triggerAt = new Date(lastEndUtc.getTime() + 2 * 3600 * 1000)
        if (now < triggerAt) continue

        // Find HR users for this branch
        const { data: hrProfiles } = await supabase
          .from('profiles')
          .select('user_id, name, email')
          .eq('branch_id', branch.id)
        const hrUserIds = (hrProfiles || []).map((p) => p.user_id)
        if (hrUserIds.length === 0) continue
        const { data: hrRoles } = await supabase
          .from('user_roles')
          .select('user_id')
          .eq('role', 'HR')
          .in('user_id', hrUserIds)
        const hrSet = new Set((hrRoles || []).map((r) => r.user_id))
        const hrRecipients = (hrProfiles || []).filter((p) => hrSet.has(p.user_id) && p.email)
        if (hrRecipients.length === 0) continue

        // Build email items + auto-close updates
        const items = onDate.map((ci) => {
          const sh = ci.shift_id ? shiftMap.get(ci.shift_id) : null
          const prof = profileMap.get(ci.user_id)
          const overdueHours = Math.max(1, Math.round((now.getTime() - new Date(ci.check_in_time).getTime()) / 3600000))
          return {
            employeeName: prof?.name || 'Nhân viên',
            shiftDate: ymdToVi(dateStr),
            shiftStart: sh?.start_time ? (sh.start_time as string).slice(0, 5) : '—',
            shiftEnd: sh?.end_time ? (sh.end_time as string).slice(0, 5) : '—',
            checkInTime: fmtTime(ci.check_in_time),
            overdueHours,
            autoClosed: true,
          }
        })

        // Auto-close each open check-in
        for (const ci of onDate) {
          const sh = ci.shift_id ? shiftMap.get(ci.shift_id) : null
          let closeAt: Date
          if (sh?.end_time && sh?.shift_date) {
            const endTime = sh.end_time as string
            const startTime = sh.start_time as string
            const baseDate = sh.shift_date as string
            let endDate = baseDate
            if (endTime <= startTime) {
              const [y, m, d] = baseDate.split('-').map(Number)
              const next = new Date(Date.UTC(y, m - 1, d + 1))
              endDate = `${next.getUTCFullYear()}-${String(next.getUTCMonth() + 1).padStart(2, '0')}-${String(next.getUTCDate()).padStart(2, '0')}`
            }
            closeAt = localDateTimeToUTC(endDate, endTime)
          } else {
            closeAt = new Date(new Date(ci.check_in_time).getTime() + 8 * 3600 * 1000)
          }
          await supabase
            .from('check_ins')
            .update({ check_out_time: closeAt.toISOString(), verified: false })
            .eq('id', ci.id)
        }

        // Insert run row FIRST (atomic dedupe via unique constraint).
        // If two cron runs race, only one INSERT succeeds; the other gets a
        // unique-violation and we skip sending.
        const { error: insErr } = await supabase
          .from('forgot_checkout_runs')
          .insert({
            branch_id: branch.id,
            report_date: dateStr,
            employee_count: items.length,
            hr_count: hrRecipients.length,
          })
        if (insErr) {
          // 23505 = unique_violation -> another worker already sent
          console.log('skip (already sent or insert failed)', branch.id, dateStr, insErr.message)
          continue
        }

        // Send 1 email per HR
        for (const hr of hrRecipients) {
          try {
            await supabase.functions.invoke('send-transactional-email', {
              body: {
                templateName: 'forgot-checkout-summary',
                recipientEmail: hr.email,
                idempotencyKey: `${dedupeKey}-${hr.user_id}`,
                templateData: {
                  hrName: hr.name,
                  branchName: branch.branch_name,
                  reportDate: ymdToVi(dateStr),
                  items,
                },
              },
            })
          } catch (e) {
            console.error('send-transactional-email failed', e)
          }
        }

        summary.push({ branch: branch.branch_name, date: dateStr, count: items.length, hrCount: hrRecipients.length })
      } catch (e) {
        console.error('branch loop error', branch.id, e)
      }
    }
  }

  return new Response(JSON.stringify({ ok: true, processed: summary }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
