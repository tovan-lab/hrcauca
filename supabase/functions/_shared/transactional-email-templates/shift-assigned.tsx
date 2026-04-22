import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface ShiftAssignedProps {
  name?: string
  shiftDate?: string
  startTime?: string
  endTime?: string
  assignedBy?: string
}

const ShiftAssignedEmail = ({
  name,
  shiftDate,
  startTime,
  endTime,
  assignedBy,
}: ShiftAssignedProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Bạn vừa được xếp ca làm việc mới</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Xin chào ${name},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Bạn vừa được {assignedBy ? <strong>{assignedBy}</strong> : 'quản lý'} xếp một ca làm việc mới trong hệ thống {SITE_NAME}.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Ngày làm việc</Text>
          <Text style={cardValue}>{shiftDate || '—'}</Text>
          <Text style={cardLabel}>Giờ làm</Text>
          <Text style={cardValue}>
            {startTime || '—'} – {endTime || '—'}
          </Text>
        </Section>
        <Text style={text}>
          Vui lòng đăng nhập vào hệ thống để xem chi tiết và chuẩn bị check-in đúng giờ. Nếu có vấn đề, hãy liên hệ ngay với quản lý ca của bạn.
        </Text>
        <Text style={footer}>Trân trọng, đội ngũ {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ShiftAssignedEmail,
  subject: (data: Record<string, any>) =>
    data.shiftDate ? `Bạn được xếp ca ngày ${data.shiftDate}` : 'Bạn được xếp ca làm mới',
  displayName: 'Thông báo xếp ca',
  previewData: {
    name: 'Quân Bùi',
    shiftDate: '20/04/2026',
    startTime: '15:00',
    endTime: '23:00',
    assignedBy: 'HR Chi nhánh A',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#f1f5f9',
  borderLeft: '4px solid #2563eb',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '16px', color: '#0f172a', fontWeight: 600, margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
