/** Share the theme cycle and icons between sign-in and the workspace. */
export const useTheme = () => {
  const colorMode = useColorMode()
  const theme = computed(() => {
    if ('dark' === colorMode.preference) {
      return { label: 'Dark', icon: 'i-lucide-moon', next: 'system' }
    }
    if ('light' === colorMode.preference) {
      return { label: 'Light', icon: 'i-lucide-sun', next: 'dark' }
    }
    return { label: 'System', icon: 'i-lucide-monitor', next: 'light' }
  })

  const cycleTheme = () => { colorMode.preference = theme.value.next }

  return { theme, cycleTheme }
}
