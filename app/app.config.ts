export default defineAppConfig({
  ui: {
    colors: {
      primary: 'indigo',
      secondary: 'amber',
      success: 'emerald',
      neutral: 'stone',
    },
    button: { defaultVariants: { size: 'sm' } },
    card: {
      slots: { root: 'min-w-0 rounded-lg' },
      variants: {
        variant: {
          outline: { root: 'border border-default bg-elevated/20 divide-y divide-default ring-0' },
        },
      },
    },
    empty: {
      variants: {
        variant: { outline: { root: 'border border-dashed border-default bg-muted/10 ring-0' } },
      },
      defaultVariants: { variant: 'outline' },
    },
    formField: {
      slots: {
        label: 'block font-semibold text-default',
        container: 'space-y-2',
        help: 'text-sm text-toned',
        description: 'text-sm text-toned',
        error: 'text-sm text-error',
      },
    },
    input: { variants: { variant: { outline: 'bg-elevated/40 hover:bg-elevated/55' } } },
    textarea: { variants: { variant: { outline: 'bg-elevated/40 hover:bg-elevated/55' } } },
    modal: { slots: { content: 'inspector-overlay', footer: 'justify-end' } },
    slideover: { slots: { content: 'inspector-overlay' } },
    dropdownMenu: { slots: { content: 'inspector-floating' } },
    popover: { slots: { content: 'inspector-floating' } },
    selectMenu: { slots: { content: 'inspector-floating' } },
    toast: { slots: { root: 'inspector-overlay' } },
  },
})
