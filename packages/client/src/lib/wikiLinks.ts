/**
 * Which outbound links can be opened in a dialog rather than a new tab.
 *
 * Only Wikimedia sites qualify: they send no `X-Frame-Options` and no
 * `frame-ancestors`, so they actually render in a frame. Most sites refuse to be
 * framed and would show the reader a blank box, which is worse than the new tab
 * it replaced — so everything else keeps normal link behaviour.
 *
 * No mobile host is substituted. `xx.m.wikipedia.org` now redirects to the main
 * domain for every user agent — Wikimedia serves one responsive rendering — so
 * rewriting the host would only add a redirect on the slow connections it was
 * meant to help.
 */
const WIKI_HOST = /^([a-z-]+)\.(m\.)?(wikipedia|wiktionary|wikisource|wikibooks)\.org$/;

export function framableWikiUrl(href: string): string | null {
  let url: URL;
  try {
    // Absolute only: a relative link is internal and has no business being framed.
    url = new URL(href);
  } catch {
    return null;
  }

  if (url.protocol !== 'https:') return null;
  return WIKI_HOST.test(url.hostname) ? url.toString() : null;
}

/** A readable name for the dialog title, e.g. "Matti Nykänen". */
export function wikiPageTitle(href: string): string {
  try {
    const path = decodeURIComponent(new URL(href).pathname);
    return path.replace(/^\/wiki\//, '').replace(/_/g, ' ') || href;
  } catch {
    return href;
  }
}
