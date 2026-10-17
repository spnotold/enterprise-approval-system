import { describe, expect, it } from 'vitest'
import {
  MAX_ACTIVE_RIPPLES,
  isBackgroundClick,
  isPaperBackgroundChain,
  pruneRipples,
  pushRipple,
  resolvePaperColors,
  type RippleItem,
} from './usePaperField'

interface MockTarget {
  tagName: string
  className: string
  parent?: MockTarget | null
  parentElement?: MockTarget | null
  getAttribute: (name: string) => string | null
  hasAttribute: (name: string) => boolean
  closest: (selector: string) => MockTarget | null
}

function createMockElement(tag: string, className = '', parent: MockTarget | null = null): MockTarget {
  const el: MockTarget = {
    tagName: tag.toUpperCase(),
    className,
    parent,
    parentElement: parent,
    getAttribute: () => null,
    hasAttribute: () => false,
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

  describe('isPaperBackgroundChain', () => {
    it('accepts a chain whose backgrounds are all transparent', () => {
      expect(
        isPaperBackgroundChain([
          { tagName: 'SPAN', role: null, backgroundColor: 'rgba(0, 0, 0, 0)' },
          { tagName: 'DIV', role: null, backgroundColor: 'transparent' },
          { tagName: 'MAIN', role: null, backgroundColor: 'rgb(0 0 0 / 0%)' },
        ]),
      ).toBe(true)
    })

    it.each([
      'rgb(255, 255, 255)',
      'rgba(255, 255, 255, 0.01)',
      'rgb(255 255 255 / 20%)',
      'color(srgb 1 1 1 / 0.4)',
    ])('rejects a non-transparent background: %s', (backgroundColor) => {
      expect(isPaperBackgroundChain([{ tagName: 'DIV', role: null, backgroundColor }])).toBe(
        false,
      )
    })

    it.each(['button', 'a', 'input', 'textarea', 'select'])(
      'rejects interactive <%s> elements',
      (tagName) => {
        expect(
          isPaperBackgroundChain([{ tagName, role: null, backgroundColor: 'transparent' }]),
        ).toBe(false)
      },
    )

    it.each(['button', 'switch', 'slider', 'combobox', 'option', 'menuitem'])(
      'rejects role=%s elements',
      (role) => {
        expect(
          isPaperBackgroundChain([{ tagName: 'DIV', role, backgroundColor: 'transparent' }]),
        ).toBe(false)
      },
    )

    it('rejects elements with a contenteditable attribute', () => {
      expect(
        isPaperBackgroundChain([
          {
            tagName: 'DIV',
            role: null,
            backgroundColor: 'transparent',
            contentEditable: true,
          },
        ]),
      ).toBe(false)
    })

    it('checks every ancestor in the chain', () => {
      expect(
        isPaperBackgroundChain([
          { tagName: 'SPAN', role: null, backgroundColor: 'transparent' },
          { tagName: 'SECTION', role: null, backgroundColor: 'rgba(242, 243, 240, 1)' },
        ]),
      ).toBe(false)
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

  describe('ripple queue helpers', () => {
    const ripple = (x: number, t0: number): RippleItem => ({ x, y: 0, t0 })

    it('appends ripples without mutating the input array', () => {
      const base = [ripple(1, 0)]
      const next = pushRipple(base, ripple(2, 10))
      expect(next.map((item) => item.x)).toEqual([1, 2])
      expect(base).toHaveLength(1)
    })

    it('keeps at most 3 ripples and drops the earliest one', () => {
      let ripples: RippleItem[] = []
      for (let i = 0; i < 5; i++) {
        ripples = pushRipple(ripples, ripple(i, i * 100))
      }
      expect(ripples).toHaveLength(MAX_ACTIVE_RIPPLES)
      expect(ripples.map((item) => item.x)).toEqual([2, 3, 4])
    })

    it('prunes ripples once they reach the 1000ms lifetime', () => {
      const ripples = [ripple(1, 0), ripple(2, 400), ripple(3, 900)]
      expect(pruneRipples(ripples, 1500).map((item) => item.x)).toEqual([3])
      expect(pruneRipples(ripples, 1899).map((item) => item.x)).toEqual([3])
      expect(pruneRipples(ripples, 1900)).toEqual([])
    })
  })
})
