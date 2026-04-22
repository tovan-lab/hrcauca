---
name: Phase 8 Security Hardening
description: Brute-force login protection, XSS sanitization, session timeout, CAPTCHA mock, private storage with signed URLs
type: feature
---
- Login: 3 failed attempts → 5-min lockout (localStorage-based)
- CAPTCHA: Mock Turnstile wrapper on login, ready for real API key via VITE_TURNSTILE_SITE_KEY
- Input sanitization: sanitizeForSubmit() used on feedback and evaluation comment fields
- Session timeout: 30-min inactivity auto-logout with Vietnamese toast
- Check-in throttle: 10-second cooldown between captures
- Storage: checkin-images bucket set to PRIVATE, images fetched via 60s signed URLs
- RLS: Existing policies enforce uid-based access for employees, branch-scoped for HR, full for Admin
