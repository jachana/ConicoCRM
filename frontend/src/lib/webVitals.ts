import { onLCP, onINP, onCLS, onTTFB, type Metric } from 'web-vitals'

function send(metric: Metric): void {
  const sampleRate = Number(import.meta.env.VITE_TELEMETRY_SAMPLE_RATE ?? '1.0')
  if (Math.random() > sampleRate) return

  fetch('/api/telemetry/web-vitals', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      metric: metric.name,
      value: metric.value,
      route: window.location.pathname,
      user_agent: navigator.userAgent,
      timestamp: new Date().toISOString(),
    }),
    keepalive: true,
  }).catch(() => {
    // Silently drop — vitals reporting must never break the app
  })
}

export function initWebVitals(): void {
  if (import.meta.env.DEV) return
  onLCP(send)
  onINP(send)
  onCLS(send)
  onTTFB(send)
}

// Exported only for unit tests
export { send }
