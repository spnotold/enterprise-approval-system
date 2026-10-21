import { ref } from 'vue'
import { describe, expect, it } from 'vitest'
import { createApplicationContext } from './applicationContext'
import { detailSectionHint } from '../router/sectionContext'
import { visibleSections } from '../router/menu'

describe('loaded application context', () => {
  it('uses published ownership for direct links without making another detail request', () => {
    const context = createApplicationContext(() => 12)
    const sections = visibleSections(() => true)
    expect(context.applicantId.value).toBeUndefined()
    context.publish(12, 7)
    expect(detailSectionHint([], sections, context.applicantId.value, 7)).toBe('application')
    context.publish(12, 8)
    expect(detailSectionHint([], sections, context.applicantId.value, 7)).toBe('approval')
    expect(detailSectionHint(['mine'], sections, context.applicantId.value, 7)).toBe('application')
  })

  it('hides another application’s ownership and rejects late responses after navigation', () => {
    const id = ref<number>()
    const context = createApplicationContext(() => id.value)
    id.value = 12
    context.publish(12, 7)
    id.value = 13
    expect(context.applicantId.value).toBeUndefined()
    context.publish(13, 8)
    context.publish(12, 7)
    expect(context.applicantId.value).toBe(8)
    id.value = undefined
    expect(context.applicantId.value).toBeUndefined()
  })
})
