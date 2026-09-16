-- Whether Finna material under a NonCommercial licence (CC BY-NC*) is copied
-- into the library on import, rather than kept as a link-only reference.
--
-- Unlike snapshot_mode, this defaults to true (allowed) for every project,
-- existing and new: NC still requires attribution and forbids commercial use,
-- but a wiki project is the common case this is meant for, not the exception.
-- A project that *is* run commercially can turn this off.
ALTER TABLE projects ADD COLUMN finna_allow_noncommercial INTEGER NOT NULL DEFAULT 1
  CHECK (finna_allow_noncommercial IN (0, 1));
