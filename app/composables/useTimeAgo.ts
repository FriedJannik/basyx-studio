/** "just now", "5 min ago", "3 h ago", "2 d ago" for an ISO timestamp. */
export function useTimeAgo () {
  const { t } = useI18n()
  return (iso: string) => {
    const minutes = Math.round((Date.now() - new Date(iso).getTime()) / 60_000)
    if (minutes < 1) {
      return t('time.now')
    }
    if (minutes < 60) {
      return t('time.minutes', { count: minutes })
    }
    if (minutes < 1440) {
      return t('time.hours', { count: Math.round(minutes / 60) })
    }
    return t('time.days', { count: Math.round(minutes / 1440) })
  }
}
