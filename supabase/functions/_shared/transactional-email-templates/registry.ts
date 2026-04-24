/// <reference types="npm:@types/react@18.3.1" />
import * as React from 'npm:react@18.3.1'

export interface TemplateEntry {
  component: React.ComponentType<any>
  subject: string | ((data: Record<string, any>) => string)
  to?: string
  displayName?: string
  previewData?: Record<string, any>
}

import { template as shiftAssigned } from './shift-assigned.tsx'
import { template as shiftCancelled } from './shift-cancelled.tsx'
import { template as shiftSupportApproved } from './shift-support-approved.tsx'
import { template as branchChanged } from './branch-changed.tsx'
import { template as earlyCheckoutApprovalRequest } from './early-checkout-approval-request.tsx'
import { template as forgotCheckoutSummary } from './forgot-checkout-summary.tsx'
import { template as aiCreditExhaustedAlert } from './ai-credit-exhausted-alert.tsx'

export const TEMPLATES: Record<string, TemplateEntry> = {
  'shift-assigned': shiftAssigned,
  'shift-cancelled': shiftCancelled,
  'shift-support-approved': shiftSupportApproved,
  'branch-changed': branchChanged,
  'early-checkout-approval-request': earlyCheckoutApprovalRequest,
  'forgot-checkout-summary': forgotCheckoutSummary,
  'ai-credit-exhausted-alert': aiCreditExhaustedAlert,
}
