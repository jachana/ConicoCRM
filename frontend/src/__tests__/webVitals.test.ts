import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'

vi.mock('web-vitals', () => ({
  onLCP: vi.fn(),
  onINP: vi.fn(),
  onCLS: vi.fn(),
  onTTFB: vi.fn(),
}))

describe('webVitals', () => {
  let fetchMock: ReturnType<typeof vi.fn>

  beforeEach(() => {
    fetchMock = vi.fn().mockResolvedValue({ ok: true })
    vi.stubGlobal('fetch', fetchMock)
  })

  afterEach(() => {
    vi.unstubAllEnvs()
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  describe('initWebVitals', () => {
    it('registers all 5 vital callbacks in production', async () => {
      vi.stubEnv('DEV', false)
      const wv = await import('web-vitals')
      const { initWebVitals } = await import('../lib/webVitals')

      initWebVitals()

      expect(wv.onLCP).toHaveBeenCalledOnce()
      expect(wv.onINP).toHaveBeenCalledOnce()
      expect(wv.onCLS).toHaveBeenCalledOnce()
      expect(wv.onTTFB).toHaveBeenCalledOnce()
    })

    it('skips registration in DEV', async () => {
      vi.stubEnv('DEV', true)
      const wv = await import('web-vitals')
      const { initWebVitals } = await import('../lib/webVitals')

      initWebVitals()

      expect(wv.onLCP).not.toHaveBeenCalled()
    })
  })

  describe('send', () => {
    const METRIC_NAMES = ['LCP', 'INP', 'CLS', 'TTFB'] as const

    it.each(METRIC_NAMES)('sends correct POST payload for %s', async (name) => {
      vi.stubEnv('VITE_TELEMETRY_SAMPLE_RATE', '1.0')
      const { send } = await import('../lib/webVitals')

      send({ name, value: 250.5 } as Parameters<typeof send>[0])

      expect(fetchMock).toHaveBeenCalledOnce()
      const [url, opts] = fetchMock.mock.calls[0]
      expect(url).toBe('/api/telemetry/web-vitals')
      expect(opts.method).toBe('POST')
      expect(opts.keepalive).toBe(true)

      const body = JSON.parse(opts.body)
      expect(body.metric).toBe(name)
      expect(body.value).toBe(250.5)
      expect(body.route).toBeDefined()
      expect(body.user_agent).toBeDefined()
      expect(body.timestamp).toMatch(/^\d{4}-/)
    })

    it('drops metric when sample rate is 0', async () => {
      vi.stubEnv('VITE_TELEMETRY_SAMPLE_RATE', '0')
      const { send } = await import('../lib/webVitals')

      send({ name: 'LCP', value: 100 } as Parameters<typeof send>[0])

      expect(fetchMock).not.toHaveBeenCalled()
    })
  })
})
