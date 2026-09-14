import MarkdownIt from 'markdown-it';

// html:false — article bodies are author-written markdown, and raw HTML in them
// would bypass the sanitizing that imported content goes through.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

/**
 * Outbound links open in a new tab so a reader does not lose their place in the
 * feed. Wikimedia links are intercepted before this matters and shown in a
 * dialog instead — see lib/wikiLinks.ts.
 */
md.renderer.rules.link_open = (tokens, idx, options, _env, self) => {
  const href = String(tokens[idx].attrGet('href') ?? '');
  if (/^https?:/i.test(href)) {
    tokens[idx].attrSet('target', '_blank');
    tokens[idx].attrSet('rel', 'noopener noreferrer');
  }
  return self.renderToken(tokens, idx, options);
};

export function renderMarkdown(text: string): string {
  return md.render(text);
}
