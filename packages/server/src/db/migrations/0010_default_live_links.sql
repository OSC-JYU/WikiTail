-- 0009 preserved hard copies for projects that predated the setting, on the
-- reasoning that they were built under that behaviour. Live links are the
-- intended default everywhere, so they get it too.
--
-- 0009 is left as it was rather than edited: it has already run, and a migration
-- that changes after the fact is worse than an extra one.

UPDATE projects SET snapshot_mode = 'live_link';
