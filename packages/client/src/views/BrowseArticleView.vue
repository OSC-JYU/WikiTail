<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue';
import { useI18n } from 'vue-i18n';
import {
  splitArticleBody,
  findLicence,
  type BrowseArticle,
  type LibraryItemSummary,
} from '@wikitail/shared';
import { publicApi } from '../api/public';
import { renderMarkdown } from '../lib/markdown';
import { framableWikiUrl, wikiPageTitle } from '../lib/wikiLinks';
import { languageName } from '../lib/languageName';
import { commonsEmbedFor } from '../lib/commonsEmbed';
import { useProjectStyle } from '../lib/projectStyle';
import { useAuthStore } from '../stores/auth';
import LanguageSwitcher from '../components/common/LanguageSwitcher.vue';
import TailItemCard from '../components/browse/TailItemCard.vue';
import MediaPreview from '../components/common/MediaPreview.vue';
import LicenseBadge from '../components/common/LicenseBadge.vue';
import ItemDialog from '../components/common/ItemDialog.vue';

const props = defineProps<{ project: string; language: string; article: string }>();
const { locale } = useI18n();
const auth = useAuthStore();

const data = ref<BrowseArticle | null>(null);
const notFound = ref(false);
const viewing = ref<LibraryItemSummary | null>(null);
const viewingPage = ref<{ title: string; url: string } | null>(null);

useProjectStyle(computed(() => data.value?.project));

/**
 * A Wikipedia link in the article text opens in place rather than in a new tab:
 * on a phone especially, a new tab loses the reader's position in the feed and
 * getting back is fiddly. Only links we can actually frame are intercepted —
 * anything else follows its normal behaviour.
 */
function onBodyClick(event: MouseEvent) {
  // Leave modified clicks alone: the reader has asked for a tab or a window.
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

  const link = (event.target as HTMLElement).closest('a');
  const href = link?.getAttribute('href');
  if (!href) return;

  const framable = framableWikiUrl(href);
  if (!framable) return;

  event.preventDefault();
  viewingPage.value = { title: wikiPageTitle(href), url: framable };
}

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
      : { kind: 'embed' as const, id: segment.libraryItemId, label: segment.label },
  );
});

const embedFor = (id: number) => data.value?.embeds.find((item) => item.id === id);

/**
 * Wikipedia (and Wikidata) pages have no individual author and share one
 * project-wide licence, so citing them inline the same way as a Commons photo
 * would be noise. They read better as a plain linked page name.
 */
const isWikimediaSource = (item: LibraryItemSummary) =>
  item.sourceType === 'wikipedia' || item.sourceType === 'wikidata';

/**
 * True when the item has something to render inline — either a local media file
 * or a Commons audio/video embed. Used to decide whether to draw the media
 * button in the article body.
 */
const hasInlineMedia = (item: LibraryItemSummary) =>
  Boolean(item.mediaUrl || commonsEmbedFor(item));

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

const articleLicence = computed(() =>
  data.value ? findLicence(data.value.article.licenseId) : undefined,
);
</script>

<template>
  <div v-if="notFound"><p>404</p></div>

  <div v-else-if="data" class="feed" :data-project-style="data.project.styleId">
    <nav class="crumbs">
      <RouterLink :to="{ name: 'browse-project', params: { project } }" class="back">
        {{ $t('nav.backToProject') }}
      </RouterLink>
      <!-- Signed-in authors get straight back to the editor for what they are reading. -->
      <RouterLink
        v-if="auth.user"
        class="edit-link"
        :to="{ name: 'article-edit', params: { slug: project, id: data.article.id } }"
      >
        {{ $t('nav.edit') }} &rarr;
      </RouterLink>
    </nav>

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

    <article class="body" @click="onBodyClick">
      <template v-for="(segment, index) in segments" :key="index">
        <!-- Author markdown rendered with html:false — no raw HTML passes through. -->
        <div v-if="segment.kind === 'html'" class="prose" v-html="segment.html" />
        <figure v-else-if="embedFor(segment.id)" class="embed">
          <button
            v-if="embedFor(segment.id)!.mediaUrl"
            class="media-button"
            @click="viewing = embedFor(segment.id)!"
          >
            <MediaPreview :item="embedFor(segment.id)!" />
          </button>
          <!--
            Commons audio and video render as an embedded Commons player, which
            is an iframe and swallows clicks. Rendered without the button
            wrapper — the label below opens the dialog when the reader wants a
            larger view.
          -->
          <MediaPreview
            v-else-if="hasInlineMedia(embedFor(segment.id)!)"
            :item="embedFor(segment.id)!"
          />
          <figcaption v-if="embedFor(segment.id)!.description" class="caption">
            {{ embedFor(segment.id)!.description }}
          </figcaption>
          <!--
            Wikipedia and Wikidata pages have no individual author to credit and
            share one project-wide licence, so they get a plain link on the name.
            `onBodyClick` above intercepts Wikimedia hrefs and opens them framed
            in place, so the reader still stays on the page.
          -->
          <a
            v-if="isWikimediaSource(embedFor(segment.id)!) && embedFor(segment.id)!.externalUrl"
            class="label-link"
            :href="embedFor(segment.id)!.externalUrl!"
            target="_blank"
            rel="noopener noreferrer"
          >
            {{ segment.label ?? embedFor(segment.id)!.title }}
          </a>
          <!--
            Everything else (Commons media, Finna records, uploads) has a real
            author and licence. The label opens the item dialog; LicenseBadge
            handles the credit line.
          -->
          <template v-else>
            <button class="label-button" @click="viewing = embedFor(segment.id)!">
              {{ segment.label ?? embedFor(segment.id)!.title }}
            </button>
            <span v-if="embedFor(segment.id)!.language" class="lang">
              {{ embedFor(segment.id)!.language }}
            </span>
            <LicenseBadge :item="embedFor(segment.id)!" />
          </template>
        </figure>
        <p v-else-if="segment.label" class="missing-embed">{{ segment.label }}</p>
      </template>
    </article>

    <p v-if="articleLicence" class="article-licence">
      {{ $t('browse.articleLicence') }}
      <a v-if="articleLicence.url" :href="articleLicence.url" target="_blank" rel="noopener noreferrer">
        {{ articleLicence.name }}
      </a>
      <span v-else>{{ articleLicence.name }}</span>
    </p>

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
      <TailItemCard
        v-for="entry in data.tail"
        :key="entry.id"
        :entry="entry"
        @view="viewing = $event"
      />
    </section>

    <ItemDialog :item="viewing" source="public" @close="viewing = null" />
    <ItemDialog :page="viewingPage" @close="viewingPage = null" />
  </div>
</template>

<style scoped>
/* Mobile-first: a single readable column that simply gets more margin on wider
   screens, since browsing is expected to happen on a phone. */
.feed {
  max-width: 40rem;
  margin: 0 auto;
}
.crumbs {
  display: flex;
  align-items: baseline;
  gap: 1rem;
  flex-wrap: wrap;
}
.back,
.edit-link {
  font-size: 0.85rem;
}
.edit-link {
  font-weight: 600;
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
  background: var(--surface, color-mix(in srgb, var(--text) 3%, transparent));
  border: 1px solid var(--border);
  border-radius: 10px;
  padding: 1rem 1.1rem;
  margin: 1rem 0 0.5rem;
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
  background: color-mix(in srgb, var(--text) 5%, transparent);
  border-radius: 0 6px 6px 0;
  font-size: 0.95rem;
}
.missing-embed {
  color: var(--text-muted);
  font-size: 0.9rem;
}
.media-button {
  flex-basis: 100%;
  padding: 0;
  border: none;
  background: none;
  cursor: zoom-in;
}
/*
 * Author's link label. Presented as an inline text link — it reads as the
 * caption of the embed, not a big button.
 */
.label-button {
  padding: 0;
  border: none;
  background: none;
  color: inherit;
  font: inherit;
  font-weight: 600;
  text-decoration: underline;
  cursor: pointer;
  text-align: left;
}
.label-button:hover {
  color: var(--link, inherit);
}
/*
 * Wikimedia embed name — same visual weight as `.label-button` but a normal
 * anchor, since there is no dialog to open and the reader wants the page.
 */
.label-link {
  font-weight: 600;
  text-decoration: underline;
}
.embed :deep(.license) {
  flex-basis: 100%;
  margin-top: 0.3rem;
}
.caption {
  flex-basis: 100%;
  font-size: 0.9rem;
  color: var(--text-muted);
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
.article-licence {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin-top: 1rem;
}
.article-licence a {
  color: inherit;
}
/*
 * Tail sits after the article as a related-material section. A heavier top
 * rule and a small-caps heading mark the seam so a reader can see where the
 * article ends and the sources begin.
 */
.tail {
  margin-top: 2.5rem;
  padding-top: 1.5rem;
  border-top: 2px solid var(--border);
}
.tail h2 {
  font-size: 0.85rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--text-muted);
  margin: 0 0 1rem;
}
</style>
