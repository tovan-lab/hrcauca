/**
 * Sanitize user input to prevent XSS attacks.
 * Strips all HTML tags and dangerous characters from strings.
 */
export function sanitizeText(input: string): string {
  if (!input) return '';
  return input
    // Remove HTML tags
    .replace(/<[^>]*>/g, '')
    // Remove javascript: protocol
    .replace(/javascript\s*:/gi, '')
    // Remove on* event handlers
    .replace(/on\w+\s*=\s*["'][^"']*["']/gi, '')
    // Remove data: protocol for images
    .replace(/data\s*:\s*[^;]+;base64/gi, '')
    // Encode special HTML entities
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#x27;');
}

/**
 * Sanitize for display — decode entities back for safe text rendering.
 * Use this when displaying text that was already sanitized before storage.
 */
export function sanitizeForSubmit(input: string): string {
  if (!input) return '';
  // Strip HTML/JS but keep readable text
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .trim();
}
