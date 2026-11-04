import type { Plugin, Server } from '@hapi/hapi';
import type { User } from '@wikitail/shared';
import { getArticle } from '../public/service.js';
import { renderArticlePdf } from './article-pdf.js';

/** Header values must be latin-1, so non-ASCII names go in the RFC 5987 `filename*` form. */
function contentDisposition(title: string): string {
  const base = title.replace(/[\\/:*?"<>|\r\n]+/g, ' ').replace(/\s+/g, ' ').trim() || 'article';
  const ascii = base.replace(/[^\x20-\x7e]/g, '_').replace(/%/g, '_');
  return `attachment; filename="${ascii}.pdf"; filename*=UTF-8''${encodeURIComponent(base)}.pdf`;
}

export const exportRoutesPlugin: Plugin<undefined> = {
  name: 'wikitail-export-routes',
  register(server: Server) {
    // Unlike the rest of the public site this needs a session: the PDF is stamped
    // with the email of whoever asked for it. Only published articles can be
    // exported — getArticle hides drafts the same way the public reader does.
    server.route({
      method: 'GET',
      path: '/api/export/{projectSlug}/{language}/{articleSlug}/pdf',
      handler: async (request, h) => {
        const user = request.auth.credentials as unknown as User;
        const data = getArticle(
          request.params.projectSlug as string,
          request.params.language as string,
          request.params.articleSlug as string,
        );
        const pdf = await renderArticlePdf(data, { email: user.email, generatedAt: new Date() });

        return h
          .response(pdf)
          .type('application/pdf')
          .header('Content-Disposition', contentDisposition(data.article.title))
          .header('Cache-Control', 'private, no-store');
      },
    });
  },
};
