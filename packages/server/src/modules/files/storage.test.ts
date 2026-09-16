import { describe, expect, it } from 'vitest';
import { kindFor, mediaUrl } from './storage.js';

describe('kindFor', () => {
  it('groups media by what it can be rendered with', () => {
    expect(kindFor('image/jpeg')).toBe('image');
    expect(kindFor('image/svg+xml')).toBe('image');
    expect(kindFor('audio/ogg')).toBe('audio');
    expect(kindFor('video/webm')).toBe('video');
  });

  // .ogx is Ogg's generic container (mixed codecs) with no audio/video
  // prefix to sniff, so it is treated as video.
  it('treats the generic Ogg container as video', () => {
    expect(kindFor('application/ogg')).toBe('video');
  });

  it('falls back to "other" for anything it cannot place', () => {
    expect(kindFor('application/pdf')).toBe('other');
    expect(kindFor('application/octet-stream')).toBe('other');
  });
});

describe('mediaUrl', () => {
  it('maps a stored path onto the uploads route', () => {
    expect(mediaUrl('7f/7f1ee46b.jpg')).toBe('/uploads/7f/7f1ee46b.jpg');
  });
});
