import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface BranchChangedProps {
  name?: string
  fromBranch?: string
  toBranch?: string
  changedBy?: string
  effectiveDate?: string
}

const BranchChangedEmail = ({
  name,
  fromBranch,
  toBranch,
  changedBy,
  effectiveDate,
}: BranchChangedProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Bạn được chuyển chi nhánh làm việc</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {name ? `Xin chào ${name},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Chi nhánh làm việc cố định của bạn vừa được{' '}
          {changedBy ? <strong>{changedBy}</strong> : 'quản lý'} cập nhật trên hệ thống {SITE_NAME}.
          Đây là thay đổi <strong>dài hạn</strong> – tất cả các ca sắp tới sẽ thuộc về chi nhánh mới
          (trừ khi có yêu cầu chi viện riêng).
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Chi nhánh cũ</Text>
          <Text style={cardValue}>{fromBranch || '— (chưa có)'}</Text>
          <Text style={cardLabel}>Chi nhánh mới</Text>
          <Text style={cardValueHighlight}>{toBranch || '— (đã gỡ)'}</Text>
          <Text style={cardLabel}>Có hiệu lực từ</Text>
          <Text style={cardValue}>{effectiveDate || 'Hôm nay'}</Text>
        </Section>
        <Text style={text}>
          Vui lòng đăng nhập vào hệ thống để xem lịch ca và check-in đúng chi nhánh mới.
          Nếu có thắc mắc hoặc đây là sự nhầm lẫn, hãy liên hệ ngay với quản lý của bạn.
        </Text>
        <Text style={footer}>Trân trọng, đội ngũ {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: BranchChangedEmail,
  subject: (data: Record<string, any>) =>
    data.toBranch
      ? `Bạn được chuyển sang ${data.toBranch}`
      : 'Chi nhánh làm việc của bạn đã thay đổi',
  displayName: 'Đổi chi nhánh dài hạn',
  previewData: {
    name: 'Quân Bùi',
    fromBranch: 'Chi nhánh A',
    toBranch: 'Chi nhánh B',
    changedBy: 'HR Chi nhánh A',
    effectiveDate: '17/04/2026',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#f0fdf4',
  borderLeft: '4px solid #16a34a',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#64748b', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '15px', color: '#0f172a', fontWeight: 600, margin: '0 0 12px' }
const cardValueHighlight = { fontSize: '17px', color: '#16a34a', fontWeight: 700, margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
