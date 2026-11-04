export interface PdfLabels {
  preparedFor: string;
  generated: string;
  language: string;
  licence: string;
  lastUpdated: string;
  moreOnThis: string;
  by: (author: string) => string;
  viewSource: string;
  createdWith: string;
  snapshotNote: string;
  page: (n: number, total: number) => string;
}

const en: PdfLabels = {
  preparedFor: 'Prepared for',
  generated: 'Generated',
  language: 'Language',
  licence: 'Licence',
  lastUpdated: 'Last updated',
  moreOnThis: 'More on this',
  by: (author) => `by ${author}`,
  viewSource: 'View source',
  createdWith: 'Created with Wikitail',
  snapshotNote:
    'This document is a snapshot of the published article at the time shown above. ' +
    'The online version may have changed since.',
  page: (n, total) => `Page ${n} / ${total}`,
};

const fi: PdfLabels = {
  preparedFor: 'Laadittu käyttäjälle',
  generated: 'Luotu',
  language: 'Kieli',
  licence: 'Lisenssi',
  lastUpdated: 'Viimeksi päivitetty',
  moreOnThis: 'Lisää aiheesta',
  by: (author) => `tekijä ${author}`,
  viewSource: 'Näytä lähde',
  createdWith: 'Luotu Wikitailillä',
  snapshotNote:
    'Tämä asiakirja on julkaistun artikkelin tilannekuva yllä näkyvänä ajankohtana. ' +
    'Verkossa oleva versio on voinut muuttua sen jälkeen.',
  page: (n, total) => `Sivu ${n} / ${total}`,
};

const byLanguage: Record<string, PdfLabels> = { en, fi };

/** Labels in the article's language where we have them, English otherwise. */
export function labelsFor(language: string): PdfLabels {
  return byLanguage[language.toLowerCase().split('-')[0]] ?? en;
}
