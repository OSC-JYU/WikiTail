import { describe, expect, it } from 'vitest';
import { buildCredit, isReusable } from './adapter.js';

describe('isReusable', () => {
  // Copying means re-hosting someone else's file, so the bar is "the licence
  // plainly allows redistribution", not "the licence looks free-ish".
  it('allows licences that permit redistribution outright', () => {
    for (const licence of ['CC0 1.0', 'PDM', 'CC BY 4.0', 'CC BY-SA 4.0']) {
      expect(isReusable(licence)).toBe(true);
    }
  });

  // ND permits verbatim redistribution for any purpose; Finna's rendering is
  // stored unaltered, so it qualifies.
  it('allows NoDerivatives, which still permits verbatim copies', () => {
    expect(isReusable('CC BY-ND 4.0')).toBe(true);
  });

  it('refuses NonCommercial unless the operator has said the site is non-commercial', () => {
    expect(isReusable('CC BY-NC 4.0')).toBe(false);
    expect(isReusable('CC BY-NC-ND 4.0')).toBe(false);
    expect(isReusable('CC BY-NC 4.0', true)).toBe(true);
    expect(isReusable('CC BY-NC-ND 4.0', true)).toBe(true);
  });

  it('refuses restricted and unevaluated material', () => {
    // InC = in copyright, CNE = copyright not evaluated. Neither grants anything.
    for (const licence of ['InC', 'CNE', 'InC-EDU', undefined, '']) {
      expect(isReusable(licence)).toBe(false);
    }
  });
});

describe('buildCredit', () => {
  // Finna's terms ask for the creator and the holding organisation, not one or
  // the other — a museum's collection is part of the credit.
  it('names the creator and the institution', () => {
    const credit = buildCredit({
      id: 'museovirasto.ABC',
      title: 'Jyväskylä',
      nonPresenterAuthors: [{ name: 'Bonin, Volker von', role: 'kuvaaja' }],
      institutions: [{ value: 'Museovirasto', translated: 'Museovirasto' }],
      imageRights: { copyright: 'CC BY 4.0' },
    });
    expect(credit.author).toBe('Bonin, Volker von');
    expect(credit.attribution).toBe(
      '"Jyväskylä" by Bonin, Volker von — Museovirasto, CC BY 4.0. Via Finna.',
    );
  });

  it('joins multiple creators once each', () => {
    const credit = buildCredit({
      id: 'x',
      title: 'Kuva',
      nonPresenterAuthors: [{ name: 'Laurell' }, { name: 'X. A.' }, { name: 'Laurell' }],
    });
    expect(credit.author).toBe('Laurell, X. A.');
  });

  it('still reads properly when a record names nobody', () => {
    const credit = buildCredit({ id: 'x', title: 'Kuva', institutions: [{ translated: 'Elka' }] });
    expect(credit.author).toBeUndefined();
    expect(credit.attribution).toBe('"Kuva" — Elka. Via Finna.');
  });
});
