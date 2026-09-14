<script setup lang="ts">
import { ref } from 'vue';
import { UPLOAD_LICENCES, type LibraryItem, type LibraryItemSummary } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';
import LicenseBadge from '../common/LicenseBadge.vue';
import MediaPreview from '../common/MediaPreview.vue';

const emit = defineEmits<{ insert: [libraryItemId: number] }>();

const library = useLibraryStore();
const selected = ref<LibraryItem | null>(null);
const loading = ref(false);
const draftDescription = ref('');
const draftAuthor = ref('');
const draftLicence = ref('');
const savingDescription = ref(false);

/** Your own uploads are yours to credit and licence; imported work is not. */
const isOwnUpload = (item: LibraryItemSummary) => item.sourceType === 'local_upload';
const licenceIdFor = (name: string | null) =>
  UPLOAD_LICENCES.find((licence) => licence.name === name)?.id ?? '';

async function preview(id: number) {
  if (selected.value?.id === id) {
    selected.value = null;
    return;
  }
  loading.value = true;
  try {
    selected.value = await libraryApi.get(id);
    draftDescription.value = selected.value.description ?? '';
    draftAuthor.value = selected.value.author ?? '';
    draftLicence.value = licenceIdFor(selected.value.licenseName);
  } finally {
    loading.value = false;
  }
}

/** The caption is the author's own, so it is editable for imported items too. */
async function saveDescription(item: LibraryItemSummary) {
  savingDescription.value = true;
  try {
    const updated = await libraryApi.update(item.id, {
      description: draftDescription.value,
      ...(isOwnUpload(item)
        ? { author: draftAuthor.value, ...(draftLicence.value ? { licenceId: draftLicence.value } : {}) }
        : {}),
    });
    const index = library.items.findIndex((item) => item.id === updated.id);
    if (index !== -1) library.items[index] = updated;
    if (selected.value) selected.value = { ...selected.value, ...updated };
  } finally {
    savingDescription.value = false;
  }
}
</script>

<template>
  <p v-if="library.loaded && library.items.length === 0">
    Nothing gathered for this article yet — use the Wiki world, Commons or Local tabs.
  </p>

  <ul class="items">
    <li v-for="item in library.items" :key="item.id">
      <div class="row-wrap">
        <button class="row" @click="preview(item.id)">
          <img v-if="item.mediaKind === 'image' && item.mediaUrl" :src="item.mediaUrl" alt="" class="thumb" />
          <span class="text">
            <span class="title">{{ item.title }}</span>
            <!-- Shown here so a missing description is obvious rather than buried. -->
            <span v-if="item.description" class="description-preview">{{ item.description }}</span>
            <span v-else class="description-missing">{{ $t('credit.addDescription') }}</span>
          </span>
          <span class="meta">
            <span v-if="item.language" class="lang">{{ item.language }}</span>
            <span class="source">{{ item.sourceType }}</span>
          </span>
        </button>
        <button class="insert" title="Embed in the article body" @click="emit('insert', item.id)">
          Insert
        </button>
      </div>

      <div v-if="selected?.id === item.id" class="preview">
        <MediaPreview v-if="item.mediaUrl" :item="item" />

        <label class="description">
          <span>{{ $t('credit.descriptionLabel') }}</span>
          <textarea
            v-model="draftDescription"
            rows="2"
            :placeholder="$t('credit.descriptionPlaceholder')"
          />
        </label>
        <template v-if="isOwnUpload(item)">
          <label class="description">
            <span>Credit</span>
            <input v-model="draftAuthor" placeholder="Photographer / creator" />
          </label>
          <label class="description">
            <span>{{ $t('credit.licence') }}</span>
            <select v-model="draftLicence">
              <option value="">—</option>
              <option v-for="licence in UPLOAD_LICENCES" :key="licence.id" :value="licence.id">
                {{ licence.name }}
              </option>
            </select>
          </label>
        </template>

        <button class="save" :disabled="savingDescription" @click="saveDescription(item)">
          {{ savingDescription ? '…' : $t('credit.save') }}
        </button>

        <LicenseBadge :item="item" />
        <!-- Sanitized server-side on import; see sources/wikipedia/sanitize.ts -->
        <div v-if="selected.snapshotHtml" class="snapshot" v-html="selected.snapshotHtml" />
      </div>
    </li>
  </ul>

  <p v-if="loading">Loading snapshot…</p>
</template>

<style scoped>
.items {
  list-style: none;
  padding: 0;
  margin: 0;
}
.items > li {
  border-bottom: 1px solid var(--border);
}
.row-wrap {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
.insert {
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  flex-shrink: 0;
}
.thumb {
  width: 46px;
  height: 46px;
  object-fit: cover;
  border-radius: 3px;
  flex-shrink: 0;
}
.text {
  display: flex;
  flex-direction: column;
  gap: 0.15rem;
  flex: 1;
  min-width: 0;
}
.description-preview,
.description-missing {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.description-missing {
  font-style: italic;
  opacity: 0.75;
}
.row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 1rem;
  width: 100%;
  padding: 0.6rem 0;
  background: none;
  border: none;
  text-align: left;
  color: inherit;
}
.title {
  font-weight: 500;
}
.meta {
  display: flex;
  gap: 0.5rem;
  align-items: baseline;
  flex-shrink: 0;
}
.source {
  font-size: 0.75rem;
  color: var(--text-muted);
  text-transform: uppercase;
}
.lang {
  font-size: 0.7rem;
  text-transform: uppercase;
  border: 1px solid var(--border);
  border-radius: 3px;
  padding: 0 0.3rem;
  color: var(--text-muted);
}
.preview {
  padding-bottom: 1rem;
}
.description {
  display: block;
  margin: 0.6rem 0 0.4rem;
  font-size: 0.85rem;
}
.description input {
  display: block;
  width: 100%;
  padding: 0.4rem;
  font: inherit;
  margin-top: 0.2rem;
}
.description textarea {
  display: block;
  width: 100%;
  padding: 0.4rem;
  font: inherit;
  margin-top: 0.2rem;
}
.save {
  font-size: 0.8rem;
  padding: 0.2rem 0.6rem;
  margin-bottom: 0.5rem;
}
.snapshot {
  max-height: 24rem;
  overflow-y: auto;
  border: 1px solid var(--border);
  padding: 0.75rem;
  font-size: 0.9rem;
}
/* Imported markup carries no classes of its own, so constrain it here. */
.snapshot :deep(img) {
  max-width: 100%;
  height: auto;
}
.snapshot :deep(table) {
  display: block;
  overflow-x: auto;
  border-collapse: collapse;
}
.snapshot :deep(td),
.snapshot :deep(th) {
  border: 1px solid var(--border);
  padding: 0.25rem 0.4rem;
}
</style>
