import { db } from '../../db/connection.js';
import type { LocalFile, LocalFileKind } from '@wikitail/shared';

interface LocalFileRow {
  id: number;
  owner_id: number;
  disk_path: string;
  original_filename: string;
  mime_type: string;
  byte_size: number;
  kind: LocalFileKind;
  created_at: string;
}

function toLocalFile(row: LocalFileRow): LocalFile {
  return {
    id: row.id,
    ownerId: row.owner_id,
    diskPath: row.disk_path,
    originalFilename: row.original_filename,
    mimeType: row.mime_type,
    byteSize: row.byte_size,
    kind: row.kind,
    createdAt: row.created_at,
  };
}

const insertStmt = db.prepare(`
  INSERT INTO local_files (owner_id, disk_path, original_filename, mime_type, byte_size, kind)
  VALUES (@ownerId, @diskPath, @originalFilename, @mimeType, @byteSize, @kind)
`);
const findByIdStmt = db.prepare('SELECT * FROM local_files WHERE id = ?');

export const filesRepository = {
  findById(id: number): LocalFile | undefined {
    const row = findByIdStmt.get(id) as LocalFileRow | undefined;
    return row ? toLocalFile(row) : undefined;
  },

  create(input: {
    ownerId: number;
    diskPath: string;
    originalFilename: string;
    mimeType: string;
    byteSize: number;
    kind: LocalFileKind;
  }): LocalFile {
    const info = insertStmt.run(input);
    return this.findById(Number(info.lastInsertRowid))!;
  },
};
