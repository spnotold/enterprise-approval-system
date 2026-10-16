import { describe, expect, it } from 'vitest'
import { isBackgroundClick, resolvePaperColors } from './usePaperField'

interface MockTarget {
  tagName: string
  className: string
  parent?: MockTarget | null
  closest: (selector: string) => MockTarget | null
}

function createMockElement(tag: string, className = '', parent: MockTarget | null = null): MockTarget {
  const el: MockTarget = {
    tagName: tag.toUpperCase(),
    className,
    parent,
    closest(selector: string): MockTarget | null {
      const selectors = selector.split(',').map((s) => s.trim())
      for (const s of selectors) {
        if (s.startsWith('.') && className.split(' ').includes(s.slice(1))) {
          return this
        }
        if (s.toLowerCase() === tag.toLowerCase()) {
          return this
        }
      }
      return parent ? parent.closest(selector) : null
    },
  }
  return el
}

describe('usePaperField helpers', () => {
  describe('resolvePaperColors', () => {
    it('returns default paper palette in node environment', () => {
      const colors = resolvePaperColors('paper')
      expect(colors.baseColor).toBe('#f2f3f0')
      expect(colors.baseDotColor.a).toBe(0.6)
      expect(colors.primaryRgb).toBeDefined()
      expect(colors.primaryDotColor.a).toBe(0.55)
    })

    it('resolves deep paper base color', () => {
      const colors = resolvePaperColors('deep')
      expect(colors.baseColor).toBeDefined()
    })
  })

  describe('isBackgroundClick', () => {
    it('returns false when clicking on interactive elements', () => {
      const button = createMockElement('button')
      const e = { target: button } as unknown as PointerEvent
      expect(isBackgroundClick(e)).toBe(false)

      const link = createMockElement('a')
      expect(isBackgroundClick({ target: link } as unknown as PointerEvent)).toBe(false)

      const input = createMockElement('input')
      expect(isBackgroundClick({ target: input } as unknown as PointerEvent)).toBe(false)
    })

    it('returns false when clicking inside .el-card or .sheet', () => {
      const card = createMockElement('div', 'el-card')
      const title = createMockElement('h3', 'card-title', card)
      expect(isBackgroundClick({ target: title } as unknown as PointerEvent)).toBe(false)

      const sheet = createMockElement('div', 'sheet')
      const part = createMockElement('section', 'part', sheet)
      expect(isBackgroundClick({ target: part } as unknown as PointerEvent)).toBe(false)
    })

    it('returns false when clicking inside .aside-inner in auth page', () => {
      const asideInner = createMockElement('div', 'aside-inner')
      const text = createMockElement('p', 'aside-text', asideInner)
      expect(isBackgroundClick({ target: text } as unknown as PointerEvent)).toBe(false)
    })

    it('returns true when clicking directly on background container', () => {
      const main = createMockElement('main', 'main')
      expect(isBackgroundClick({ target: main } as unknown as PointerEvent)).toBe(true)

      const aside = createMockElement('aside', 'auth-aside')
      expect(isBackgroundClick({ target: aside } as unknown as PointerEvent)).toBe(true)
    })
  })
})
