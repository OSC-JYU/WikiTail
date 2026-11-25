import { db } from '../../db/connection.js';
import type { Article, ArticleStatus, ArticleVersion, TranslationGroup } from '@wikitail/shared';

interface ArticleRow {
  id: number;
  project_id: number;
  slug: string;
  title: string;
  language: string;
  translation_group_id: number;
  body_markdown: string;
  status: ArticleStatus;
  license_id: string;
  created_by: number;
  created_at: string;
  updated_at: string;
}

function toArticle(row: ArticleRow): Article {
  return {
    id: row.id,
    projectId: row.project_id,
    slug: row.slug,
    title: row.title,
    language: row.language,
    translationGroupId: row.translation_group_id,
    bodyMarkdown: row.body_markdown,
    status: row.status,
    licenseId: row.license_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const listByProjectStmt = db.prepare('SELECT * FROM articles WHERE project_id = ? ORDER BY created_at DESC');
const findByIdStmt = db.prepare('SELECT * FROM articles WHERE id = ?');
const findBySlugStmt = db.prepare(
  'SELECT * FROM articles WHERE project_id = ? AND language = ? AND slug = ?',
);
const findInGroupStmt = db.prepare(
  'SELECT * FROM articles WHERE translation_group_id = ? AND language = ?',
);
const listVersionsStmt = db.prepare(
  'SELECT id, language, slug, title, status FROM articles WHERE translation_group_id = ? ORDER BY language',
);
const insertStmt = db.prepare(`
  INSERT INTO articles (project_id, slug, title, language, translation_group_id, body_markdown, license_id, created_by)
  VALUES (@projectId, @slug, @title, @language, @translationGroupId, @bodyMarkdown, @licenseId, @createdBy)
`);
const insertGroupStmt = db.prepare('INSERT INTO translation_groups (project_id) VALUES (?)');
const findGroupStmt = db.prepare('SELECT * FROM translation_groups WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM articles WHERE id = ?');
const deleteGroupStmt = db.prepare('DELETE FROM translation_groups WHERE id = ?');
const isOwnerInGroupStmt = db.prepare(
  'SELECT 1 FROM articles WHERE translation_group_id = ? AND created_by = ? LIMIT 1',
);
const updateStmt = db.prepare(`
  UPDATE articles
  SET title = @title, body_markdown = @bodyMarkdown, status = @status, updated_at = datetime('now')
  WHERE id = @id
`);

export const articlesRepository = {
  listByProject(projectId: number): Article[] {
    return (listByProjectStmt.all(projectId) as ArticleRow[]).map(toArticle);
  },

  findById(id: number): Article | undefined {
    const row = findByIdStmt.get(id) as ArticleRow | undefined;
    return row ? toArticle(row) : undefined;
  },

  findBySlug(projectId: number, language: string, slug: string): Article | undefined {
    const row = findBySlugStmt.get(projectId, language, slug) as ArticleRow | undefined;
    return row ? toArticle(row) : undefined;
  },

  findInGroup(translationGroupId: number, language: string): Article | undefined {
    const row = findInGroupStmt.get(translationGroupId, language) as ArticleRow | undefined;
    return row ? toArticle(row) : undefined;
  },

  listVersions(translationGroupId: number): ArticleVersion[] {
    return listVersionsStmt.all(translationGroupId) as ArticleVersion[];
  },

  findGroup(id: number): TranslationGroup | undefined {
    const row = findGroupStmt.get(id) as { id: number; project_id: number } | undefined;
    return row ? { id: row.id, projectId: row.project_id } : undefined;
  },

  isOwnerInGroup(translationGroupId: number, userId: number): boolean {
    return isOwnerInGroupStmt.get(translationGroupId, userId) !== undefined;
  },

  /** Creates an article, opening a new translation group unless joining one. */
  create(input: {
    projectId: number;
    slug: string;
    title: string;
    language: string;
    translationGroupId?: number;
    bodyMarkdown: string;
    licenseId: string;
    createdBy: number;
  }): Article {
    const create = db.transaction(() => {
      const translationGroupId =
        input.translationGroupId ??
        Number(insertGroupStmt.run(input.projectId).lastInsertRowid);
      const info = insertStmt.run({ ...input, translationGroupId });
      return Number(info.lastInsertRowid);
    });
    return this.findById(create())!;
  },

  update(id: number, input: { title: string; bodyMarkdown: string; status: ArticleStatus }): Article {
    updateStmt.run({ id, ...input });
    return this.findById(id)!;
  },

  /** Callers must clear rows that reference the article first (tail entries, main-article pointer). */
  remove(id: number): void {
    deleteStmt.run(id);
  },

  removeGroup(id: number): void {
    deleteGroupStmt.run(id);
  },
};
