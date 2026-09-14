-- Whether a project keeps its own copy of imported articles, or only what is
-- needed to link to them. Wikipedia renders its own pages far better than a
-- sanitized copy can and is always current, but a hard copy is an archive of
-- what was actually cited — which is worth having for some projects and just
-- weight for others.

ALTER TABLE projects ADD COLUMN snapshot_mode TEXT NOT NULL DEFAULT 'live_link'
  CHECK (snapshot_mode IN ('hard_copy', 'live_link'));

-- Projects that already exist were built under the hard-copy behaviour and have
-- the stored copies to match, so they keep it. New projects start lean.
UPDATE projects SET snapshot_mode = 'hard_copy';
