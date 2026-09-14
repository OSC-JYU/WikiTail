import { db } from '../../db/connection.js';
import type { LibraryItem, LibraryItemSummary, SourceType } from '@wikitail/shared';

interface LibraryItemRow {
  id: number;
  owner_id: number;
  source_type: SourceType;
  external_id: string | null;
  external_url: string | null;
  source_revision: string | null;
  title: string;
  local_file_id: number | null;
  license_name: string | null;
  license_url: string | null;
  attribution_text: string | null;
  imported_at: string;
  imported_by: number;
  created_at: string;
}

interface FullLibraryItemRow extends LibraryItemRow {
  snapshot_html: string | null;
  snapshot_json: string | null;
}

const SUMMARY_COLUMNS = `
  id, owner_id, source_type, external_id, external_url, source_revision, title,
  local_file_id, license_name, license_url, attribution_text, imported_at, imported_by, created_at
`;

function toSummary(row: LibraryItemRow): LibraryItemSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sourceType: row.source_type,
    externalId: row.external_id,
    externalUrl: row.external_url,
    sourceRevision: row.source_revision,
    title: row.title,
    localFileId: row.local_file_id,
    licenseName: row.license_name,
    licenseUrl: row.license_url,
    attributionText: row.attribution_text,
    importedAt: row.imported_at,
    importedBy: row.imported_by,
    createdAt: row.created_at,
  };
}

function toFull(row: FullLibraryItemRow): LibraryItem {
  return {
    ...toSummary(row),
    snapshotHtml: row.snapshot_html,
    snapshotJson: row.snapshot_json ? JSON.parse(row.snapshot_json) : null,
  };
}

const listStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} FROM library_items WHERE owner_id = ? ORDER BY imported_at DESC`,
);
const findByIdStmt = db.prepare('SELECT * FROM library_items WHERE id = ?');
const findSummaryByIdStmt = db.prepare(`SELECT ${SUMMARY_COLUMNS} FROM library_items WHERE id = ?`);
const findByExternalStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} FROM library_items
   WHERE owner_id = ? AND source_type = ? AND external_id = ?`,
);
const insertStmt = db.prepare(`
  INSERT INTO library_items (
    owner_id, source_type, external_id, external_url, source_revision, title,
    snapshot_html, snapshot_json, license_name, license_url, attribution_text, imported_by
  ) VALUES (
    @ownerId, @sourceType, @externalId, @externalUrl, @sourceRevision, @title,
    @snapshotHtml, @snapshotJson, @licenseName, @licenseUrl, @attributionText, @importedBy
  )
`);

export const libraryRepository = {
  listByOwner(ownerId: number): LibraryItemSummary[] {
    return (listStmt.all(ownerId) as LibraryItemRow[]).map(toSummary);
  },

  findById(id: number): LibraryItem | undefined {
    const row = findByIdStmt.get(id) as FullLibraryItemRow | undefined;
    return row ? toFull(row) : undefined;
  },

  findByExternalId(
    ownerId: number,
    sourceType: SourceType,
    externalId: string,
  ): LibraryItemSummary | undefined {
    const row = findByExternalStmt.get(ownerId, sourceType, externalId) as
      | LibraryItemRow
      | undefined;
    return row ? toSummary(row) : undefined;
  },

  create(input: {
    ownerId: number;
    sourceType: SourceType;
    externalId: string | null;
    externalUrl: string | null;
    sourceRevision: string | null;
    title: string;
    snapshotHtml: string | null;
    snapshotJson: string | null;
    licenseName: string | null;
    licenseUrl: string | null;
    attributionText: string | null;
    importedBy: number;
  }): LibraryItemSummary {
    const info = insertStmt.run(input);
    return toSummary(findSummaryByIdStmt.get(Number(info.lastInsertRowid)) as LibraryItemRow);
  },
};
