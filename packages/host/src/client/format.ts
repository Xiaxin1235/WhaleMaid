import { t, type Locale } from '@whalemaid/core'
import type { PanelStatus } from '../panel-api/contract.js'

export function serviceRows(status: PanelStatus, locale: Locale) {
  return Object.entries(status.services).map(([name, available]) => ({
    name,
    available,
    text: `${available ? '✓' : '✗'} ${t(locale, available ? 'available' : 'unavailable')}`,
  }))
}
export function formatStartedAt(timestamp: number, locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short' }).format(timestamp)
}
