import { db } from '../../db/connection.js';
import type { User, UserRole } from '@wikitail/shared';

interface UserRow {
  id: number;
  email: string;
  display_name: string | null;
  role: UserRole;
  created_at: string;
}

function toUser(row: UserRow): User {
  return {
    id: row.id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

const findByEmailStmt = db.prepare('SELECT * FROM users WHERE email = ?');
const insertStmt = db.prepare(
  'INSERT INTO users (email, display_name, role) VALUES (@email, @displayName, @role)',
);
const findByIdStmt = db.prepare('SELECT * FROM users WHERE id = ?');
const listStmt = db.prepare('SELECT * FROM users ORDER BY email');
const updateRoleStmt = db.prepare('UPDATE users SET role = ? WHERE id = ?');

export const usersRepository = {
  findByEmail(email: string): User | undefined {
    const row = findByEmailStmt.get(email) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  },

  findById(id: number): User | undefined {
    const row = findByIdStmt.get(id) as UserRow | undefined;
    return row ? toUser(row) : undefined;
  },

  list(): User[] {
    return (listStmt.all() as UserRow[]).map(toUser);
  },

  /** Upserts a user by email, used by both auth schemes to resolve the current identity. */
  upsertByEmail(email: string, role: UserRole): User {
    const existing = this.findByEmail(email);
    if (existing) return existing;
    const displayName = email.split('@')[0];
    const info = insertStmt.run({ email, displayName, role });
    return this.findById(Number(info.lastInsertRowid))!;
  },

  updateRole(id: number, role: UserRole): User {
    updateRoleStmt.run(role, id);
    return this.findById(id)!;
  },
};
