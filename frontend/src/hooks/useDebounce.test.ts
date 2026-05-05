import { renderHook, act, waitFor } from '@testing-library/react'
import { vi, it, expect, describe, beforeEach, afterEach } from 'vitest'
import { useDebounce } from './useDebounce'

describe('useDebounce', () => {
  beforeEach(() => {
    vi.useFakeTimers()
  })

  afterEach(() => {
    vi.restoreAllMocks()
  })

  it('returns initial value immediately', () => {
    const { result } = renderHook(() => useDebounce('initial', 300))
    expect(result.current).toBe('initial')
  })

  it('delays value update by specified delay', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    )

    expect(result.current).toBe('initial')

    rerender({ value: 'updated' })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(299)
    })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(1)
    })
    expect(result.current).toBe('updated')
  })

  it('cancels previous timer when value changes before delay completes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'first' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('initial')

    rerender({ value: 'second' })
    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(150)
    })
    expect(result.current).toBe('second')
  })

  it('works with different delay values', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 100 } }
    )

    rerender({ value: 'updated', delay: 100 })
    expect(result.current).toBe('initial')

    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('updated')

    rerender({ value: 'final', delay: 500 })
    expect(result.current).toBe('updated')

    act(() => {
      vi.advanceTimersByTime(500)
    })
    expect(result.current).toBe('final')
  })

  it('works with generic types (numbers)', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 42 } }
    )

    expect(result.current).toBe(42)

    rerender({ value: 100 })
    expect(result.current).toBe(42)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe(100)
  })

  it('works with generic types (objects)', () => {
    const obj1 = { name: 'test', count: 1 }
    const obj2 = { name: 'test2', count: 2 }

    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: obj1 } }
    )

    expect(result.current).toBe(obj1)

    rerender({ value: obj2 })
    expect(result.current).toBe(obj1)

    act(() => {
      vi.advanceTimersByTime(300)
    })
    expect(result.current).toBe(obj2)
  })

  it('cleans up timer on unmount', () => {
    const clearTimeoutSpy = vi.spyOn(global, 'clearTimeout')
    const { unmount, rerender } = renderHook(
      ({ value }) => useDebounce(value, 300),
      { initialProps: { value: 'initial' } }
    )

    rerender({ value: 'updated' })
    expect(clearTimeoutSpy).toHaveBeenCalled()

    unmount()
    expect(clearTimeoutSpy).toHaveBeenCalled()

    clearTimeoutSpy.mockRestore()
  })

  it('handles rapid value changes', () => {
    const { result, rerender } = renderHook(
      ({ value }) => useDebounce(value, 100),
      { initialProps: { value: 'a' } }
    )

    rerender({ value: 'b' })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    rerender({ value: 'c' })
    act(() => {
      vi.advanceTimersByTime(50)
    })

    rerender({ value: 'd' })
    act(() => {
      vi.advanceTimersByTime(100)
    })

    expect(result.current).toBe('d')
  })

  it('respects delay parameter changes', () => {
    const { result, rerender } = renderHook(
      ({ value, delay }) => useDebounce(value, delay),
      { initialProps: { value: 'initial', delay: 300 } }
    )

    rerender({ value: 'updated', delay: 300 })
    act(() => {
      vi.advanceTimersByTime(200)
    })
    expect(result.current).toBe('initial')

    rerender({ value: 'updated', delay: 100 })
    act(() => {
      vi.advanceTimersByTime(100)
    })
    expect(result.current).toBe('updated')
  })
})
