import { describe, it, expect, vi } from 'vitest'
import { renderHook } from '@testing-library/react'
import { fireEvent } from '@testing-library/react'
import { useGlobalShortcut } from '../hooks/useGlobalShortcut'

describe('useGlobalShortcut', () => {
  it('fires callback on Ctrl+K when atajo is ctrl_k', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('ctrl_k', onTrigger))
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('does NOT fire on Ctrl+K when atajo is alt_s', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('alt_s', onTrigger))
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true })
    expect(onTrigger).not.toHaveBeenCalled()
  })

  it('fires on Alt+S when atajo is alt_s', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('alt_s', onTrigger))
    fireEvent.keyDown(window, { key: 's', altKey: true })
    expect(onTrigger).toHaveBeenCalledTimes(1)
  })

  it('preventDefault on Ctrl+P to avoid browser print dialog', () => {
    const onTrigger = vi.fn()
    renderHook(() => useGlobalShortcut('ctrl_p', onTrigger))
    const ev = new KeyboardEvent('keydown', { key: 'p', ctrlKey: true, cancelable: true })
    window.dispatchEvent(ev)
    expect(ev.defaultPrevented).toBe(true)
  })
})
