import { type Ref, watchEffect } from 'vue';
import type { Project } from '@wikitail/shared';
import fancyCss from '../styles/project-styles/fancy.css?raw';
import shadesCss from '../styles/project-styles/shades.css?raw';

/**
 * "wikistyle" is the app's own default look, so it has no override CSS of its
 * own — an empty preset. Any id not recognised here (e.g. a project created
 * before this feature, or a stale value) also falls back to nothing rather
 * than breaking the page.
 */
const PRESETS: Record<string, string> = {
  wikistyle: '',
  fancy: fancyCss,
  shades: shadesCss,
};

/**
 * Applies a project's chosen style preset, plus any manager-authored custom
 * CSS layered on top, for as long as the calling view is mounted. Injected as
 * a single <style> tag in <head> and swapped out whenever the project (or its
 * style) changes, so switching between projects never leaves a stale style
 * bleeding into the next page.
 *
 * Callers must also put a `data-project-style` attribute on the element
 * wrapping the content this should apply to — the preset CSS is scoped under
 * that selector so it can't leak into the editor or admin screens.
 */
export function useProjectStyle(project: Ref<Project | null | undefined>): void {
  watchEffect((onCleanup) => {
    const p = project.value;
    if (!p) return;
    const preset = PRESETS[p.styleId] ?? '';
    const css = [preset, p.customCss].filter(Boolean).join('\n\n');
    if (!css) return;

    const tag = document.createElement('style');
    tag.setAttribute('data-project-style-preset', p.styleId);
    tag.textContent = css;
    document.head.appendChild(tag);
    onCleanup(() => tag.remove());
  });
}
