-- A project's visual style: one of a small set of presets shipped with the
-- client, plus optional manager-authored CSS layered on top of it. Presets are
-- validated in the app layer, not with a CHECK constraint, so a new one can be
-- added without a migration.
ALTER TABLE projects ADD COLUMN style_id TEXT NOT NULL DEFAULT 'wikistyle';
ALTER TABLE projects ADD COLUMN custom_css TEXT;
