<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import type { BrowseListing, Project } from '@wikitail/shared';
import { publicApi } from '../api/public';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import { languageName } from '../lib/languageName';

const props = defineProps<{ project: string }>();
const { locale } = useI18n();

const project = ref<Project | null>(null);
const listings = ref<BrowseListing[]>([]);
const loaded = ref(false);

/**
 * The reader's interface language selects content, but a project need not use it —
 * fall back to the project's primary language rather than showing nothing.
 */
const contentLanguage = computed(() =>
  project.value?.languages.includes(locale.value)
    ? locale.value
    : (project.value?.languages[0] ?? 'en'),
);

async function load() {
  project.value = await publicApi.project(props.project);
  listings.value = await publicApi.content(props.project, contentLanguage.value);
  loaded.value = true;
}

onMounted(load);
watch(locale, load);
</script>

<template>
  <div v-if="project">
    <RouterLink to="/" class="back">{{ $t('nav.backToProjects') }}</RouterLink>

    <div class="head">
      <h1>{{ project.title }}</h1>
      <LanguageSwitcher :languages="project.languages" />
    </div>
    <p v-if="project.description" class="desc">{{ project.description }}</p>

    <ul class="articles">
      <li v-for="listing in listings" :key="listing.translationGroupId">
        <RouterLink
          v-if="listing.article"
          :to="{
            name: 'browse-article',
            params: {
              project: project.slug,
              language: listing.article.language,
              article: listing.article.slug,
            },
          }"
        >
          <strong>{{ listing.article.title }}</strong>
        </RouterLink>
        <!-- No version in this language: keep the entry visible so the gap is
             discoverable rather than the article silently disappearing. -->
        <span v-else class="unavailable">
          {{ $t('browse.onlyIn', { languages: listing.availableLanguages.map((l) => languageName(l, locale)).join(', ') }) }}
        </span>
      </li>
    </ul>

    <p v-if="loaded && listings.length === 0">{{ $t('browse.noPublished') }}</p>
  </div>
</template>

<style scoped>
.back {
  font-size: 0.85rem;
}
.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  flex-wrap: wrap;
}
.desc {
  color: var(--text-muted);
}
.articles {
  list-style: none;
  padding: 0;
}
.articles li {
  border-bottom: 1px solid var(--border);
}
.articles a,
.unavailable {
  display: flex;
  flex-direction: column;
  gap: 0.2rem;
  padding: 0.9rem 0;
  text-decoration: none;
  color: inherit;
}
.note,
.unavailable {
  font-size: 0.8rem;
  color: var(--text-muted);
}
</style>
