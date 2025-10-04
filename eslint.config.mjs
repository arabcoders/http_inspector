// @ts-check
import withNuxt from './.nuxt/eslint.config.mjs'

export default withNuxt(
  {
    rules: {
      "vue/first-attribute-linebreak": "off",
      "vue/multi-word-component-names": "off",
      "vue/no-v-html": "off",
    },
  }
)
