/// <reference types="npm:@types/react@18.3.1" />

import * as React from 'npm:react@18.3.1'

import {
  Body,
  Button,
  Container,
  Head,
  Heading,
  Html,
  Link,
  Preview,
  Text,
} from 'npm:@react-email/components@0.0.22'

interface EmailChangeEmailProps {
  siteName: string
  email: string
  newEmail: string
  confirmationUrl: string
}

export const EmailChangeEmail = ({
  siteName,
  email,
  newEmail,
  confirmationUrl,
}: EmailChangeEmailProps) => (
  <Html lang="vi" dir="ltr">
    <Head />
    <Preview>Xác nhận thay đổi email tại Hr Cậu Cả</Preview>
    <Body style={main}>
      <Container style={container}>
        <Text style={brand}>Hr Cậu Cả</Text>
        <Heading style={h1}>Xác nhận thay đổi email</Heading>
        <Text style={text}>
          Bạn đã yêu cầu thay đổi địa chỉ email tại Hr Cậu Cả từ{' '}
          <Link href={`mailto:${email}`} style={link}>
            {email}
          </Link>{' '}
          sang{' '}
          <Link href={`mailto:${newEmail}`} style={link}>
            {newEmail}
          </Link>
          .
        </Text>
        <Text style={text}>
          Nhấn nút bên dưới để xác nhận thay đổi:
        </Text>
        <Button style={button} href={confirmationUrl}>
          Xác nhận thay đổi Email
        </Button>
        <Text style={footer}>
          Nếu bạn không yêu cầu thay đổi này, vui lòng bảo mật tài khoản ngay lập tức.
        </Text>
      </Container>
    </Body>
  </Html>
)

export default EmailChangeEmail

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
const link = { color: 'inherit', textDecoration: 'underline' }
const button = {
  backgroundColor: 'hsl(217, 91%, 50%)',
  color: '#ffffff',
  fontSize: '14px',
  borderRadius: '0.625rem',
  padding: '12px 20px',
  textDecoration: 'none',
}
const footer = { fontSize: '12px', color: '#999999', margin: '30px 0 0' }
