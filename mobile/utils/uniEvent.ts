/** Uni component event payloads used by input, picker and switch components. */
export interface UniInputEvent {
  detail: { value: string }
}

export interface UniPickerChangeEvent {
  detail: { value: number | string }
}

export interface UniSwitchChangeEvent {
  detail: { value: boolean }
}

function detailValue(event: object): unknown {
  if (!('detail' in event)) return undefined
  const detail = event.detail
  if (typeof detail !== 'object' || detail === null || !('value' in detail)) return undefined
  return detail.value
}

function inputElement(event: object): HTMLInputElement | HTMLTextAreaElement | undefined {
  if (!('target' in event)) return undefined
  const target = event.target
  if (typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement) return target
  if (typeof HTMLTextAreaElement !== 'undefined' && target instanceof HTMLTextAreaElement) return target
  return undefined
}

export function inputValue(event: Event | UniInputEvent): string {
  const value = detailValue(event)
  if (typeof value === 'string') return value
  return inputElement(event)?.value ?? ''
}

export function pickerValue(event: Event | UniPickerChangeEvent): number | string {
  const value = detailValue(event)
  return typeof value === 'number' || typeof value === 'string' ? value : ''
}

export function switchValue(event: Event | UniSwitchChangeEvent): boolean {
  const value = detailValue(event)
  if (typeof value === 'boolean') return value
  const target = inputElement(event)
  return typeof HTMLInputElement !== 'undefined' && target instanceof HTMLInputElement && target.type === 'checkbox'
    ? target.checked
    : false
}
