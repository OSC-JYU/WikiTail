import { describe, expect, it } from 'vitest';
import { buildAttribution, toPlainText } from './adapter.js';

describe('toPlainText', () => {
  // Commons extmetadata arrives as HTML fragments — the artist field is usually a
  // link — and these values end up in attribution lines, so they must be text.
  it('strips the markup Commons wraps around metadata', () => {
    expect(
      toPlainText('<a href="//commons.wikimedia.org/wiki/User:Syced" title="User:Syced">Syced</a>'),
    ).toBe('Syced');
  });

  it('drops anything executable rather than passing it through', () => {
    expect(toPlainText('<script>alert(1)</script>Tiia Monto')).toBe('Tiia Monto');
    expect(toPlainText('<img src=x onerror="alert(1)">Name')).toBe('Name');
  });

  it('treats empty or missing values as absent', () => {
    expect(toPlainText(undefined)).toBeUndefined();
    expect(toPlainText('')).toBeUndefined();
    expect(toPlainText('  <span> </span> ')).toBeUndefined();
  });
});

describe('buildAttribution', () => {
  it('names the file, its author and its licence', () => {
    expect(buildAttribution('File:Watermill 4.jpg', 'Syced', 'CC0')).toBe(
      '"Watermill 4.jpg" by Syced, licensed under CC0. Via Wikimedia Commons.',
    );
  });

  // Commons files vary: some have no stated author, some no machine-readable
  // licence. The line still has to read properly.
  it('omits parts that are missing', () => {
    expect(buildAttribution('File:Stone.jpg', undefined, 'CC BY-SA 3.0')).toBe(
      '"Stone.jpg", licensed under CC BY-SA 3.0. Via Wikimedia Commons.',
    );
    expect(buildAttribution('File:Stone.jpg', 'Someone', undefined)).toBe(
      '"Stone.jpg" by Someone. Via Wikimedia Commons.',
    );
    expect(buildAttribution('File:Stone.jpg')).toBe('"Stone.jpg". Via Wikimedia Commons.');
  });
});
