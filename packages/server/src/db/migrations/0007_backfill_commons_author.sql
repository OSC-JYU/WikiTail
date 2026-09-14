-- Commons items imported before the author column existed carry their artist
-- inside the attribution line this app generated, in a format it controls:
--   "Title" by ARTIST, licensed under LICENCE. Via Wikimedia Commons.
-- Lifting it back out converges that data instead of leaving it prose-only.

UPDATE library_items
SET author = substr(
      attribution_text,
      instr(attribution_text, '" by ') + 5,
      instr(attribution_text, ', licensed under ') - instr(attribution_text, '" by ') - 5
    )
WHERE source_type = 'commons'
  AND author IS NULL
  AND attribution_text IS NOT NULL
  AND instr(attribution_text, '" by ') > 0
  AND instr(attribution_text, ', licensed under ') > instr(attribution_text, '" by ');
