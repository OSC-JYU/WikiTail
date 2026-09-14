import { db } from '../../db/connection.js';
import type { Article, ArticleStatus } from '@wikitail/shared';

interface ArticleRow {
  id: number;
  project_id: number;
  slug: string;
  title: string;
  body_markdown: string;
  status: ArticleStatus;
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
    bodyMarkdown: row.body_markdown,
    status: row.status,
    createdBy: row.created_by,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

const listByProjectStmt = db.prepare('SELECT * FROM articles WHERE project_id = ? ORDER BY created_at DESC');
const findByIdStmt = db.prepare('SELECT * FROM articles WHERE id = ?');
const findBySlugStmt = db.prepare('SELECT * FROM articles WHERE project_id = ? AND slug = ?');
const insertStmt = db.prepare(`
  INSERT INTO articles (project_id, slug, title, body_markdown, created_by)
  VALUES (@projectId, @slug, @title, @bodyMarkdown, @createdBy)
`);
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

  findBySlug(projectId: number, slug: string): Article | undefined {
    const row = findBySlugStmt.get(projectId, slug) as ArticleRow | undefined;
    return row ? toArticle(row) : undefined;
  },

  create(input: {
    projectId: number;
    slug: string;
    title: string;
    bodyMarkdown: string;
    createdBy: number;
  }): Article {
    const info = insertStmt.run(input);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  update(id: number, input: { title: string; bodyMarkdown: string; status: ArticleStatus }): Article {
    updateStmt.run({ id, ...input });
    return this.findById(id)!;
  },
};
