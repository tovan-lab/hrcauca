# Project Memory

## Core
HR & Performance Management App. Slate/blue palette, Inter font. Primary #2563eb.
3 roles: ADMIN, HR, EMPLOYEE. Supabase auth with RLS.
Storage bucket checkin-images is PRIVATE — use signed URLs only.

## Memories
- [Roles & schema](mem://features/roles-schema) — ADMIN/HR/EMPLOYEE roles, users + check_ins tables
- [Scoring categories](mem://features/scoring-plan) — Vietnamese categories planned for Phase 2
- [Reward/Penalty](mem://features/reward-penalty) — Reward/penalty rules from evaluations
- [Security Phase 8](mem://features/security-phase8) — Brute-force, XSS, session timeout, CAPTCHA, private storage
