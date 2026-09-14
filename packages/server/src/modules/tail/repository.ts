import { db } from '../../db/connection.js';
import type { TailEntry } from '@wikitail/shared';

interface TailEntryRow {
  id: number;
  article_id: number;
  library_item_id: number;
  commentary: string | null;
  position: number;
  created_at: string;
}

function toEntry(row: TailEntryRow): TailEntry {
  return {
    id: row.id,
    articleId: row.article_id,
    libraryItemId: row.library_item_id,
    commentary: row.commentary,
    position: row.position,
    createdAt: row.created_at,
  };
}

const listStmt = db.prepare('SELECT * FROM tail_entries WHERE article_id = ? ORDER BY position');
const findByIdStmt = db.prepare('SELECT * FROM tail_entries WHERE id = ?');
const nextPositionStmt = db.prepare(
  'SELECT coalesce(max(position), -1) + 1 AS next FROM tail_entries WHERE article_id = ?',
);
const insertStmt = db.prepare(`
  INSERT INTO tail_entries (article_id, library_item_id, commentary, position)
  VALUES (@articleId, @libraryItemId, @commentary, @position)
`);
const updateCommentaryStmt = db.prepare('UPDATE tail_entries SET commentary = ? WHERE id = ?');
const deleteStmt = db.prepare('DELETE FROM tail_entries WHERE id = ?');
const setPositionStmt = db.prepare('UPDATE tail_entries SET position = ? WHERE id = ?');

export const tailRepository = {
  listByArticle(articleId: number): TailEntry[] {
    return (listStmt.all(articleId) as TailEntryRow[]).map(toEntry);
  },

  findById(id: number): TailEntry | undefined {
    const row = findByIdStmt.get(id) as TailEntryRow | undefined;
    return row ? toEntry(row) : undefined;
  },

  /** Appends to the end of the tail. The same item may be added more than once. */
  create(input: { articleId: number; libraryItemId: number; commentary: string | null }): TailEntry {
    const create = db.transaction(() => {
      const { next } = nextPositionStmt.get(input.articleId) as { next: number };
      return Number(insertStmt.run({ ...input, position: next }).lastInsertRowid);
    });
    return this.findById(create())!;
  },

  updateCommentary(id: number, commentary: string | null): TailEntry {
    updateCommentaryStmt.run(commentary, id);
    return this.findById(id)!;
  },

  remove(id: number): void {
    deleteStmt.run(id);
  },

  reorder(articleId: number, orderedIds: number[]): TailEntry[] {
    db.transaction(() => {
      orderedIds.forEach((id, position) => setPositionStmt.run(position, id));
    })();
    return this.listByArticle(articleId);
  },
};
