import { db } from '../../db/connection.js';
import type { Project, ProjectMemberRole, SnapshotMode } from '@wikitail/shared';

interface ProjectRow {
  id: number;
  slug: string;
  title: string;
  description: string | null;
  main_article_id: number | null;
  snapshot_mode: SnapshotMode;
  finna_allow_noncommercial: 0 | 1;
  created_by: number;
  created_at: string;
}

const languagesStmt = db.prepare(
  'SELECT language FROM project_languages WHERE project_id = ? ORDER BY position',
);

function toProject(row: ProjectRow): Project {
  return {
    id: row.id,
    slug: row.slug,
    title: row.title,
    description: row.description,
    mainArticleId: row.main_article_id,
    snapshotMode: row.snapshot_mode,
    finnaAllowNonCommercial: Boolean(row.finna_allow_noncommercial),
    languages: (languagesStmt.all(row.id) as { language: string }[]).map((r) => r.language),
    createdBy: row.created_by,
    createdAt: row.created_at,
  };
}

const listStmt = db.prepare('SELECT * FROM projects ORDER BY created_at DESC');
const listForUserStmt = db.prepare(`
  SELECT p.*, pm.role AS my_role FROM projects p
  JOIN project_members pm ON pm.project_id = p.id
  WHERE pm.user_id = ?
  ORDER BY p.created_at DESC
`);
const findBySlugStmt = db.prepare('SELECT * FROM projects WHERE slug = ?');
const findByIdStmt = db.prepare('SELECT * FROM projects WHERE id = ?');
const insertStmt = db.prepare(
  'INSERT INTO projects (slug, title, description, created_by) VALUES (@slug, @title, @description, @createdBy)',
);
const setMainArticleStmt = db.prepare('UPDATE projects SET main_article_id = ? WHERE id = ?');
const setSnapshotModeStmt = db.prepare('UPDATE projects SET snapshot_mode = ? WHERE id = ?');
const setFinnaAllowNonCommercialStmt = db.prepare(
  'UPDATE projects SET finna_allow_noncommercial = ? WHERE id = ?',
);
const deleteLanguagesStmt = db.prepare('DELETE FROM project_languages WHERE project_id = ?');
const insertLanguageStmt = db.prepare(
  'INSERT INTO project_languages (project_id, language, position) VALUES (?, ?, ?)',
);
const languageInUseStmt = db.prepare(
  'SELECT count(*) AS count FROM articles WHERE project_id = ? AND language = ?',
);

export const projectsRepository = {
  list(): Project[] {
    return (listStmt.all() as ProjectRow[]).map(toProject);
  },

  /**
   * Projects the user is a member of, tagged with the membership role. Admins
   * get their own path in the service layer (they see everything) — this only
   * covers explicit memberships.
   */
  listForUser(userId: number): (Project & { myRole: ProjectMemberRole })[] {
    return (listForUserStmt.all(userId) as (ProjectRow & { my_role: ProjectMemberRole })[]).map(
      (row) => ({ ...toProject(row), myRole: row.my_role }),
    );
  },

  findBySlug(slug: string): Project | undefined {
    const row = findBySlugStmt.get(slug) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  findById(id: number): Project | undefined {
    const row = findByIdStmt.get(id) as ProjectRow | undefined;
    return row ? toProject(row) : undefined;
  },

  create(input: {
    slug: string;
    title: string;
    description: string | null;
    createdBy: number;
    languages: string[];
  }): Project {
    const create = db.transaction(() => {
      const info = insertStmt.run(input);
      const id = Number(info.lastInsertRowid);
      input.languages.forEach((language, position) => insertLanguageStmt.run(id, language, position));
      return id;
    });
    return this.findById(create())!;
  },

  setMainArticle(id: number, articleId: number): Project {
    setMainArticleStmt.run(articleId, id);
    return this.findById(id)!;
  },

  setSnapshotMode(id: number, mode: SnapshotMode): Project {
    setSnapshotModeStmt.run(mode, id);
    return this.findById(id)!;
  },

  setFinnaAllowNonCommercial(id: number, allow: boolean): Project {
    setFinnaAllowNonCommercialStmt.run(allow ? 1 : 0, id);
    return this.findById(id)!;
  },

  setLanguages(id: number, languages: string[]): Project {
    db.transaction(() => {
      deleteLanguagesStmt.run(id);
      languages.forEach((language, position) => insertLanguageStmt.run(id, language, position));
    })();
    return this.findById(id)!;
  },

  countArticlesInLanguage(projectId: number, language: string): number {
    return (languageInUseStmt.get(projectId, language) as { count: number }).count;
  },
};
