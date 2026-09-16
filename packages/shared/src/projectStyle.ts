/**
 * A project's visual style is one of a small set of presets shipped with the
 * client (the actual CSS lives there — this package only knows the ids and
 * display names, since the server needs the ids to validate a project's
 * choice and the client needs the names to list them).
 */
export interface ProjectStyleOption {
  id: string;
  name: string;
}

export const PROJECT_STYLES: ProjectStyleOption[] = [
  { id: 'wikistyle', name: 'Wikistyle (current)' },
  { id: 'fancy', name: 'Fancy' },
  { id: 'shades', name: 'Shades' },
];

export const DEFAULT_PROJECT_STYLE = 'wikistyle';

export function isProjectStyle(id: string): boolean {
  return PROJECT_STYLES.some((s) => s.id === id);
}

/** Manager-authored custom CSS is capped so it can't be used to smuggle in an enormous payload. */
export const MAX_CUSTOM_CSS_LENGTH = 50_000;
