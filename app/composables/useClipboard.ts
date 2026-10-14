/** Copies text and confirms it in the snackbar. */
export function useClipboard () {
  const { t } = useI18n()
  const notifications = useNotificationsStore()
  return async (text: string, label?: string) => {
    try {
      await navigator.clipboard.writeText(text)
      notifications.notify({ text: t('common.copied', { label: label ?? t('common.value') }), color: 'info' })
    } catch {
      notifications.notify({ text: t('common.clipboardUnavailable'), color: 'error' })
    }
  }
}
