# Wikitail — Implementation Plan

Status: **M0 and M1 complete.** M2 (language foundations) is next.

Wikitail is a self-hosted, multi-user app for writing local articles (markdown) enriched with
content imported from external "wiki world" sources — Wikipedia first, then Wikimedia Commons,
Wikidata, and Finna.fi. Authors curate a "Tail" of library content with their own commentary after
each article; the public browses this as a mobile-first, feed-style view. It is explicitly **not**
social media: no visitor comments, likes, or follows — only the author curates what appears.

See [`idea.md`](../idea.md) for the original concept.

## Decisions

- **Project/article hierarchy**: admin creates Projects (+ their main page); any registered author
  can create Articles within any project.
- **Auth**: production runs behind an SSO/reverse proxy that injects a `mail` header identifying the
  user; the app trusts that header for identity. A **dev mode** (no proxy) falls back to one fixed
  default user. Role (admin/author) lives in our own `users` table, keyed by email — SSO supplies
  identity only, never authorization.
- **Frontend**: Vue 3 SPA (Vue Router + Pinia), built with Vite, served as static files by hapi.
  hapi exposes a JSON/REST API only.
- **Storage**: SQLite for structured data; local disk for binary uploads. No object storage, no
  server-rendered pages.
- **External sources**: Wikipedia first, via the Wikimedia REST HTML endpoint (rendered HTML, never
  wikitext parsing). Commons/Wikidata/Finna follow behind a shared adapter interface.
- **Language**: TypeScript across server and client, with a shared types package.
- **Publishing**: articles have a draft/published state; any author publishes their own article (no
  admin approval). Only published articles appear in public browse.
- **Tail is not comments**: only the article's author curates Tail entries (library item + optional
  commentary); no visitor-facing interaction.
- **Licensing**: every imported snapshot stores license name/URL + attribution text, displayed
  wherever the content appears.
- **External links** behave like normal browser links — `target="_blank" rel="noopener noreferrer"`.
- **Multilingual**: each **project declares its set of languages**; articles may only be written in
  those, and imports fetch exactly those language versions. The same article can exist as linked
  language versions, matched across wikis by Wikidata concept id. When a version is missing the author
  decides what happens — by default an invitation to translate, or a substitute article of their
  choosing. Language codes are free-form ISO codes — no fixed set, no DB enum. The UI is translatable,
  and the chosen UI language also selects which language version of the content you see.
  See [Multilingual design](#multilingual-design).

## Repo layout — npm workspaces, TypeScript

```
wikitail/
  package.json                  # root, workspaces: ["packages/*"]
  tsconfig.base.json
  .env.example
  docs/implementation-plan.md   # this file
  packages/
    shared/src/types.ts         # DTOs + source/snapshot shapes shared by server and client
    server/
      src/
        index.ts                # hapi bootstrap
        config.ts               # PORT, AUTH_MODE, DB_PATH, UPLOADS_DIR, ADMIN_EMAILS,
                                # DEV_USER_EMAIL, WIKIPEDIA_LANG, WIKIPEDIA_USER_AGENT
        db/
          connection.ts         # better-sqlite3 instance; runs migrations on import
          migrate.ts            # migration runner (tracking table + numbered .sql files)
          migrations/0001_init.sql, 0002_library.sql, 0003_tail.sql
        plugins/
          auth/{index,header-scheme,dev-scheme}.ts
          static.ts             # @hapi/inert: SPA fallback + /uploads/{path*}
        modules/
          users/ projects/ articles/ library/   # {routes,service,repository}.ts each
          tail/ files/ public/                  # later milestones
          sources/
            adapter.ts          # SourceAdapter interface
            registry.ts         # sourceType -> adapter instance
            wikipedia/{client,adapter,sanitize}.ts
        lib/{errors,logger,slug}.ts
      data/                     # gitignored: sqlite db file
      uploads/                  # gitignored: local media storage root
    client/
      vite.config.ts            # dev proxy /api + /uploads -> hapi
      src/
        main.ts, App.vue, router/index.ts
        stores/                 # pinia: auth, projects, library
        api/                    # typed fetch wrappers
        views/ HomeView ProjectView ArticleEditorView BrowseArticleView
        components/
          editor/ WikiWorldTab MyLibraryTab
          common/ LicenseBadge
```

Each backend domain is a hapi plugin under `/api`, backed by a `repository.ts` (prepared statements)
and a `service.ts` for business logic.

### Auth

Two schemes selected by `AUTH_MODE=header|dev` (default `dev` outside `NODE_ENV=production`):

- `header`: reads the `mail` header; 401 if absent; upserts a `users` row by email.
- `dev`: always returns the fixed `DEV_USER_EMAIL` user, upserted the same way.

`server.auth.default('identity')`; public routes opt out with `auth: false`. First-admin bootstrap
via `ADMIN_EMAILS`; in dev mode the fixed user defaults to admin so the full flow is testable with no
setup.

### Source adapters

```ts
interface SourceAdapter {
  key: SourceType;
  search(query: string, opts?: { limit?: number }): Promise<SourceSearchResult[]>;
  importItem(externalId: string): Promise<SourceSnapshot>;
}
```

`registry.ts` maps `source_type -> adapter`. The library service calls `importItem()`, persists a
`library_items` row (plus a `local_files` row once media import lands), and stamps
`imported_at`/`imported_by`. Adding a source means adding an adapter module — the pipeline and
storage do not change.

## Data model (SQLite)

```sql
users(id PK, email UNIQUE NOT NULL, display_name, role CHECK IN ('admin','author'), created_at)

projects(id PK, slug UNIQUE, title, description, main_article_id NULL REFERENCES articles(id),
         created_by REFERENCES users(id), created_at)

project_languages(project_id NOT NULL REFERENCES projects(id),
                  language TEXT NOT NULL,          -- free-form ISO code, no CHECK constraint
                  position INTEGER NOT NULL,       -- position 0 is the project's primary language
                  PRIMARY KEY (project_id, language))

translation_groups(id PK, project_id NOT NULL REFERENCES projects(id),
                   fallback_article_id NULL REFERENCES articles(id))
                   -- NULL -> show the "translation missing" placeholder (default)
                   -- set  -> show that article instead, in its own language

articles(id PK, project_id NOT NULL REFERENCES projects(id), slug, title,
         language TEXT NOT NULL,                   -- must be one of the project's languages
         translation_group_id NOT NULL REFERENCES translation_groups(id),
         body_markdown TEXT NOT NULL DEFAULT '', status CHECK IN ('draft','published') DEFAULT 'draft',
         created_by REFERENCES users(id), created_at, updated_at,
         UNIQUE(project_id, language, slug),       -- slugs differ per language; collisions allowed across languages
         UNIQUE(translation_group_id, language))   -- at most one version per language

library_items(id PK, owner_id NOT NULL REFERENCES users(id),
              source_type CHECK IN ('wikipedia','wikidata','commons','finna','local_upload'),
              external_id, external_url, source_revision,
              language TEXT,                       -- NULL for language-neutral items (e.g. a Commons image)
              concept_id TEXT,                     -- e.g. 'wikidata:Q185187'; links language versions
              title NOT NULL, snapshot_html TEXT, snapshot_json TEXT,
              local_file_id NULL REFERENCES local_files(id),
              license_name, license_url, attribution_text,
              imported_at NOT NULL, imported_by NOT NULL REFERENCES users(id), created_at)

local_files(id PK, owner_id REFERENCES users(id), disk_path NOT NULL, original_filename,
            mime_type, byte_size, kind CHECK IN ('image','audio','video','other'), created_at)

tail_entries(id PK, article_id NOT NULL REFERENCES articles(id),
             library_item_id NOT NULL REFERENCES library_items(id),
             commentary TEXT, position INTEGER NOT NULL, created_at)
```

Indices: `articles(project_id)`, `articles(status)`, `articles(translation_group_id)`,
`library_items(owner_id)`, `library_items(source_type, external_id)`,
`library_items(concept_id, language)`, `tail_entries(article_id, position)`.

- `main_article_id` circularity: create project (NULL) → create its article → `UPDATE projects`.
- `translation_groups` is a real table rather than a shared id on `articles`, because the group now
  owns state of its own: the author's choice of what to show when a language version is missing.
  Collapsing that choice into one nullable `fallback_article_id` avoids a separate mode enum — NULL
  means placeholder, set means substitute.
- A project's primary language is `position = 0` in `project_languages`, so there is a single source
  of truth rather than a `default_language` column that could drift out of the set. The set must be
  non-empty; the project's own title and description stay single-valued (projects themselves are not
  translated — see [Decisions](#decisions)).
- Article bodies reference library content via a `[[library:N]]` shortcode resolved by a `markdown-it`
  plugin at render time; markdown stays the single source of truth.
- Duplicate library items within one article's Tail are allowed (independent rows, own commentary).
- Tail ordering is manual (`position` integer), reorderable by drag-and-drop.
- Snapshot HTML/JSON live in SQLite `TEXT`; binary media goes to disk under `uploads/`.
- Wikipedia `external_id` is namespaced `{lang}:{title}` for future multi-language support.

## Multilingual design

Every article has a language, the same article can exist in several languages, and imported wiki
content is matched across languages so a Finnish article's Tail shows Finnish Wikipedia pages.

### Languages are declared per project

A project declares its set of languages in `project_languages` (ordered; position 0 is primary).
That set is the spine of the whole feature:

- **Authoring** is constrained to it — an article's language must be one of the project's languages,
  rejected at the service layer otherwise. Authors pick from a list rather than typing codes.
- **Import** uses it to decide which sibling language versions to fetch (see below), so a two-language
  project never pulls 67 Wikipedia translations.
- **The UI switcher** offers exactly these languages when viewing the project.

Adding a language to an existing project is therefore a meaningful action, not just a setting: it
should offer to backfill sibling snapshots for content already imported, otherwise existing library
items stay missing that language.

### Articles and translation groups

An article's language is its own attribute; language versions of one article belong to the same
`translation_groups` row. Scope is **articles only** — projects carry a language set but a single
title and description.

Slugs are per-language, so the Finnish version can live at a Finnish URL
(`/projects/paikallishistoria/artikkelit/vanha-vesimylly`) rather than reusing the English slug.
Uniqueness is therefore `(project_id, language, slug)`.

### Missing translations are the author's call

When a group has no version in the language being viewed, behaviour is chosen per group by the
author:

- **Default — invite a translation.** Show a "Translation missing — maybe you could help?" notice.
  For a signed-in author this doubles as a call to action, linking straight to creating that
  translation. An anonymous visitor just sees the notice, since they have nothing to act on.
- **Substitute another version.** The author sets `fallback_article_id` to a specific article, and
  readers in the missing language get that version instead, clearly marked as being in another
  language.

One choice covers every missing language in the group. Per-target-language rules ("Finnish readers
see Swedish, German readers see English") are deliberately out of scope — no evidence yet that the
extra dimension earns its complexity.

### Language-aware search and import

`WIKIPEDIA_LANG` becomes a *default*, not the only value. The adapter contract gains a language:

```ts
search(query: string, opts?: { limit?: number; language?: string }): Promise<SourceSearchResult[]>
```

Searching from a Finnish article searches `fi.wikipedia.org`. External ids are already namespaced
`{lang}:{title}` (`fi:Vesimylly`, `en:Watermill`), so no id format change is needed.

### Linking language versions via Wikidata

Wikipedia already solves "same concept, different languages" with Wikidata Q-ids, and a single
request returns both the Q-id and every interlanguage link:

```
/w/api.php?action=query&titles=Watermill&prop=pageprops|langlinks&ppprop=wikibase_item&lllimit=max
```

For `Watermill` this yields `Q185187` plus 67 language links (`fi: Vesimylly`, `sv: Vattenkvarn`, …),
and the Finnish page resolves back to the same Q-id — verified, so the mapping is bidirectional.

On import, therefore:

1. Fetch the page's Q-id and langlinks alongside the HTML.
2. Store `concept_id = 'wikidata:Q185187'` and `language` on the library item.
3. Auto-import the sibling page for **each language the project declares**, sharing the `concept_id`.

At render time a Tail entry resolves to the sibling matching the article's language, falling back to
the imported item when no sibling exists. This means `tail_entries` needs no schema change — the
resolution is a lookup on `(concept_id, language)`.

Not every page has a Q-id, and not every concept has a page in every project language (plenty of
Finnish local topics have no English article, and vice versa). Both cases fall back to showing what
was actually imported, so a gap degrades rather than breaks.

### UI language

`vue-i18n` with locale files, a switcher in the header, and `<html lang>` set from the active locale.
The UI language also selects content: viewing in Finnish shows Finnish article versions where they
exist, and applies the group's missing-translation rule where they do not. Within a project the
switcher offers that project's declared languages.

Language codes stay free-form — no DB `CHECK` constraint, no fixed list in code. A UI locale file only
needs to exist for the chrome to be translated; content languages are independent of that, so a
project can use a language whose UI translation has not been written yet (the chrome falls back to
the default locale).

### Code this touches

- `sources/wikipedia/client.ts` — currently closes over a single `config.wikipediaLang` for both API
  hosts and `articleUrl()`; language must become a parameter.
- `sources/wikipedia/sanitize.ts` — **latent bug**: it rewrites relative `./Article` links against a
  single hardcoded `wikiBase`, so a Finnish import would currently get its links pointed at
  `en.wikipedia.org`. `sanitizeArticleHtml()` must take the language.
- `articles` module + migrations — language, translation group, per-language slug uniqueness.
- `library` module — language/concept columns, sibling auto-import, language-aware resolution.

## Milestones

### M0 — Scaffolding ✅ done

Workspaces + TS config, hapi bootstrap, migration runner, dev-mode auth, CRUD for
users/projects/articles, Vue SPA scaffold. **Delivered**: create a project and article through the UI
as the dev user.

### M1 — Wikipedia adapter, import, library ✅ done

`sources/wikipedia/{client,adapter,sanitize}.ts`, the `library` module, `WikiWorldTab.vue` and
`MyLibraryTab.vue`. **Delivered**: search → import → sanitized snapshot with license and attribution
visible in My Library.

Implementation notes:

- Search uses `generator=search` with `prop=pageimages|extracts`, returning titles, intro extracts
  and thumbnails in a single request (results re-sorted by the `index` field).
- The license is read from the wiki's own `meta=siteinfo&siprop=rightsinfo` rather than hardcoded, so
  it stays correct per-wiki when other languages or sister projects are added. Fetched once, cached.
- The snapshot revision comes from the REST response's `ETag`
  (`W/"1361616616/…"` → `1361616616`), so a future refresh can tell what it snapshotted.
- Sanitization drops `class`/`id`/`style` (Wikipedia's stylesheet is not loaded, so they add bulk
  without effect, and `style` would let imported markup escape our layout), absolutises `./Article`
  links and protocol-relative image URLs, and drops `srcset` rather than rewriting each URL. One
  article: 262KB raw Parsoid → 153KB stored.
- Library listings omit snapshot bodies; only the detail endpoint returns HTML.
- Re-importing an item already in the library returns the existing row.

### M2 — Language foundations ⬅ next

`project_languages` with an ordered language set and admin UI to manage it; article `language` +
`translation_groups` with per-language slugs and authoring constrained to the project's languages;
language-aware adapter search; Wikidata Q-id + langlink capture on import, auto-importing siblings for
the project's languages; language passed through the Wikipedia client and sanitizer; the
missing-translation placeholder and the author's substitute setting. UI for creating a translation of
an existing article and switching between versions. **Deliverable**: the same article exists in
Finnish and English, importing a Wikipedia page brings in both language versions linked by concept,
and a group with a missing version shows either the invitation to translate or the author's chosen
substitute.

Sequenced before the editor and browse work deliberately: `articles.language` is schema-level, and
Tail resolution and the public browse view both need to know an article's language. Retrofitting it
after those exist means reworking their queries and rendering rather than just adding a migration.

### M3 — Editor and Tail curation

Markdown editor (`markdown-it`, `html: false`) with live preview and the `[[library:N]]` shortcode
plugin; `TailEditor.vue` with drag-reorder; `tail_entries` CRUD, resolving each entry to the library
item matching the article's language. **Deliverable**: full authoring loop — article references
library items, Tail curated with commentary, article publishable.

### M4 — Public browse view (mobile-first) + UI translation

`public` routes (`auth: false`, published only); `BrowseArticleView` + `ArticleFeed`/`TailItemCard`;
mobile-first layout. `vue-i18n` with locale files and a language switcher, with the chosen locale
selecting content language and falling back to the project default. **Deliverable**: an anonymous
visitor browses home → project → article + Tail on a phone viewport in either language, with external
links opening in a new tab.

### M5 — Polish and second adapter

Commons adapter (chosen over Wikidata as the second *content* source — it exercises the binary media
path via `local_files`, validating the interface for media and not just text) + `CommonsTab.vue`;
admin role management; upload size limits; loading/error states.

## Package choices

- **hapi**: `@hapi/hapi`, `@hapi/inert`, `@hapi/boom`, `joi` for route validation.
- **HTML sanitization**: `sanitize-html` (server-side allowlist; no DOM post-processing needed).
- **SQLite**: `better-sqlite3` (synchronous, prepared statements, no ORM).
- **Markdown**: `markdown-it` with `html: false`, plus a `[[library:N]]` shortcode plugin (M3).
- **Uploads**: hapi's built-in multipart streaming to disk under `uploads/` with a
  `crypto.randomUUID()` filename. Default limits: images 20MB, audio 100MB, video 500MB.
- **Client**: plain `fetch` wrappers; `vue-draggable-plus` for Tail drag-reorder (M3); `vue-i18n` for
  UI translation (M4).
- **Dev tooling**: `tsx`, `concurrently`, `eslint` + `@typescript-eslint`, `prettier`.
- **Wikipedia requests**: must send a descriptive `User-Agent` (Wikimedia policy) — see
  `WIKIPEDIA_USER_AGENT` in `.env.example`.

## Gotchas worth remembering

- **Inert's `confine` default.** `h.file()` defaults to `confine: true`, resolved against
  `route.settings.files.relativeTo` — which is the process CWD (`packages/server`). The client build
  lives outside it, so every SPA request 403'd until `confine` was pointed at the build directory.
  Any future `h.file()` on a path outside `packages/server` needs the same treatment.
- **Migration ordering.** Repositories create prepared statements at module load, which happens
  before `main()` runs. Migrations therefore execute as a side effect of importing
  `db/connection.ts`, not from `index.ts` — otherwise the first `db.prepare()` hits a missing table.
- **Port 3000 serves the API, not the dev UI.** In development the UI is Vite on :5173. Hitting :3000
  without a build now returns a 503 page pointing at the right URL instead of failing opaquely.

## Known gaps

- **Nothing is language-aware yet.** M0/M1 assume a single language throughout: articles have no
  language column and `WIKIPEDIA_LANG` is a single global. The sanitizer's hardcoded wiki host is an
  outright bug for any non-default language (see [Multilingual design](#code-this-touches)).
- **No test suite yet.** `vitest` is planned but not installed; verification so far has been manual
  plus scripted browser runs. Worth addressing before the codebase grows much further — the language
  work in M2 adds fallback and resolution logic that is exactly the kind of thing tests should pin
  down.
- **Imported images are hotlinked**, not stored. Snapshot *text* is local, but `<img>` still points at
  `thumb.wikimedia.org`, so an imported article is not fully offline-independent. Media downloading
  is the Commons work in M4.
- **No Tailwind.** The plan called for it; the UI currently uses plain scoped CSS per component.
  Revisit when the mobile-first browse view (M3) makes a utility system worth its weight.
- **Snapshot refresh is unbuilt by design.** `source_revision` and `external_url` are stored so
  re-fetching is possible later; when and how to refresh is still open.
- **Only implemented editor tabs are rendered.** Commons/Finna/Local appear as their adapters land,
  rather than sitting disabled.

## Open questions

- Exact upload size limits — current defaults are placeholders.
- Whether a derived `article_library_links` table is needed for "where is item X used" queries.
- **Translating an existing article**: start the new version blank, or pre-fill with the source
  language's markdown as a starting point for the translator?
- **Project index with missing translations.** An article page has a clear rule now (placeholder or
  substitute), but a *list* does not. Showing "translation missing" rows in a project index makes gaps
  visible and invites help; it also adds noise for visitors who cannot act on it. Likely answer: list
  the substitute where set, and otherwise show the entry marked "only in English" so the content stays
  discoverable — but worth deciding with a real project in front of us.
- **Backfill when a language is added to a project.** Adding a language should offer to fetch sibling
  snapshots for already-imported library items. Automatic, or an explicit admin action with a progress
  report? Automatic risks a long blocking request on a large library.

## Verification

- **M0**: `npm run dev` starts hapi + Vite; the SPA shows the fixed dev user; creating a project and
  article persists to SQLite.
- **M1**: search Wikipedia in the Wiki world tab, import a result, confirm it appears in My Library
  with correct license/attribution and a sanitized preview that renders without console errors.
- **M2**: set a project's languages to `fi` + `en`; confirm an article cannot be created in a language
  outside that set. Create a Finnish translation of an English article and confirm both belong to one
  translation group. Search from the Finnish version and confirm it queries `fi.wikipedia.org`. Import
  `en:Watermill` and confirm `fi:Vesimylly` is imported alongside it sharing
  `concept_id = wikidata:Q185187`, and that the Finnish snapshot's links point at `fi.wikipedia.org`,
  not `en`. View a group with no Finnish version and confirm the "maybe you could help?" invitation;
  set a substitute article and confirm that version is shown instead, marked as another language.
- **M3**: write an article referencing a library item, add items to the Tail with commentary,
  drag-reorder, publish; confirm the Finnish article's Tail renders the Finnish snapshot.
- **M4**: load the public browse URL in a mobile viewport with no `mail` header — drafts hidden,
  published article + Tail render, external links open in a new tab; switch UI language and confirm
  both the chrome and the article version change, with fallback where a translation is missing.
- **M5**: import a Commons image; confirm the binary lands under `uploads/` with a `local_files` row
  and displays in both editor and browse view.
