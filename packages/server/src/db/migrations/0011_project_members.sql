-- Per-project membership. `role` is the *project* role, distinct from `users.role`:
-- - editor  = can create and edit articles in this project, curate tails, upload library files
-- - manager = editor + can change project settings and add/remove members
-- Global admins bypass all project checks. Non-members can only see published
-- articles in the project.

CREATE TABLE project_members (
  project_id INTEGER NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  role TEXT NOT NULL CHECK (role IN ('editor', 'manager')) DEFAULT 'editor',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  PRIMARY KEY (project_id, user_id)
);

CREATE INDEX idx_project_members_user ON project_members(user_id);

-- Backfill: whoever created each project becomes its manager. Admins are still
-- admins globally and don't need a row, but the creator is often the one running
-- the project day-to-day, and this preserves their access after they're demoted
-- from admin to author (a common step once membership exists).
INSERT INTO project_members (project_id, user_id, role)
  SELECT id, created_by, 'manager' FROM projects;
