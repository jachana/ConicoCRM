/**
 * Sentry initialization for the Conico frontend (W1-06).
 *
 * DSN is read from `VITE_SENTRY_DSN`. If empty, init is skipped — local dev
 * and CI must not require a Sentry project.
 */
import * as Sentry from '@sentry/react'

let initialized = false

export function initSentry(): boolean {
  if (initialized) return true

  const dsn = import.meta.env.VITE_SENTRY_DSN as string | undefined
  if (!dsn) {
    // Intentionally quiet in dev — only warn once at boot.
    if (import.meta.env.DEV) {
      // eslint-disable-next-line no-console
      console.info('[sentry] VITE_SENTRY_DSN empty — skipping init')
    }
    return false
  }

  Sentry.init({
    dsn,
    environment:
      (import.meta.env.VITE_SENTRY_ENV as string | undefined) ??
      (import.meta.env.MODE || 'production'),
    // Conservative defaults — bumping requires a product decision.
    tracesSampleRate: Number(import.meta.env.VITE_SENTRY_TRACES_SAMPLE_RATE ?? '0'),
    replaysSessionSampleRate: 0,
    replaysOnErrorSampleRate: 0,
  })

  initialized = true
  return true
}

export { Sentry }
