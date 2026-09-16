<script setup lang="ts">
import { ref } from 'vue';
import { useI18n } from 'vue-i18n';
import { UPLOAD_LICENCES, type LibraryItem, type LibraryItemSummary } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';
import { commonsEmbedFor } from '../../lib/commonsEmbed';
import { withBase } from '../../lib/basePath';
import ItemDialog from '../common/ItemDialog.vue';
import LicenseBadge from '../common/LicenseBadge.vue';
import MediaPreview from '../common/MediaPreview.vue';

const emit = defineEmits<{ insert: [libraryItemId: number] }>();

const library = useLibraryStore();
const { t } = useI18n();
const selected = ref<LibraryItem | null>(null);
const loading = ref(false);
const viewing = ref<LibraryItemSummary | null>(null);
const draftDescription = ref('');
const draftAuthor = ref('');
const draftLicence = ref('');
const savingDescription = ref(false);
/**
 * Per-item error state — a failed remove needs to be shown next to the item
 * that failed, not as a page-level banner. Cleared when the item is next
 * previewed so a stale "still in use" doesn't hang around after the reader has
 * unpicked the references.
 */
const removingId = ref<number | null>(null);
const removeError = ref<{ id: number; message: string } | null>(null);

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
  if (removeError.value?.id === id) removeError.value = null;
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

/**
 * Confirm-then-delete. The confirm dialog exists because removing an item is
 * irreversible: for uploads the file itself goes away, and for imports the
 * caption someone wrote does. The server will refuse if the item is still
 * embedded in a tail or an article body, and its message is shown verbatim
 * so the reader knows where to go.
 */
async function remove(item: LibraryItemSummary) {
  if (!window.confirm(t('library.confirmRemove', { title: item.title }))) return;
  removingId.value = item.id;
  removeError.value = null;
  try {
    await library.removeItem(item.id);
    if (selected.value?.id === item.id) selected.value = null;
  } catch (e) {
    removeError.value = {
      id: item.id,
      message: e instanceof Error ? e.message : t('library.removeFailed'),
    };
  } finally {
    removingId.value = null;
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
          <img v-if="item.mediaKind === 'image' && item.mediaUrl" :src="withBase(item.mediaUrl)" alt="" class="thumb" />
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
        <button
          class="remove"
          :title="$t('library.removeTitle')"
          :disabled="removingId === item.id"
          @click="remove(item)"
        >
          {{ removingId === item.id ? '…' : $t('library.remove') }}
        </button>
      </div>

      <p v-if="removeError?.id === item.id" class="remove-error" role="alert">
        {{ $t('library.removeFailed') }} {{ removeError.message }}
      </p>

      <div v-if="selected?.id === item.id" class="preview">
        <button class="media-button" @click="viewing = item">
          <MediaPreview v-if="item.mediaUrl" :item="item" />
          <span v-else-if="!commonsEmbedFor(item)" class="view-stored">{{ $t('browse.showSnapshot') }}</span>
        </button>
        <!--
          Commons audio and video in live-link projects render outside the
          button: the iframe swallows clicks, so wrapping it would just make
          the thin margin around it act as the trigger. The button above still
          opens the dialog when it has room to render its label.
        -->
        <MediaPreview v-if="commonsEmbedFor(item)" :item="item" />

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
      </div>
    </li>
  </ul>

  <p v-if="loading">Loading snapshot…</p>

  <ItemDialog :item="viewing" @close="viewing = null" />
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
.remove {
  font-size: 0.8rem;
  padding: 0.2rem 0.5rem;
  flex-shrink: 0;
  background: none;
  border: 1px solid var(--border);
  color: var(--text-muted);
  cursor: pointer;
}
.remove:hover:not(:disabled) {
  color: #b00020;
  border-color: #b00020;
}
.remove:disabled {
  opacity: 0.6;
  cursor: default;
}
.remove-error {
  margin: 0.2rem 0 0.5rem;
  font-size: 0.8rem;
  color: #b00020;
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
.media-button {
  display: block;
  width: 100%;
  padding: 0;
  border: none;
  background: none;
  text-align: left;
  cursor: zoom-in;
}
.view-stored {
  display: inline-block;
  font-size: 0.85rem;
  color: var(--text-muted);
  text-decoration: underline;
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
</style>
