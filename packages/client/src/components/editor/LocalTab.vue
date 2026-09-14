<script setup lang="ts">
import { ref } from 'vue';
import { DEFAULT_UPLOAD_LICENCE, UPLOAD_LICENCES } from '@wikitail/shared';
import { libraryApi } from '../../api/library';
import { useLibraryStore } from '../../stores/library';
import MediaPreview from '../common/MediaPreview.vue';

/** Your own photos, recordings and video, stored here rather than linked. */
const library = useLibraryStore();

const fileInput = ref<HTMLInputElement | null>(null);
const file = ref<File | null>(null);
const title = ref('');
const description = ref('');
const author = ref('');
const licenceId = ref(DEFAULT_UPLOAD_LICENCE);
const uploading = ref(false);
const error = ref<string | null>(null);

const ACCEPT = 'image/jpeg,image/png,image/gif,image/webp,audio/*,video/mp4,video/webm,application/pdf';

function pick(event: Event) {
  const chosen = (event.target as HTMLInputElement).files?.[0] ?? null;
  file.value = chosen;
  error.value = null;
  // A sensible default the author can overwrite, rather than an empty box.
  if (chosen && !title.value) title.value = chosen.name.replace(/\.[^.]+$/, '');
}

async function upload() {
  if (!file.value) return;
  uploading.value = true;
  error.value = null;
  try {
    const item = await libraryApi.upload(file.value, {
      title: title.value,
      description: description.value,
      author: author.value,
      licenceId: licenceId.value,
    });
    library.items.unshift(item);
    file.value = null;
    title.value = '';
    description.value = '';
    author.value = '';
    licenceId.value = DEFAULT_UPLOAD_LICENCE;
    if (fileInput.value) fileInput.value.value = '';
  } catch (e) {
    error.value = e instanceof Error ? e.message : 'Upload failed';
  } finally {
    uploading.value = false;
  }
}

const uploaded = () => library.items.filter((item) => item.sourceType === 'local_upload');
</script>

<template>
  <form class="upload" @submit.prevent="upload">
    <input ref="fileInput" type="file" :accept="ACCEPT" @change="pick" />
    <input v-model="title" placeholder="Title" />
    <textarea v-model="description" rows="2" :placeholder="$t('credit.descriptionPlaceholder')" />
    <input v-model="author" placeholder="Photographer / creator (defaults to you)" />
    <label class="licence">
      {{ $t('credit.licence') }}
      <select v-model="licenceId">
        <option v-for="licence in UPLOAD_LICENCES" :key="licence.id" :value="licence.id">
          {{ licence.name }}
        </option>
      </select>
    </label>
    <button type="submit" :disabled="!file || uploading">
      {{ uploading ? 'Uploading…' : 'Upload' }}
    </button>
  </form>

  <p v-if="error" class="error">{{ error }}</p>
  <p class="hint">Images, audio, video and PDF. Files are stored here and served from this site.</p>

  <ul class="items">
    <li v-for="item in uploaded()" :key="item.id">
      <MediaPreview :item="item" class="thumb" />
      <div>
        <strong>{{ item.title }}</strong>
        <p v-if="item.description" class="credit">{{ item.description }}</p>
        <p class="credit">
          {{ item.author ? $t('credit.by', { author: item.author }) : '' }}
          <span v-if="item.licenseName">· {{ item.licenseName }}</span>
        </p>
      </div>
    </li>
  </ul>
  <p v-if="uploaded().length === 0" class="hint">Nothing uploaded yet.</p>
</template>

<style scoped>
.upload {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
  max-width: 28rem;
}
.upload input[type='text'],
.upload input:not([type='file']) {
  padding: 0.45rem;
}
.upload textarea {
  padding: 0.45rem;
  font: inherit;
}
.licence {
  display: flex;
  gap: 0.5rem;
  align-items: center;
  font-size: 0.85rem;
  color: var(--text-muted);
}
.upload button {
  align-self: flex-start;
}
.hint {
  font-size: 0.8rem;
  color: var(--text-muted);
}
.items {
  list-style: none;
  padding: 0;
}
.items li {
  display: flex;
  gap: 0.75rem;
  align-items: center;
  padding: 0.6rem 0;
  border-bottom: 1px solid var(--border);
}
.thumb {
  width: 84px;
  flex-shrink: 0;
}
.thumb :deep(img),
.thumb :deep(video) {
  width: 84px;
  height: 84px;
  object-fit: cover;
}
.credit {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0.2rem 0 0;
}
.error {
  color: #c0392b;
}
</style>
