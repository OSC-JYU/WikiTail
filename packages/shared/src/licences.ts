/**
 * Licences offered when uploading your own file, or writing an article. Imported
 * content keeps whatever licence its source declared — you cannot relicense
 * someone else's work — so this list only applies to things authored here.
 */
export interface LicenceOption {
  id: string;
  name: string;
  url: string | null;
}

export const UPLOAD_LICENCES: LicenceOption[] = [
  { id: 'cc-by-4.0', name: 'CC BY 4.0', url: 'https://creativecommons.org/licenses/by/4.0/' },
  { id: 'cc-by-sa-4.0', name: 'CC BY-SA 4.0', url: 'https://creativecommons.org/licenses/by-sa/4.0/' },
  { id: 'cc-by-nc-4.0', name: 'CC BY-NC 4.0', url: 'https://creativecommons.org/licenses/by-nc/4.0/' },
  { id: 'cc0-1.0', name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
  { id: 'public-domain', name: 'Public domain', url: null },
  { id: 'all-rights-reserved', name: 'All rights reserved', url: null },
];

/** Attribution is the point of CC, so sharing without a credit is the awkward case. */
export const DEFAULT_UPLOAD_LICENCE = 'cc-by-4.0';

export function findLicence(id: string): LicenceOption | undefined {
  return UPLOAD_LICENCES.find((licence) => licence.id === id);
}
