import * as React from 'npm:react@18.3.1'
import {
  Body, Button, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface Props {
  hrName?: string
  employeeName?: string
  shiftDate?: string
  shiftStart?: string
  shiftEnd?: string
  checkInTime?: string
  earlyMinutes?: number
  reason?: string
  approveUrl?: string
  rejectUrl?: string
}

const Email = ({
  hrName,
  employeeName,
  shiftDate,
  shiftStart,
  shiftEnd,
  checkInTime,
  earlyMinutes,
  reason,
  approveUrl,
  rejectUrl,
}: Props) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>
      {employeeName || 'Nhân viên'} xin về sớm {earlyMinutes ?? '?'} phút - cần bạn duyệt
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {hrName ? `Xin chào ${hrName},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Một nhân viên vừa gửi yêu cầu xin về sớm và cần bạn xét duyệt:
        </Text>

        <Section style={card}>
          <Text style={cardLabel}>Nhân viên</Text>
          <Text style={cardValue}>{employeeName || '—'}</Text>

          <Text style={cardLabel}>Ca đăng ký ({shiftDate || '—'})</Text>
          <Text style={cardValue}>
            {shiftStart || '—'} – {shiftEnd || '—'}
          </Text>

          <Text style={cardLabel}>Giờ đã check-in</Text>
          <Text style={cardValue}>{checkInTime || '—'}</Text>

          <Text style={cardLabel}>Xin về sớm</Text>
          <Text style={cardValueAccent}>{earlyMinutes ?? '?'} phút</Text>

          <Text style={cardLabel}>Lý do</Text>
          <Text style={cardValueReason}>{reason || '(không có)'}</Text>
        </Section>

        <Text style={text}>
          Bấm <strong>một</strong> trong hai nút bên dưới để duyệt nhanh - không cần đăng nhập:
        </Text>

        <Section style={{ textAlign: 'center', margin: '24px 0' }}>
          <Button href={approveUrl} style={btnApprove}>
            Duyệt cho về sớm
          </Button>
          <Text style={{ ...text, margin: '12px 0' }}>hoặc</Text>
          <Button href={rejectUrl} style={btnReject}>
            Từ chối yêu cầu
          </Button>
        </Section>

        <Text style={hint}>
          Link này chỉ dùng được một lần. Nếu bạn không phải người nhận, vui lòng bỏ qua email.
        </Text>
        <Text style={footer}>Trân trọng, hệ thống {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) =>
    `[Cau Ca] ${data.employeeName || 'Nhân viên'} xin về sớm ${data.earlyMinutes ?? ''} phút`,
  displayName: 'Yêu cầu duyệt về sớm',
  previewData: {
    hrName: 'Minh Tây',
    employeeName: 'Phạm Trọng',
    shiftDate: '19/04/2026',
    shiftStart: '14:00',
    shiftEnd: '20:00',
    checkInTime: '14:05',
    earlyMinutes: 90,
    reason: 'Có việc gia đình đột xuất',
    approveUrl: 'https://example.com/approve?t=abc&a=approve',
    rejectUrl: 'https://example.com/approve?t=abc&a=reject',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#f1f5f9',
  borderLeft: '4px solid #f59e0b',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '15px', color: '#0f172a', fontWeight: 600, margin: '0 0 12px' }
const cardValueAccent = { fontSize: '18px', color: '#dc2626', fontWeight: 700, margin: '0 0 12px' }
const cardValueReason = { fontSize: '14px', color: '#0f172a', margin: '0 0 4px', whiteSpace: 'pre-wrap' as const }
const btnApprove = {
  backgroundColor: '#16a34a',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const btnReject = {
  backgroundColor: '#dc2626',
  color: '#ffffff',
  padding: '12px 28px',
  borderRadius: '6px',
  fontSize: '15px',
  fontWeight: 600,
  textDecoration: 'none',
  display: 'inline-block',
}
const hint = { fontSize: '12px', color: '#94a3b8', fontStyle: 'italic', margin: '8px 0 0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
