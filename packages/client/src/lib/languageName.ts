/**
 * A language code shown to a reader in their own language: "en" reads as
 * "English" in English and "englanti" in Finnish. Falls back to the raw code for
 * anything the browser cannot name.
 */
export function languageName(code: string, locale: string): string {
  try {
    return new Intl.DisplayNames([locale], { type: 'language' }).of(code) ?? code;
  } catch {
    return code;
  }
}
