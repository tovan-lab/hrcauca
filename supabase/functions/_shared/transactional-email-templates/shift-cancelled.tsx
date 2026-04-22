import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface ShiftCancelledProps {
  name?: string
  shiftDate?: string
  startTime?: string
  endTime?: string
  cancelledBy?: string
  reason?: string
}

const ShiftCancelledEmail = ({
  name,
  shiftDate,
  startTime,
  endTime,
  cancelledBy,
  reason,
}: ShiftCancelledProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Ca làm việc của bạn đã bị hủy</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Xin chào ${name},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Chúng tôi xin thông báo: ca làm việc dưới đây của bạn đã được{' '}
          {cancelledBy ? <strong>{cancelledBy}</strong> : 'quản lý'} hủy trên hệ thống {SITE_NAME}.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Ngày làm việc</Text>
          <Text style={cardValue}>{shiftDate || '—'}</Text>
          <Text style={cardLabel}>Giờ làm</Text>
          <Text style={cardValue}>
            {startTime || '—'} – {endTime || '—'}
          </Text>
          {reason ? (
            <>
              <Text style={cardLabel}>Lý do</Text>
              <Text style={cardValue}>{reason}</Text>
            </>
          ) : null}
        </Section>
        <Text style={text}>
          Bạn không cần check-in cho ca này. Nếu có thắc mắc hoặc đây là sự nhầm lẫn, vui lòng liên hệ ngay với quản lý ca của bạn.
        </Text>
        <Text style={footer}>Trân trọng, đội ngũ {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ShiftCancelledEmail,
  subject: (data: Record<string, any>) =>
    data.shiftDate ? `Ca ngày ${data.shiftDate} đã bị hủy` : 'Ca làm của bạn đã bị hủy',
  displayName: 'Thông báo hủy ca',
  previewData: {
    name: 'Quân Bùi',
    shiftDate: '20/04/2026',
    startTime: '15:00',
    endTime: '23:00',
    cancelledBy: 'HR Chi nhánh A',
    reason: 'Sắp xếp lại lịch',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#fef2f2',
  borderLeft: '4px solid #dc2626',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '16px', color: '#0f172a', fontWeight: 600, margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
