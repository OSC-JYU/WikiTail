import { db } from '../../db/connection.js';
import type { ProjectMember, ProjectMemberRole } from '@wikitail/shared';

interface MemberRow {
  user_id: number;
  email: string;
  display_name: string | null;
  role: ProjectMemberRole;
  created_at: string;
}

function toMember(row: MemberRow): ProjectMember {
  return {
    userId: row.user_id,
    email: row.email,
    displayName: row.display_name,
    role: row.role,
    createdAt: row.created_at,
  };
}

const listStmt = db.prepare(`
  SELECT pm.user_id, u.email, u.display_name, pm.role, pm.created_at
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id
  WHERE pm.project_id = ?
  ORDER BY pm.role DESC, u.email
`);

const findStmt = db.prepare(
  'SELECT role FROM project_members WHERE project_id = ? AND user_id = ?',
);

const findOneStmt = db.prepare(`
  SELECT pm.user_id, u.email, u.display_name, pm.role, pm.created_at
  FROM project_members pm
  JOIN users u ON u.id = pm.user_id
  WHERE pm.project_id = ? AND pm.user_id = ?
`);

const insertStmt = db.prepare(
  'INSERT INTO project_members (project_id, user_id, role) VALUES (?, ?, ?)',
);

const updateRoleStmt = db.prepare(
  'UPDATE project_members SET role = ? WHERE project_id = ? AND user_id = ?',
);

const deleteStmt = db.prepare(
  'DELETE FROM project_members WHERE project_id = ? AND user_id = ?',
);

const countManagersStmt = db.prepare(
  "SELECT count(*) AS count FROM project_members WHERE project_id = ? AND role = 'manager'",
);

export const projectMembersRepository = {
  listByProject(projectId: number): ProjectMember[] {
    return (listStmt.all(projectId) as MemberRow[]).map(toMember);
  },

  /** Just the role, used by authorization checks that don't need the full row. */
  findRole(projectId: number, userId: number): ProjectMemberRole | undefined {
    const row = findStmt.get(projectId, userId) as { role: ProjectMemberRole } | undefined;
    return row?.role;
  },

  findOne(projectId: number, userId: number): ProjectMember | undefined {
    const row = findOneStmt.get(projectId, userId) as MemberRow | undefined;
    return row ? toMember(row) : undefined;
  },

  add(projectId: number, userId: number, role: ProjectMemberRole): ProjectMember {
    insertStmt.run(projectId, userId, role);
    return this.findOne(projectId, userId)!;
  },

  updateRole(projectId: number, userId: number, role: ProjectMemberRole): ProjectMember {
    updateRoleStmt.run(role, projectId, userId);
    return this.findOne(projectId, userId)!;
  },

  remove(projectId: number, userId: number): void {
    deleteStmt.run(projectId, userId);
  },

  countManagers(projectId: number): number {
    return (countManagersStmt.get(projectId) as { count: number }).count;
  },
};
