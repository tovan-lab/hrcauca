// Public endpoint to approve/reject an early-checkout request via a token
// embedded in the HR notification email. Renders a friendly HTML page so
// HR can confirm/cancel the action right inside their browser, no login.
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.45.0'

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!
const SERVICE_ROLE = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
}

function htmlPage(opts: {
  title: string
  heading: string
  body: string
  color: string
  showConfirmForm?: { token: string; action: 'approve' | 'reject' }
}) {
  const confirmBlock = opts.showConfirmForm
    ? `
      <form method="POST" style="margin-top:24px;display:flex;gap:12px;justify-content:center;flex-wrap:wrap">
        <input type="hidden" name="token" value="${opts.showConfirmForm.token}" />
        <input type="hidden" name="action" value="${opts.showConfirmForm.action}" />
        <button type="submit" style="background:${opts.color};color:#fff;border:0;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600;cursor:pointer">
          Xác nhận ${opts.showConfirmForm.action === 'approve' ? 'DUYỆT' : 'TỪ CHỐI'}
        </button>
        <a href="javascript:history.back()" style="background:#e2e8f0;color:#0f172a;text-decoration:none;padding:12px 28px;border-radius:8px;font-size:15px;font-weight:600">
          Hủy
        </a>
      </form>
    `
    : ''
  return `<!DOCTYPE html>
<html lang="vi">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${opts.title}</title>
  <style>
    body { margin:0; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Arial, sans-serif; background:#f8fafc; color:#0f172a; }
    .wrap { max-width:520px; margin:60px auto; padding:32px 28px; background:#fff; border-radius:14px; box-shadow:0 10px 40px -10px rgba(15,23,42,0.15); text-align:center }
    h1 { font-size:22px; margin:0 0 12px; color:${opts.color} }
    p  { font-size:15px; color:#334155; line-height:1.6; margin:0 0 8px }
    .muted { color:#94a3b8; font-size:12px; margin-top:24px }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>${opts.heading}</h1>
    ${opts.body}
    ${confirmBlock}
    <p class="muted">Cau Ca · Hệ thống quản lý chấm công</p>
  </div>
</body>
</html>`
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })

  let token = ''
  let action = ''
  let isConfirmed = false

  try {
    if (req.method === 'GET') {
      const url = new URL(req.url)
      token = url.searchParams.get('t') || url.searchParams.get('token') || ''
      action = url.searchParams.get('a') || url.searchParams.get('action') || ''
      // GET = show confirmation page (do NOT mutate yet — avoids email
      // pre-fetchers like Outlook/Bitdefender accidentally approving)
      isConfirmed = false
    } else if (req.method === 'POST') {
      const ct = req.headers.get('content-type') || ''
      if (ct.includes('application/json')) {
        const body = await req.json()
        token = body.token || ''
        action = body.action || ''
      } else {
        const form = await req.formData()
        token = String(form.get('token') || '')
        action = String(form.get('action') || '')
      }
      isConfirmed = true
    }
  } catch {
    // ignore parse errors, will fail validation below
  }

  if (!token || !['approve', 'reject'].includes(action)) {
    return new Response(
      htmlPage({
        title: 'Liên kết không hợp lệ',
        heading: 'Liên kết không hợp lệ',
        body: '<p>Liên kết bạn vừa bấm không đúng hoặc đã hỏng. Vui lòng kiểm tra lại email.</p>',
        color: '#dc2626',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  // GET → show confirmation page (do NOT call RPC yet)
  if (!isConfirmed) {
    return new Response(
      htmlPage({
        title: action === 'approve' ? 'Duyệt yêu cầu về sớm' : 'Từ chối yêu cầu về sớm',
        heading: action === 'approve' ? 'Duyệt cho nhân viên về sớm?' : 'Từ chối yêu cầu về sớm?',
        body: `<p>Bấm <strong>Xác nhận</strong> bên dưới để hoàn tất hành động.</p>`,
        color: action === 'approve' ? '#16a34a' : '#dc2626',
        showConfirmForm: { token, action: action as 'approve' | 'reject' },
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  // POST → actually call the RPC
  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE)
  const { data, error } = await supabase.rpc('approve_early_checkout_by_token', {
    _token: token,
    _action: action,
  })

  if (error) {
    return new Response(
      htmlPage({
        title: 'Lỗi xử lý',
        heading: 'Có lỗi xảy ra',
        body: `<p>Không thể xử lý yêu cầu lúc này. Vui lòng thử lại sau.</p><p class="muted">${error.message}</p>`,
        color: '#dc2626',
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const result = data as { ok: boolean; error?: string; status?: string }

  if (!result?.ok) {
    if (result?.error === 'already_processed') {
      const isApproved = result.status === 'approved'
      return new Response(
        htmlPage({
          title: 'Đã xử lý',
          heading: 'Yêu cầu này đã được xử lý',
          body: `<p>Trạng thái hiện tại: <strong style="color:${isApproved ? '#16a34a' : '#dc2626'}">${isApproved ? 'ĐÃ DUYỆT' : 'ĐÃ TỪ CHỐI'}</strong></p><p>Không cần thao tác thêm.</p>`,
          color: '#64748b',
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    if (result?.error === 'token_not_found') {
      return new Response(
        htmlPage({
          title: 'Token không hợp lệ',
          heading: 'Liên kết không tồn tại',
          body: '<p>Yêu cầu này có thể đã bị huỷ hoặc liên kết đã hỏng.</p>',
          color: '#dc2626',
        }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
      )
    }
    return new Response(
      htmlPage({
        title: 'Lỗi',
        heading: 'Không xử lý được',
        body: `<p>${result?.error || 'Lỗi không xác định'}</p>`,
        color: '#dc2626',
      }),
      { status: 400, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
    )
  }

  const approved = result.status === 'approved'
  return new Response(
    htmlPage({
      title: approved ? 'Đã duyệt' : 'Đã từ chối',
      heading: approved ? '✓ Đã duyệt cho nhân viên về sớm' : '✗ Đã từ chối yêu cầu',
      body: `<p>Hành động đã được ghi nhận thành công.${approved ? ' Nhân viên có thể check-out ngay.' : ''}</p><p>Bạn có thể đóng cửa sổ này.</p>`,
      color: approved ? '#16a34a' : '#dc2626',
    }),
    { status: 200, headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' } },
  )
})
