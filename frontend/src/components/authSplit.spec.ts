import { describe, expect, it } from 'vitest'
import {
  AUTH_ASIDE_WIDTH_MIN,
  AUTH_FORM_WIDTH_DEFAULT,
  AUTH_FORM_WIDTH_MAX_RATIO,
  AUTH_FORM_WIDTH_MIN,
  AUTH_SPLIT_KEY_STEP,
  AUTH_SPLIT_STORAGE_KEY,
  clampFormWidth,
  initialFormWidth,
  maxFormWidth,
  readFormWidth,
  stepFormWidth,
  writeFormWidth,
  type SplitStorage,
} from './authSplit'

/** 内存版 localStorage */
function fakeStorage(initial?: Record<string, string>): SplitStorage & { data: Map<string, string> } {
  const data = new Map(Object.entries(initial ?? {}))
  return {
    data,
    getItem: (key) => (data.has(key) ? (data.get(key) as string) : null),
    setItem: (key, value) => {
      data.set(key, value)
    },
  }
}

/** 读写都会抛错的 storage（隐私模式 / 配额满） */
const brokenStorage: SplitStorage = {
  getItem: () => {
    throw new Error('denied')
  },
  setItem: () => {
    throw new Error('quota')
  },
}

describe('auth split constants', () => {
  it('pins the default, the ranges and the storage key', () => {
    expect(AUTH_FORM_WIDTH_DEFAULT).toBe(540)
    expect(AUTH_FORM_WIDTH_MIN).toBe(380)
    expect(AUTH_ASIDE_WIDTH_MIN).toBe(360)
    expect(AUTH_FORM_WIDTH_MAX_RATIO).toBe(0.6)
    expect(AUTH_SPLIT_KEY_STEP).toBe(16)
    expect(AUTH_SPLIT_STORAGE_KEY).toBe('eas.auth.formWidth')
  })
})

describe('maxFormWidth', () => {
  it('caps the form at 60vw', () => {
    expect(maxFormWidth(1280)).toBe(768)
    expect(maxFormWidth(1920)).toBe(1152)
    expect(maxFormWidth(1000)).toBe(600)
  })

  it('keeps at least 360px for the aside when that is the tighter bound', () => {
    expect(maxFormWidth(900)).toBe(540)
    expect(maxFormWidth(800)).toBe(440)
    expect(maxFormWidth(740)).toBe(380)
  })

  it('goes below the minimum when the viewport is too narrow', () => {
    expect(maxFormWidth(700)).toBe(340)
    expect(maxFormWidth(360)).toBe(0)
    expect(maxFormWidth(0)).toBeLessThan(AUTH_FORM_WIDTH_MIN)
    expect(maxFormWidth(Number.NaN)).toBeLessThan(AUTH_FORM_WIDTH_MIN)
  })
})

describe('clampFormWidth', () => {
  it('leaves a valid width alone', () => {
    expect(clampFormWidth(540, 1280)).toBe(540)
    expect(clampFormWidth(380, 1280)).toBe(380)
    expect(clampFormWidth(768, 1280)).toBe(768)
  })

  it('clamps to the minimum of 380', () => {
    expect(clampFormWidth(200, 1280)).toBe(380)
    expect(clampFormWidth(0, 1280)).toBe(380)
    expect(clampFormWidth(-100, 1280)).toBe(380)
  })

  it('clamps to 60vw or the aside bound, whichever is smaller', () => {
    expect(clampFormWidth(1280, 1280)).toBe(768)
    expect(clampFormWidth(900, 1280)).toBe(768)
    expect(clampFormWidth(700, 1000)).toBe(600)
    expect(clampFormWidth(990, 800)).toBe(440)
  })

  it('never lets the aside fall below 360px', () => {
    expect(clampFormWidth(900, 800)).toBe(440)
    expect(maxFormWidth(800)).toBe(800 - AUTH_ASIDE_WIDTH_MIN)
  })

  it('falls back to 380 when the viewport is too narrow to clamp', () => {
    expect(clampFormWidth(540, 700)).toBe(380)
    expect(clampFormWidth(540, 360)).toBe(380)
    expect(clampFormWidth(540, 0)).toBe(380)
  })

  it('treats a non-finite width as the default before clamping', () => {
    expect(clampFormWidth(Number.NaN, 1280)).toBe(540)
    expect(clampFormWidth(Number.POSITIVE_INFINITY, 1280)).toBe(768)
    expect(clampFormWidth(Number.NEGATIVE_INFINITY, 1280)).toBe(380)
  })
})

describe('readFormWidth / writeFormWidth', () => {
  it('round-trips a width through localStorage', () => {
    const store = fakeStorage()
    writeFormWidth(460, store)
    expect(store.data.get(AUTH_SPLIT_STORAGE_KEY)).toBe('460')
    expect(readFormWidth(store)).toBe(460)
  })

  it('returns null when the key is missing', () => {
    expect(readFormWidth(fakeStorage())).toBeNull()
  })

  it('returns null for illegal values', () => {
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: 'abc' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '540px' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: 'Infinity' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '0' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '-20' }))).toBeNull()
    expect(readFormWidth(fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '  480  ' }))).toBe(480)
  })

  it('returns null when localStorage is unavailable instead of throwing', () => {
    expect(readFormWidth(null)).toBeNull()
    expect(readFormWidth(brokenStorage)).toBeNull()
    expect(() => writeFormWidth(460, brokenStorage)).not.toThrow()
    expect(() => writeFormWidth(460, null)).not.toThrow()
  })

  it('ignores writing a non-finite width', () => {
    const store = fakeStorage()
    writeFormWidth(Number.NaN, store)
    expect(store.data.size).toBe(0)
  })
})

describe('initialFormWidth', () => {
  it('uses the stored width clamped to the current viewport', () => {
    expect(initialFormWidth(1280, fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '700' }))).toBe(700)
    expect(initialFormWidth(1280, fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '9999' }))).toBe(768)
    expect(initialFormWidth(800, fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: '700' }))).toBe(440)
  })

  it('falls back to 540 when nothing usable is stored', () => {
    expect(initialFormWidth(1280, fakeStorage())).toBe(540)
    expect(initialFormWidth(1280, fakeStorage({ [AUTH_SPLIT_STORAGE_KEY]: 'oops' }))).toBe(540)
    expect(initialFormWidth(1280, null)).toBe(540)
    expect(initialFormWidth(300, null)).toBe(380)
  })
})

describe('stepFormWidth', () => {
  it('steps 16px with the arrow keys', () => {
    expect(stepFormWidth('ArrowLeft', 540, 1280)).toBe(524)
    expect(stepFormWidth('ArrowRight', 540, 1280)).toBe(556)
    expect(AUTH_SPLIT_KEY_STEP).toBe(16)
  })

  it('stops at the range edges', () => {
    expect(stepFormWidth('ArrowLeft', 384, 1280)).toBe(380)
    expect(stepFormWidth('ArrowLeft', 380, 1280)).toBe(380)
    expect(stepFormWidth('ArrowRight', 760, 1280)).toBe(768)
    expect(stepFormWidth('ArrowRight', 768, 1280)).toBe(768)
  })

  it('jumps to the minimum and maximum with Home / End', () => {
    expect(stepFormWidth('Home', 540, 1280)).toBe(380)
    expect(stepFormWidth('End', 540, 1280)).toBe(768)
    expect(stepFormWidth('End', 540, 800)).toBe(440)
    expect(stepFormWidth('Home', 540, 300)).toBe(380)
    expect(stepFormWidth('End', 540, 300)).toBe(380)
  })

  it('leaves every other key alone', () => {
    expect(stepFormWidth('Tab', 540, 1280)).toBeNull()
    expect(stepFormWidth('Enter', 540, 1280)).toBeNull()
    expect(stepFormWidth('ArrowUp', 540, 1280)).toBeNull()
    expect(stepFormWidth('ArrowDown', 540, 1280)).toBeNull()
    expect(stepFormWidth('a', 540, 1280)).toBeNull()
  })
})
