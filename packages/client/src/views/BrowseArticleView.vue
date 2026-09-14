<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import { splitArticleBody, type BrowseArticle } from '@wikitail/shared';
import { publicApi } from '../api/public';
import { renderMarkdown } from '../lib/markdown';
import { languageName } from '../lib/languageName';
import { useAuthStore } from '../stores/auth';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import TailItemCard from '../components/browse/TailItemCard.vue';

const props = defineProps<{ project: string; language: string; article: string }>();
const { locale } = useI18n();
const auth = useAuthStore();

const data = ref<BrowseArticle | null>(null);
const notFound = ref(false);

async function load() {
  notFound.value = false;
  try {
    data.value = await publicApi.article(props.project, props.language, props.article);
  } catch {
    notFound.value = true;
  }
}

onMounted(load);
watch(() => [props.project, props.language, props.article], load);

/** The article body, with library embeds separated from the markdown runs. */
const segments = computed(() => {
  if (!data.value) return [];
  return splitArticleBody(data.value.article.bodyMarkdown).map((segment) =>
    segment.type === 'text'
      ? { kind: 'html' as const, html: renderMarkdown(segment.text) }
      : { kind: 'embed' as const, id: segment.libraryItemId },
  );
});

const embedFor = (id: number) => data.value?.embeds.find((item) => item.id === id);

/** Published versions other than the one being read. */
const otherVersions = computed(
  () => data.value?.versions.filter((v) => v.id !== data.value?.article.id) ?? [],
);

/** True when the reader's language has no published version of this article. */
const missingInLocale = computed(
  () =>
    !!data.value &&
    data.value.article.language !== locale.value &&
    !data.value.versions.some((v) => v.language === locale.value),
);

const projectUsesLocale = computed(() => data.value?.project.languages.includes(locale.value));
</script>

<template>
  <div v-if="notFound"><p>404</p></div>

  <div v-else-if="data" class="feed">
    <RouterLink :to="{ name: 'browse-project', params: { project } }" class="back">
      {{ $t('nav.backToProject') }}
    </RouterLink>

    <div class="head">
      <h1>{{ data.article.title }}</h1>
      <LanguageSwitcher :languages="data.project.languages" />
    </div>

    <!-- The reader asked for a language this article does not exist in yet. -->
    <aside v-if="missingInLocale && projectUsesLocale" class="missing">
      <strong>{{ $t('translation.missingTitle') }}</strong>
      <p>{{ $t('translation.missingBody', { language: languageName(locale, locale) }) }}</p>
      <p class="available">
        {{ $t('translation.missingAvailable', { languages: data.versions.map((v) => languageName(v.language, locale)).join(', ') }) }}
      </p>
      <RouterLink
        v-if="auth.user"
        class="cta"
        :to="{ name: 'article-edit', params: { slug: project, id: data.article.id } }"
      >
        {{ $t('translation.startTranslation', { language: languageName(locale, locale) }) }}
      </RouterLink>
    </aside>

    <article class="body">
      <template v-for="(segment, index) in segments" :key="index">
        <!-- Author markdown rendered with html:false — no raw HTML passes through. -->
        <div v-if="segment.kind === 'html'" class="prose" v-html="segment.html" />
        <figure v-else-if="embedFor(segment.id)" class="embed">
          <strong>{{ embedFor(segment.id)!.title }}</strong>
          <span v-if="embedFor(segment.id)!.language" class="lang">
            {{ embedFor(segment.id)!.language }}
          </span>
          <a
            v-if="embedFor(segment.id)!.externalUrl"
            :href="embedFor(segment.id)!.externalUrl!"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ $t('browse.viewSource') }}
          </a>
        </figure>
      </template>
    </article>

    <nav v-if="otherVersions.length" class="versions">
      <RouterLink
        v-for="version in otherVersions"
        :key="version.id"
        :to="{
          name: 'browse-article',
          params: { project, language: version.language, article: version.slug },
        }"
      >
        {{ languageName(version.language, locale) }}: {{ version.title }}
      </RouterLink>
    </nav>

    <section v-if="data.tail.length" class="tail">
      <h2>{{ $t('browse.tailHeading') }}</h2>
      <TailItemCard v-for="entry in data.tail" :key="entry.id" :entry="entry" />
    </section>
  </div>
</template>

<style scoped>
/* Mobile-first: a single readable column that simply gets more margin on wider
   screens, since browsing is expected to happen on a phone. */
.feed {
  max-width: 40rem;
  margin: 0 auto;
}
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
h1 {
  font-size: 1.6rem;
  line-height: 1.25;
}
.missing {
  border: 1px solid #e0c27a;
  background: rgba(224, 194, 122, 0.12);
  border-radius: 8px;
  padding: 0.9rem;
  margin-bottom: 1rem;
}
.missing p {
  margin: 0.4rem 0;
}
.missing .available {
  font-size: 0.85rem;
  color: var(--text-muted);
}
.cta {
  display: inline-block;
  margin-top: 0.3rem;
  font-weight: 600;
}
.body {
  line-height: 1.65;
}
.prose :deep(img) {
  max-width: 100%;
  height: auto;
}
.prose :deep(h1) {
  font-size: 1.4rem;
}
.prose :deep(h2) {
  font-size: 1.2rem;
}
.embed {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-wrap: wrap;
  margin: 1rem 0;
  padding: 0.6rem 0.8rem;
  border-left: 3px solid var(--border);
  background: color-mix(in srgb, var(--text) 4%, transparent);
  font-size: 0.95rem;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
.versions {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  font-size: 0.85rem;
  border-top: 1px solid var(--border);
  padding-top: 0.75rem;
  margin-top: 1.5rem;
}
.tail {
  margin-top: 2rem;
}
.tail h2 {
  font-size: 1.1rem;
}
</style>
