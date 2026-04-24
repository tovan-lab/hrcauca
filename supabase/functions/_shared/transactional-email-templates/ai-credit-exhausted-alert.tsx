import * as React from 'npm:react@18.3.1'
import {
  Body, Container, Head, Heading, Html, Preview, Section, Text,
} from 'npm:@react-email/components@0.0.22'
import type { TemplateEntry } from './registry.ts'

const SITE_NAME = 'Cau Ca'

interface AiCreditExhaustedAlertProps {
  requesterName?: string
  requesterRole?: string
  happenedAt?: string
}

const AiCreditExhaustedAlertEmail = ({
  requesterName,
  requesterRole,
  happenedAt,
}: AiCreditExhaustedAlertProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Cảnh báo OpenAI chatbot đã hết credit</Preview>
    <Body style={main}>
      <Container style={container}>
        <Heading style={h1}>Cảnh báo hết credit OpenAI</Heading>
        <Text style={text}>
          Hệ thống chatbot AI của {SITE_NAME} vừa gặp lỗi hết quota/credit OpenAI và đã tạm ngừng trả lời.
        </Text>
        <Section style={card}>
          <Text style={cardLabel}>Người phát sinh</Text>
          <Text style={cardValue}>{requesterName || 'Không rõ'}</Text>
          <Text style={cardLabel}>Vai trò</Text>
          <Text style={cardValue}>{requesterRole || 'Không rõ'}</Text>
          <Text style={cardLabel}>Thời điểm</Text>
          <Text style={cardValue}>{happenedAt || 'Không rõ'}</Text>
        </Section>
        <Text style={text}>
          Vui lòng kiểm tra billing OpenAI, nạp thêm credit hoặc cập nhật API key để HR và quản lý có thể tiếp tục sử dụng chatbot.
        </Text>
        <Text style={footer}>Thông báo tự động từ hệ thống {SITE_NAME}</Text>
      </Container>
    </Body>
  </Html>
)

export const template = {
  component: AiCreditExhaustedAlertEmail,
  subject: 'Cảnh báo: chatbot AI đã hết credit OpenAI',
  displayName: 'Cảnh báo hết credit OpenAI',
  previewData: {
    requesterName: 'Quân Bùi',
    requesterRole: 'Quản lý',
    happenedAt: '25/04/2026 10:30',
  },
} satisfies TemplateEntry

const main = { backgroundColor: '#ffffff', fontFamily: 'Arial, sans-serif' }
const container = { padding: '24px 28px', maxWidth: '560px' }
const h1 = { fontSize: '22px', fontWeight: 'bold', color: '#0f172a', margin: '0 0 16px' }
const text = { fontSize: '14px', color: '#334155', lineHeight: '1.6', margin: '0 0 16px' }
const card = {
  backgroundColor: '#fff7ed',
  borderLeft: '4px solid #ea580c',
  borderRadius: '6px',
  padding: '16px 20px',
  margin: '20px 0',
}
const cardLabel = { fontSize: '11px', color: '#9a3412', textTransform: 'uppercase' as const, letterSpacing: '0.04em', margin: '0 0 4px' }
const cardValue = { fontSize: '16px', color: '#7c2d12', fontWeight: 600, margin: '0 0 12px' }
const footer = { fontSize: '12px', color: '#94a3b8', margin: '28px 0 0' }
