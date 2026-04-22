import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface ForgotItem {
  employeeName: string
  shiftDate: string
  shiftStart: string
  shiftEnd: string
  checkInTime: string
  overdueHours: number
  autoClosed: boolean
}

interface Props {
  hrName?: string
  branchName?: string
  reportDate?: string
  items?: ForgotItem[]
}

const Email = ({ hrName, branchName, reportDate, items = [] }: Props) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>
      {items.length} nhân viên quên check-out tại {branchName || 'chi nhánh'} ngày {reportDate || ''}
    </Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>
          {hrName ? `Xin chào ${hrName},` : 'Xin chào,'}
        </Heading>
        <Text style={text}>
          Hệ thống ghi nhận có <strong>{items.length} nhân viên</strong> đã check-in nhưng <strong>quên check-out</strong> tại chi nhánh <strong>{branchName || '—'}</strong> ngày <strong>{reportDate || '—'}</strong>.
        </Text>
        <Text style={text}>
          Tất cả ca này đã được hệ thống <strong>tự động đóng</strong> bằng giờ kết thúc của ca và được đánh dấu <em>cần xác minh</em>. Vui lòng kiểm tra và liên hệ với nhân viên nếu cần.
        </Text>

        <Section style={tableWrap}>
          <table style={table as React.CSSProperties} cellPadding={0} cellSpacing={0}>
            <thead>
              <tr>
                <th style={th}>Nhân viên</th>
                <th style={th}>Ca</th>
                <th style={th}>Check-in</th>
                <th style={thRight}>Quá hạn</th>
              </tr>
            </thead>
            <tbody>
              {items.map((it, i) => (
                <tr key={i} style={i % 2 === 0 ? rowEven : rowOdd}>
                  <td style={td}>{it.employeeName}</td>
                  <td style={td}>{it.shiftStart}–{it.shiftEnd}</td>
                  <td style={td}>{it.checkInTime}</td>
                  <td style={tdRight}>~{it.overdueHours}h</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Section>

        <Text style={hint}>
          Bạn có thể vào mục <strong>Logs chấm công</strong> để xem ảnh check-in và xác minh thủ công.
        </Text>

        <Text style={footer}>— Hệ thống {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: Email,
  subject: (data: Record<string, any>) => {
    const count = Array.isArray(data.items) ? data.items.length : 0
    const branch = data.branchName || 'chi nhánh'
    return `[${branch}] ${count} nhân viên quên check-out ngày ${data.reportDate || ''}`
  },
  displayName: 'Tổng hợp nhân viên quên check-out',
  previewData: {
    hrName: 'Minh Tây',
    branchName: 'Chi nhánh A',
    reportDate: '19/04/2026',
    items: [
      { employeeName: 'Phạm Trọng', shiftDate: '19/04/2026', shiftStart: '08:00', shiftEnd: '12:00', checkInTime: '08:05', overdueHours: 14, autoClosed: true },
      { employeeName: 'Quân Bùi', shiftDate: '19/04/2026', shiftStart: '14:00', shiftEnd: '22:00', checkInTime: '13:58', overdueHours: 4, autoClosed: true },
    ],
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '600px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const tableWrap = { margin: '20px 0' }
const table = { width: '100%', borderCollapse: 'collapse' as const, fontSize: '13px' }
const th = { textAlign: 'left' as const, padding: '10px 12px', backgroundColor: '#f1f5f9', color: '#475569', fontWeight: 600, borderBottom: '1px solid #e2e8f0' }
const thRight = { ...th, textAlign: 'right' as const }
const td = { padding: '10px 12px', color: '#0f172a', borderBottom: '1px solid #f1f5f9' }
const tdRight = { ...td, textAlign: 'right' as const, fontWeight: 600, color: '#dc2626' }
const rowEven = { backgroundColor: '#ffffff' }
const rowOdd = { backgroundColor: '#fafafa' }
const hint = { fontSize: '13px', color: '#64748b', backgroundColor: '#fffbeb', borderLeft: '3px solid #f59e0b', padding: '10px 14px', borderRadius: '4px', margin: '20px 0' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
