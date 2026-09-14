import MarkdownIt from 'markdown-it';

// html:false — article bodies are author-written markdown, and raw HTML in them
// would bypass the sanitizing that imported content goes through.
const md = new MarkdownIt({ html: false, linkify: true, breaks: false });

export function renderMarkdown(text: string): string {
  return md.render(text);
}
