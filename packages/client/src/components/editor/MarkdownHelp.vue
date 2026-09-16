<script setup lang="ts">
import { ref } from 'vue';

/**
 * A quick-reference popup for the markdown the article body actually supports
 * (see lib/markdown.ts) — not a general markdown tutorial. Raw HTML is left
 * out on purpose: it is deliberately not supported (`html: false`), so
 * teaching it here would just set authors up to write things that get
 * dropped.
 */
const dialog = ref<HTMLDialogElement | null>(null);

function open() {
  dialog.value?.showModal();
}

/** A click landing on the dialog itself is a click on the backdrop. */
function onClick(event: MouseEvent) {
  if (event.target === dialog.value) dialog.value?.close();
}
</script>

<template>
  <span class="markdown-help">
    <button type="button" class="help-toggle" @click="open">Markdown help</button>

    <dialog ref="dialog" class="dialog" @click="onClick">
      <div class="panel">
        <header>
          <strong>Writing in markdown</strong>
          <button class="close" aria-label="Close" @click="dialog?.close()">×</button>
        </header>

        <table class="cheatsheet">
          <tbody>
            <tr>
              <td><code># Heading</code></td>
              <td>Section heading (<code>#</code> through <code>######</code>)</td>
            </tr>
            <tr>
              <td><code>**bold**</code></td>
              <td><strong>bold</strong></td>
            </tr>
            <tr>
              <td><code>*italic*</code></td>
              <td><em>italic</em></td>
            </tr>
            <tr>
              <td><code>~~struck~~</code></td>
              <td><s>struck</s></td>
            </tr>
            <tr>
              <td><code>- item</code></td>
              <td>Bulleted list (also <code>*</code> or <code>+</code>)</td>
            </tr>
            <tr>
              <td><code>1. item</code></td>
              <td>Numbered list</td>
            </tr>
            <tr>
              <td><code>&gt; text</code></td>
              <td>Blockquote</td>
            </tr>
            <tr>
              <td><code>`code`</code></td>
              <td>Inline code</td>
            </tr>
            <tr>
              <td><code>```</code> … <code>```</code></td>
              <td>Code block</td>
            </tr>
            <tr>
              <td><code>[text](url)</code></td>
              <td>Link — bare URLs are also linked automatically</td>
            </tr>
            <tr>
              <td><code>![alt](url)</code></td>
              <td>Image</td>
            </tr>
            <tr>
              <td><code>---</code></td>
              <td>Horizontal rule</td>
            </tr>
            <tr>
              <td><code>| a | b |</code></td>
              <td>Table (GitHub-style)</td>
            </tr>
            <tr>
              <td><code>[[library:12]]</code></td>
              <td>Embed item 12 from the article library, inline</td>
            </tr>
          </tbody>
        </table>

        <p class="note">
          Raw HTML is not supported — anything written in angle brackets is shown as plain text
          rather than run.
        </p>
      </div>
    </dialog>
  </span>
</template>

<style scoped>
.help-toggle {
  font-size: 0.85rem;
}
.dialog {
  border: none;
  border-radius: 8px;
  padding: 0;
  width: min(32rem, 94vw);
  max-height: 92vh;
  background: var(--bg);
  color: var(--text);
}
.dialog::backdrop {
  background: rgba(0, 0, 0, 0.6);
}
.panel {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
  max-height: 92vh;
  overflow-y: auto;
  padding: 1rem;
}
header {
  display: flex;
  align-items: center;
  gap: 0.5rem;
}
header strong {
  flex: 1;
}
.close {
  border: none;
  background: none;
  font-size: 1.2rem;
  line-height: 1;
  cursor: pointer;
  color: var(--text-muted);
}
.cheatsheet {
  border-collapse: collapse;
  font-size: 0.85rem;
  width: 100%;
}
.cheatsheet td {
  padding: 0.3rem 0.5rem;
  border-bottom: 1px solid var(--border);
  vertical-align: top;
}
.cheatsheet td:first-child {
  white-space: nowrap;
  color: var(--text-muted);
}
.note {
  font-size: 0.8rem;
  color: var(--text-muted);
  margin: 0;
}
</style>
