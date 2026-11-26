<script setup lang="ts">
import { computed } from 'vue';
import { useI18n } from 'vue-i18n';
import { BASE_URL } from '../lib/basePath';

const { t, locale } = useI18n();

interface Step {
  id: string;
  /** Paragraphs before the list: `body1…`. */
  bodies?: number;
  /** List items: `item1…`. */
  items?: number;
  ordered?: boolean;
  /** Paragraphs after the list: `after1…`. */
  after?: number;
  note?: boolean;
  /** Screenshot names under `public/help/<locale>/`. */
  images?: string[];
  /** Interpolation values for the step's messages. */
  params?: Record<string, string>;
}

const steps: Step[] = [
  { id: 'home', bodies: 2, note: true, images: ['01-home'] },
  { id: 'project', bodies: 1, note: true, images: ['02-project'] },
  { id: 'editor', bodies: 1, items: 3, after: 2, images: ['03-editor'] },
  { id: 'import', bodies: 1, items: 4, after: 2, images: ['07-commons', '08-wikipedia', '05-library'] },
  {
    id: 'embed',
    bodies: 1,
    items: 3,
    ordered: true,
    images: ['04-drawer'],
    params: { code: '[[library:3]]' },
  },
  { id: 'tail', bodies: 1, items: 4, ordered: true, images: ['06-tail'] },
  { id: 'publish', bodies: 2, images: ['09-publish', '10-article'] },
  { id: 'pdf', bodies: 2 },
  { id: 'delete', bodies: 1, items: 2, after: 1 },
];

const quickRows = ['name', 'create', 'save', 'import', 'embed', 'tail', 'publish', 'pdf'];

// Screenshots exist for the UI locales only; anything else reads the English set.
const imageDir = computed(() => `${BASE_URL}help/${locale.value === 'fi' ? 'fi' : 'en'}/`);

function range(count = 0): number[] {
  return Array.from({ length: count }, (_, i) => i + 1);
}

function text(step: Step, key: string): string {
  return t(`tutorial.${step.id}.${key}`, step.params ?? {});
}
</script>

<template>
  <article class="tutorial">
    <p class="crumb">
      <RouterLink :to="{ name: 'help' }">{{ $t('tutorial.back') }}</RouterLink>
    </p>

    <h1>{{ $t('tutorial.title') }}</h1>
    <p class="lead">{{ $t('tutorial.intro') }}</p>

    <section v-for="(step, index) in steps" :key="step.id">
      <h2>{{ index + 1 }}. {{ text(step, 'title') }}</h2>

      <p v-for="n in range(step.bodies)" :key="`b${n}`">{{ text(step, `body${n}`) }}</p>

      <component :is="step.ordered ? 'ol' : 'ul'" v-if="step.items">
        <li v-for="n in range(step.items)" :key="`i${n}`">{{ text(step, `item${n}`) }}</li>
      </component>

      <p v-for="n in range(step.after)" :key="`a${n}`">{{ text(step, `after${n}`) }}</p>

      <p v-if="step.note" class="note">{{ text(step, 'note') }}</p>

      <img
        v-for="image in step.images"
        :key="image"
        :src="`${imageDir}${image}.png`"
        :alt="text(step, 'title')"
        loading="lazy"
      />
    </section>

    <section>
      <h2>{{ $t('tutorial.quickHeading') }}</h2>
      <table>
        <thead>
          <tr>
            <th>{{ $t('tutorial.quickWant') }}</th>
            <th>{{ $t('tutorial.quickHow') }}</th>
          </tr>
        </thead>
        <tbody>
          <tr v-for="row in quickRows" :key="row">
            <td>{{ $t(`tutorial.quick.${row}.want`) }}</td>
            <td>{{ $t(`tutorial.quick.${row}.how`) }}</td>
          </tr>
        </tbody>
      </table>
    </section>
  </article>
</template>

<style scoped>
.tutorial {
  line-height: 1.6;
  max-width: 52rem;
}
.crumb {
  font-size: 0.85rem;
  margin-bottom: 1rem;
}
.tutorial h1 {
  margin-bottom: 1rem;
}
.tutorial h2 {
  margin-top: 2.25rem;
  font-size: 1.15rem;
}
.lead {
  color: var(--text-muted);
}
.tutorial ul,
.tutorial ol {
  padding-left: 1.25rem;
}
.tutorial li {
  margin: 0.35rem 0;
}
.note {
  border-left: 3px solid var(--border);
  padding-left: 0.75rem;
  color: var(--text-muted);
}
img {
  display: block;
  max-width: 100%;
  margin: 1rem 0;
  border: 1px solid var(--border);
  border-radius: 4px;
}
table {
  border-collapse: collapse;
  width: 100%;
}
th,
td {
  text-align: left;
  padding: 0.4rem 0.6rem;
  border-bottom: 1px solid var(--border);
}
</style>
