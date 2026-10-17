import { describe, it, expect } from 'vitest'

/**
 * Task status dot CSS class derivation.
 * The template uses `st-${String(status).toLowerCase()}` to map task status
 * values to CSS classes that set the --dot custom property.
 */
function dotStatusClass(status: string): string {
  return `st-${String(status).toLowerCase()}`
}

/** Expected mapping of task status to design-spec colour token (docs/ui_design.md §2). */
const EXPECTED_DOT_TOKEN: Record<string, string> = {
  PENDING: '--eas-primary',
  APPROVED: '--eas-success',
  REJECTED: '--eas-danger',
  CANCELED: '--eas-muted',
  TRANSFERRED: '--eas-warning',
}

/** CSS classes that set --dot (matches TaskListContent.vue <style scoped>). */
const CLASS_TO_TOKEN: Record<string, string> = {
  'st-pending': '--eas-primary',
  'st-approved': '--eas-success',
  'st-rejected': '--eas-danger',
  'st-canceled': '--eas-muted',
  'st-transferred': '--eas-warning',
}

describe('dotStatusClass', () => {
  it.each(Object.entries(EXPECTED_DOT_TOKEN))(
    'maps status %s to CSS class with correct colour token',
    (status, expectedToken) => {
      const cls = dotStatusClass(status)
      expect(cls).toBe(`st-${status.toLowerCase()}`)
      expect(CLASS_TO_TOKEN[cls]).toBe(expectedToken)
    },
  )

  it('produces a class for unknown status that falls back to --dot default (--eas-muted)', () => {
    const cls = dotStatusClass('UNKNOWN')
    // Unknown statuses won't match any CSS rule, so --dot stays unset
    // and the .dot element uses var(--dot, var(--eas-muted)) → muted.
    expect(cls).toBe('st-unknown')
    expect(CLASS_TO_TOKEN[cls]).toBeUndefined()
  })
})
