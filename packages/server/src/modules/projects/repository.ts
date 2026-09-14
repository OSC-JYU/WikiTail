import { db } from '../../db/connection.js';
import type { Project } from '@wikitail/shared';

interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  main_article_id: number | null;
  created_by: number;
  created_at: string;
}

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    mainArticleId: row.main_article_id,
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const listStmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
const findBySlugStmt = db.prepare('SELECT * FROM projects WHERE slug = ?');
const findByIdStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
const insertStmt = db.prepare(
  'INSERT INTO projects (slug, title, description, created_by) VALUES (@slug, @title, @description, @createdBy)',
);
const setMainArticleStmt = db.prepare('UPDATE projects SET main_article_id = ? WHERE id = ?');

export const projectsRepository = {
  list(): Project[] {
    return (listStmt.all() as ProjectRow[]).map(toProject);
  },

  findBySlug(slug: string): Project | undefined {
    const row = findBySlugStmt.get(slug) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  findById(id: number): Project | undefined {
    const row = findByIdStmt.get(id) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  create(input: { slug: string; title: string; description: string | null; createdBy: number }): Project {
    const info = insertStmt.run(input);
    return this.findById(Number(info.lastInsertRowid))!;
  },

  setMainArticle(id: number, articleId: number): Project {
    setMainArticleStmt.run(articleId, id);
    return this.findById(id)!;
  },
};
