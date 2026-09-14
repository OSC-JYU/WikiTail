import { db } from '../../db/connection.js';
import type { LibraryItem, LibraryItemSummary, LocalFileKind, SourceType } from '@wikitail/shared';
import { mediaUrl } from '../files/storage.js';

interface LibraryItemRow {
  id: number;
  owner_id: number;
  source_type: SourceType;
  external_id: string | null;
  external_url: string | null;
  source_revision: string | null;
  language: string | null;
  concept_id: string | null;
  title: string;
  description: string | null;
  author: string | null;
  local_file_id: number | null;
  disk_path: string | null;
  media_kind: LocalFileKind | null;
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
  library_items.id, library_items.owner_id AS owner_id, source_type, external_id, external_url, source_revision, language,
  concept_id, library_items.title, library_items.description AS description,
  library_items.author AS author, local_file_id, local_files.disk_path AS disk_path,
  local_files.kind AS media_kind, license_name, license_url, attribution_text, imported_at,
  imported_by, library_items.created_at AS created_at
`;

const FROM_WITH_FILE = 'FROM library_items LEFT JOIN local_files ON local_files.id = local_file_id';

function toSummary(row: LibraryItemRow): LibraryItemSummary {
  return {
    id: row.id,
    ownerId: row.owner_id,
    sourceType: row.source_type,
    externalId: row.external_id,
    externalUrl: row.external_url,
    sourceRevision: row.source_revision,
    language: row.language,
    conceptId: row.concept_id,
    title: row.title,
    description: row.description,
    author: row.author,
    localFileId: row.local_file_id,
    mediaUrl: row.disk_path ? mediaUrl(row.disk_path) : null,
    mediaKind: row.media_kind,
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
  `SELECT ${SUMMARY_COLUMNS} ${FROM_WITH_FILE} WHERE library_items.owner_id = ? ORDER BY imported_at DESC`,
);
const findByIdStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS}, snapshot_html, snapshot_json ${FROM_WITH_FILE}
   WHERE library_items.id = ?`,
);
const findSummaryByIdStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} ${FROM_WITH_FILE} WHERE library_items.id = ?`,
);
const findByExternalStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} ${FROM_WITH_FILE}
   WHERE library_items.owner_id = ? AND source_type = ? AND external_id = ?`,
);
const insertStmt = db.prepare(`
  INSERT INTO library_items (
    owner_id, source_type, external_id, external_url, source_revision, language, concept_id, title,
    description, author, snapshot_html, snapshot_json, local_file_id, license_name, license_url,
    attribution_text, imported_by
  ) VALUES (
    @ownerId, @sourceType, @externalId, @externalUrl, @sourceRevision, @language, @conceptId, @title,
    @description, @author, @snapshotHtml, @snapshotJson, @localFileId, @licenseName, @licenseUrl,
    @attributionText, @importedBy
  )
`);
const setConceptStmt = db.prepare('UPDATE library_items SET concept_id = ? WHERE id = ?');
const updateDetailsStmt = db.prepare(`
  UPDATE library_items
  SET title = @title, description = @description, author = @author,
      license_name = @licenseName, license_url = @licenseUrl, attribution_text = @attributionText
  WHERE id = @id
`);
const findByConceptStmt = db.prepare(
  `SELECT ${SUMMARY_COLUMNS} ${FROM_WITH_FILE}
   WHERE library_items.owner_id = ? AND concept_id = ? AND language = ?`,
);

export const libraryRepository = {
  listByOwner(ownerId: number): LibraryItemSummary[] {
    return (listStmt.all(ownerId) as LibraryItemRow[]).map(toSummary);
  },

  findById(id: number): LibraryItem | undefined {
    const row = findByIdStmt.get(id) as FullLibraryItemRow | undefined;
    return row ? toFull(row) : undefined;
  },

  /** Metadata without the snapshot body — for listing and tail resolution. */
  findSummaryById(id: number): LibraryItemSummary | undefined {
    const row = findSummaryByIdStmt.get(id) as LibraryItemRow | undefined;
    return row ? toSummary(row) : undefined;
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

  setConcept(id: number, conceptId: string): LibraryItemSummary {
    setConceptStmt.run(conceptId, id);
    return toSummary(findSummaryByIdStmt.get(id) as LibraryItemRow);
  },

  updateDetails(
    id: number,
    input: {
      title: string;
      description: string | null;
      author: string | null;
      licenseName: string | null;
      licenseUrl: string | null;
      attributionText: string | null;
    },
  ): LibraryItemSummary {
    updateDetailsStmt.run({ id, ...input });
    return toSummary(findSummaryByIdStmt.get(id) as LibraryItemRow);
  },

  /** The sibling of an imported item in another language, matched by concept. */
  findByConcept(
    ownerId: number,
    conceptId: string,
    language: string,
  ): LibraryItemSummary | undefined {
    const row = findByConceptStmt.get(ownerId, conceptId, language) as LibraryItemRow | undefined;
    return row ? toSummary(row) : undefined;
  },

  create(input: {
    ownerId: number;
    sourceType: SourceType;
    externalId: string | null;
    externalUrl: string | null;
    sourceRevision: string | null;
    language: string | null;
    conceptId: string | null;
    title: string;
    description: string | null;
    author: string | null;
    snapshotHtml: string | null;
    snapshotJson: string | null;
    localFileId: number | null;
    licenseName: string | null;
    licenseUrl: string | null;
    attributionText: string | null;
    importedBy: number;
  }): LibraryItemSummary {
    const info = insertStmt.run(input);
    return toSummary(findSummaryByIdStmt.get(Number(info.lastInsertRowid)) as LibraryItemRow);
  },
};
