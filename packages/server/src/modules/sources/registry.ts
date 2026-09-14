import Boom from '@hapi/boom';
import type { SourceType } from '@wikitail/shared';
import type { SourceAdapter } from './adapter.js';
import { wikipediaAdapter } from './wikipedia/adapter.js';

const adapters = new Map<SourceType, SourceAdapter>([[wikipediaAdapter.key, wikipediaAdapter]]);

export function getAdapter(sourceType: SourceType): SourceAdapter {
  const adapter = adapters.get(sourceType);
  if (!adapter) {
    throw Boom.badRequest(`No adapter for source: ${sourceType}`);
  }
  return adapter;
}
