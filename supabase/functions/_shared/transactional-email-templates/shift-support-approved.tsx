import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface ShiftSupportApprovedProps {
  name?: string
  shiftDate?: string
  startTime?: string
  endTime?: string
  fromBranch?: string
  toBranch?: string
  approvedBy?: string
  note?: string
}

const ShiftSupportApprovedEmail = ({
  name,
  shiftDate,
  startTime,
  endTime,
  fromBranch,
  toBranch,
  approvedBy,
  note,
}: ShiftSupportApprovedProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Bạn được điều chuyển hỗ trợ chi nhánh khác</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Xin chào ${name},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Yêu cầu chi viện cho ca làm của bạn vừa được{' '}
          {approvedBy ? <strong>{approvedBy}</strong> : 'quản lý chi nhánh đích'} duyệt trên hệ thống {SITE_NAME}.
          Vui lòng đến đúng chi nhánh mới cho ca này.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Ngày làm việc</Text>
          <Text style={cardValue}>{shiftDate || '—'}</Text>
          <Text style={cardLabel}>Giờ làm</Text>
          <Text style={cardValue}>
            {startTime || '—'} – {endTime || '—'}
          </Text>
          <Text style={cardLabel}>Chi nhánh hiện tại</Text>
          <Text style={cardValue}>{fromBranch || '—'}</Text>
          <Text style={cardLabel}>Chi nhánh đến hỗ trợ</Text>
          <Text style={cardValueHighlight}>{toBranch || '—'}</Text>
          {note ? (
            <>
              <Text style={cardLabel}>Ghi chú</Text>
              <Text style={cardValue}>{note}</Text>
            </>
          ) : null}
        </Section>
        <Text style={text}>
          Vui lòng check-in tại chi nhánh đến hỗ trợ. Nếu có vấn đề, hãy liên hệ ngay với quản lý ca của bạn.
        </Text>
        <Text style={footer}>Trân trọng, đội ngũ {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: ShiftSupportApprovedEmail,
  subject: (data: Record<string, any>) =>
    data.shiftDate
      ? `Bạn được điều sang ${data.toBranch || 'chi nhánh khác'} ngày ${data.shiftDate}`
      : 'Yêu cầu chi viện đã được duyệt',
  displayName: 'Duyệt chi viện ca',
  previewData: {
    name: 'Quân Bùi',
    shiftDate: '20/04/2026',
    startTime: '15:00',
    endTime: '23:00',
    fromBranch: 'Chi nhánh A',
    toBranch: 'Chi nhánh B',
    approvedBy: 'HR Chi nhánh B',
    note: 'Ca tối thiếu người',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#eff6ff',
  borderLeft: '4px solid #2563eb',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '15px', color: '#0f172a', fontWeight: 600, margin: '0 0 12px' }
const cardValueHighlight = { fontSize: '17px', color: '#2563eb', fontWeight: 700, margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
