<template>
  <div class="d-flex flex-column ga-3">
    <div v-if="label" class="text-body-medium">{{ label }}</div>

    <!-- One growing field per translation, labelled with its language: long
         text wraps inside its own field instead of pushing columns apart. The
         language is the button in front, which opens a searchable list. -->
    <v-textarea
      v-for="(entry, index) in strings"
      :key="index"
      auto-grow
      :counter="maxLength"
      :label="languageName(entry.language) || t('editor.text')"
      :maxlength="maxLength"
      :model-value="entry.text"
      rows="1"
      @update:model-value="text => change(index, { text })"
    >
      <template #prepend-inner>
        <v-menu v-model="pickerOpen[index]" :close-on-content-click="false">
          <template #activator="{ props: menu }">
            <v-btn
              v-bind="menu"
              append-icon="mdi-menu-down"
              :aria-label="t('editor.languageOf', { language: languageName(entry.language) || entry.language })"
              class="me-2"
              size="small"
              :text="entry.language || t('editor.language')"
              variant="tonal"
            />
          </template>

          <!-- A compact menu: the search as a flat band like the command
               palette's, and one line per language with its code at the end. -->
          <v-card min-width="240">
            <v-text-field
              v-model="filter"
              autofocus
              bg-color="surface-light"
              flat
              hide-details
              :placeholder="t('editor.languageSearch')"
              prepend-inner-icon="mdi-magnify"
              rounded="0"
              variant="solo"
              @keydown.enter.prevent="choose(index, filtered[0]?.code ?? filter.trim())"
            />

            <v-divider />

            <v-list max-height="320">
              <v-list-item
                v-for="item in filtered"
                :key="item.code"
                :active="item.code === entry.language"
                :title="item.name"
                @click="choose(index, item.code)"
              >
                <template #append>
                  <span class="text-body-small text-medium-emphasis ms-3">{{ item.code }}</span>
                </template>
              </v-list-item>

              <!-- Any BCP 47 tag, e.g. de-CH, may be typed. -->
              <v-list-item
                v-if="customCode"
                prepend-icon="mdi-plus"
                :title="t('editor.languageUse', { code: customCode })"
                @click="choose(index, customCode)"
              />
            </v-list>
          </v-card>
        </v-menu>
      </template>

      <template #append-inner>
        <v-btn
          v-tooltip="t('editor.remove')"
          :aria-label="t('editor.remove')"
          icon="mdi-close"
          size="small"
          @click="strings = strings.filter((_, position) => position !== index)"
        />
      </template>
    </v-textarea>

    <v-btn
      class="align-self-start"
      prepend-icon="mdi-plus"
      size="small"
      :text="strings.length === 0 ? t('editor.addText') : t('editor.addTranslation')"
      @click="add"
    />

    <div v-for="message in errorMessages ?? []" :key="message" class="text-body-small text-error">{{ message }}</div>
    <div v-if="hint && !errorMessages?.length" class="text-body-small text-medium-emphasis">{{ hint }}</div>
  </div>
</template>

<script lang="ts" setup>
  import type { LangString } from '#shared/contract'
  import { languages } from '~/utils/languages'

  // Language strings (display names, descriptions, multi-language values),
  // oriented at the BaSyx Web UI. A new translation gets the first language
  // that is not used yet, so the common case needs no typing. `maxLength` is
  // the metamodel's limit of the string type (aas-core3.1): 128 for names,
  // 1023 for texts, 255 and 18 for IEC 61360 preferred and short names.
  defineProps<{ label?: string, hint?: string, errorMessages?: string[], maxLength?: number }>()
  const strings = defineModel<LangString[]>({ required: true })

  const { t, locale } = useI18n()

  /** A language's name in the UI language, for any BCP 47 tag; empty for an invalid one. */
  function languageName (code: string): string {
    try {
      return code ? new Intl.DisplayNames([locale.value], { type: 'language' }).of(code) ?? '' : ''
    } catch {
      return ''
    }
  }

  const pickerOpen = ref<boolean[]>([])
  const filter = ref('')
  const filtered = computed(() => {
    const query = filter.value.trim().toLowerCase()
    return languages
      .map(language => ({ code: language.code, name: languageName(language.code) || language.name }))
      .filter(language => !query || language.code.toLowerCase().startsWith(query) || language.name.toLowerCase().includes(query))
  })
  /** A typed tag that is not in the list but is a valid language. */
  const customCode = computed(() => {
    const code = filter.value.trim()
    return code && !languages.some(language => language.code === code) && languageName(code) ? code : null
  })

  function choose (index: number, code: string) {
    if (code) {
      change(index, { language: code })
    }
    pickerOpen.value[index] = false
    filter.value = ''
  }

  function add () {
    const used = new Set(strings.value.map(entry => entry.language))
    const next = languages.find(language => !used.has(language.code))?.code ?? ''
    strings.value = [...strings.value, { language: next, text: '' }]
  }

  function change (index: number, patch: Partial<LangString>) {
    strings.value = strings.value.map((entry, position) => position === index ? { ...entry, ...patch } : entry)
  }
</script>
