/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface MagicLinkEmailProps {
  siteName: string
  confirmationUrl: string
}

export const MagicLinkEmail = ({
  siteName,
  confirmationUrl,
}: MagicLinkEmailProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Liên kết đăng nhập Hr Cậu Cả</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Hr Cậu Cả</Text>
        <Heading style={h1}>Liên kết đăng nhập</Heading>
        <Text style={text}>
          Nhấn nút bên dưới để đăng nhập vào Hr Cậu Cả. Liên kết này sẽ hết hạn trong thời gian ngắn.
        </Text>
        <Button style={button} href={confirmationUrl}>
          Đăng nhập
        </Button>
        <Text style={footer}>
          Nếu bạn không yêu cầu liên kết này, vui lòng bỏ qua email này.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default MagicLinkEmail

const main = { backgroundColor: '#ffffff', fontFamily: 'Inter, Arial, sans-serif' }
const container = { padding: '20px 25px' }
const brand = {
  fontSize: '18px',
  fontWeight: 'bold' as const,
  color: 'hsl(217, 91%, 50%)',
  margin: '0 0 20px',
}
const h1 = {
  fontSize: '22px',
  fontWeight: 'bold' as const,
  color: 'hsl(215, 25%, 12%)',
  margin: '0 0 20px',
}
const text = {
  fontSize: '14px',
  color: 'hsl(215, 14%, 46%)',
  lineHeight: '1.5',
  margin: '0 0 25px',
}
const button = {
  backgroundColor: 'hsl(217, 91%, 50%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '0.625rem',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
