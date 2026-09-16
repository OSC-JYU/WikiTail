# Wikitail — Implementation Plan

Status: **M0-M5 complete**, with all four sources built. The deferred snapshot-refresh
question remains open.

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
- **External sources**: Wikipedia (REST HTML, never wikitext parsing), Wikimedia Commons and Finna,
  all behind one adapter interface. **Restricted material is never re-hosted**: Finna aggregates
  archives and museums whose records carry every rights status there is, so a file is copied only
  where the licence plainly allows redistribution and is otherwise kept as a link.
- **Language**: TypeScript across server and client, with a shared types package.
- **Publishing**: articles have a draft/published state; any author publishes their own article (no
  admin approval). Only published articles appear in public browse.
- **Tail is not comments**: only the article's author curates Tail entries (library item + optional
  commentary); no visitor-facing interaction.
- **The library belongs to an article**, not to a person: several people may work on one project, so
  material gathered for an article is visible to all of them. It hangs off the *translation group*, so
  the language versions of an article share one library — which is what lets a tail entry resolve to
  the reader's language and a copied tail keep working.
- **Hard copies or live links, per project.** Wikipedia permits framing, and renders its own article
  far better than a sanitized copy can while always being current — so by default a project stores
  only what is needed to link to an article, and readers get the live page in a dialog. A project that
  wants an archive of what it cited can switch to hard copies, which also store the text and the
  revision it was taken from. Media is copied either way: that is about not hotlinking, not archiving.
- **Licensing**: every item stores licence, author and source so it can be credited the way Creative
  Commons asks (title, author, source, licence). Imported work keeps the licence and credit of its
  source — those are not ours to restate — while uploads carry a licence the uploader chooses,
  defaulting to CC BY. Authors may add their own caption to any item, including imported ones.
- **External links** open in a new tab so a reader does not lose their place. The exception is
  Wikimedia links, which open in a dialog over the article: they are the only ones that can actually
  be framed, and on a phone especially a new tab loses the reader's position in the feed. Modified
  clicks (ctrl, cmd, middle) are left alone — the reader has asked for a tab.
- **Multilingual**: each **project declares its set of languages**; articles may only be written in
  those, and imports fetch exactly those language versions. The same article can exist as linked
  language versions, matched across wikis by Wikidata concept id. Providing every language is the
  author's job: a version that has not been written is reported as missing, never replaced by another
  language. Language codes are free-form ISO codes — no fixed set, no DB enum. The UI is translatable,
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
         snapshot_mode CHECK IN ('hard_copy','live_link') DEFAULT 'live_link',
         created_by REFERENCES users(id), created_at)

project_languages(project_id NOT NULL REFERENCES projects(id),
                  language TEXT NOT NULL,          -- free-form ISO code, no CHECK constraint
                  position INTEGER NOT NULL,       -- position 0 is the project's primary language
                  PRIMARY KEY (project_id, language))

translation_groups(id PK, project_id NOT NULL REFERENCES projects(id), created_at)

articles(id PK, project_id NOT NULL REFERENCES projects(id), slug, title,
         language TEXT NOT NULL,                   -- must be one of the project's languages
         translation_group_id NOT NULL REFERENCES translation_groups(id),
         body_markdown TEXT NOT NULL DEFAULT '', status CHECK IN ('draft','published') DEFAULT 'draft',
         created_by REFERENCES users(id), created_at, updated_at,
         UNIQUE(project_id, language, slug),       -- slugs differ per language; collisions allowed across languages
         UNIQUE(translation_group_id, language))   -- at most one version per language

library_items(id PK,
              translation_group_id NOT NULL REFERENCES translation_groups(id),  -- the article library
              description,                         -- the author's own caption
              author,                              -- creator of the work, for citation
              source_type CHECK IN ('wikipedia','wikidata','commons','finna','local_upload'),
              external_id, external_url, source_revision,
              language TEXT,                       -- NULL for language-neutral items (e.g. a Commons image)
              concept_id TEXT,                     -- e.g. 'wikidata:Q185187'; links language versions
              title NOT NULL, snapshot_html TEXT, snapshot_json TEXT,
              local_file_id NULL REFERENCES local_files(id),
              license_name, license_url, attribution_text,
              imported_at NOT NULL, imported_by NOT NULL REFERENCES users(id), created_at,
              UNIQUE (translation_group_id, source_type, external_id))

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
- `translation_groups` is a table rather than a shared id on `articles`. It briefly carried the
  author's substitute choice, which justified it; that is gone, so it now holds only the grouping. It
  stays because it gives `articles.translation_group_id` a real foreign key to point at — a pragmatic
  call now rather than a principled one.
- A project's primary language is `position = 0` in `project_languages`, so there is a single source
  of truth rather than a `default_language` column that could drift out of the set. The set must be
  non-empty; the project's own title and description stay single-valued (projects themselves are not
  translated — see [Decisions](#decisions)).
- Article bodies reference library content via a `[[library:N|label]]` shortcode; markdown stays the
  single source of truth. The id resolves and the label is ignored when looking up, so it can go stale
  harmlessly — it is there to keep the raw markdown readable and to say what a body meant if the
  library row behind it is ever lost. A bare `[[library:N]]` stays valid.
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

### Missing translations are reported, not papered over

Providing an article in every one of the project's languages is the author's job. When a group has no
version in the language being read, the reader is told so — "Translation missing — maybe you could
help?" — and for a signed-in author that doubles as a link straight to writing it. A missing version
is never silently replaced by another language, so the gap stays visible and the invitation to fill
it stays honest.

The same applies in listings: a group with no version in the reader's language still appears, marked
with the languages it does exist in, rather than disappearing.

This is separate from *imported* content: a Wikipedia article may genuinely not exist in some
language, and there the tail falls back to the version that was imported, labelled with its language.

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

### M2 — Language foundations ✅ done

`project_languages` with an ordered language set and admin UI to manage it; article `language` +
`translation_groups` with per-language slugs and authoring constrained to the project's languages;
language-aware adapter search; Wikidata Q-id + langlink capture on import, auto-importing siblings for
the project's languages; language passed through the Wikipedia client and sanitizer; the
missing-translation notice. UI for creating a translation of an existing article and switching between
versions. **Deliverable**: the same article exists in Finnish and English, importing a Wikipedia page
brings in both language versions linked by concept, and a group with a missing version shows the
invitation to translate.

Sequenced before the editor and browse work deliberately: `articles.language` is schema-level, and
Tail resolution and the public browse view both need to know an article's language. Retrofitting it
after those exist means reworking their queries and rendering rather than just adding a migration.

Implementation notes:

- Migrations now toggle `foreign_keys` off around the whole run and check
  `PRAGMA foreign_key_check` after each one. SQLite cannot alter constraints in place, so `articles`
  had to be rebuilt (create → copy → drop → rename) to change its UNIQUE constraints and add a NOT
  NULL column carrying a REFERENCES clause — and the pragma is a no-op inside a transaction.
- `resolveSiblings()` is an optional adapter method: re-importing a page that is already in the
  library skips re-fetching its content, but must still resolve siblings, because the project may have
  gained a language since. It is a single cheap JSON call rather than re-downloading ~260KB of HTML,
  and it backfills `concept_id` on rows imported before concepts existed.
- Removing a project language that articles are written in is rejected rather than orphaning them.
- The sanitizer's hardcoded wiki host is fixed: snapshots now resolve links against their own
  language's wiki (verified — a `fi` snapshot links only to `fi.wikipedia.org`).

### M3 — Editor and Tail curation ✅ done

Markdown editor (`markdown-it`, `html: false`) with live preview and `[[library:N]]` embeds;
`TailEditor.vue` with drag-reorder; `tail_entries` CRUD, resolving each entry to the library item
matching the article's language. **Delivered**: full authoring loop — article references library
items, Tail curated with commentary, article publishable.

Implementation notes:

- Markdown renders on the client only, so there is one implementation for both the editor preview and
  (in M4) browse. `markdown-it` moved from the server, which no longer renders anything.
- Rather than injecting components into `v-html`, the body is split into markdown runs and embeds
  (`splitArticleBody` in `shared`), each rendered in its own way. Embeds are block-level: a shortcode
  inside a list item will not render as part of that list.
- Tails are **per article version**, not per translation group, because commentary is written in a
  language — a shared tail would show Finnish notes to English readers. To avoid re-curating the same
  list per language, creating a translation offers to copy the source tail: the entries and their
  commentary come across, and because items resolve at read time, they follow the new language
  automatically. Only the notes need translating.

### M4 — Public browse view (mobile-first) + UI translation ✅ done

`public` routes (`auth: false`, published only); `BrowseArticleView` + `ArticleFeed`/`TailItemCard`;
mobile-first layout. `vue-i18n` with locale files and a language switcher, with the chosen locale
selecting content language and falling back to the project default. **Deliverable**: an anonymous
visitor browses home → project → article + Tail on a phone viewport in either language, with external
links opening in a new tab.

Implementation notes:

- Public browsing lives at the root (`/`, `/p/:project`, `/p/:project/:language/:article`); authoring
  moved under `/admin`. The site a visitor lands on is the public one.
- **Public article URLs carry the language**, because slugs are unique per
  `(project, language)` — the Finnish and English "Ilokivi" share the slug `ilokivi`, so a slug alone
  cannot identify a version. This also makes a shared link keep its language.
- A library item is public only while some *published* article shows it, in its tail or embedded in
  its body; the library itself stays private. Verified: an item that appears only in drafts 404s.
- Body embeds resolve to the article's language the same way tail items do.
- Language codes are shown through `Intl.DisplayNames`, so a Finnish reader sees "englanti" rather
  than "en".

### M5 — Polish, Commons, Finna and local uploads ✅ done

Commons adapter (chosen over Wikidata as the second *content* source — it exercises the binary media
path via `local_files`, validating the interface for media and not just text) + `CommonsTab.vue`
✅ done, along with the Local tab for uploading your own files and admin role management.

Commons implementation notes:

- **A scaled rendering is imported, not the original.** Commons originals run to 4–8MB for a single
  photo, and a page never needs that; `COMMONS_IMAGE_WIDTH` (1600 by default) picks the rendering and
  the original stays linked as the source. `MAX_IMPORT_BYTES` caps it either way, checked against the
  declared Content-Length before transferring and against the received bytes afterwards.
- **Licences are per file, not per wiki.** Unlike Wikipedia, where one licence covers the site,
  Commons files carry their own (CC BY-SA 4.0, CC0, CC BY-SA 3.0 all appeared in the first three
  results), so licence, author and description come from each file's `extmetadata`.
- That metadata is **HTML** — the artist field is usually a link — so it is sanitized to text before
  going into an attribution line.
- Commons files are **language-neutral**: `language` is null and there are no sibling versions, which
  the schema and tail resolution already allowed for.
- Media is written to `uploads/<2 chars>/<uuid>.<ext>` and served by the existing `/uploads` route;
  the name is random because an uploader-supplied one could collide or escape the directory.

Local upload notes:

- Uploads are **streamed to disk**, not buffered — a video can be hundreds of megabytes. hapi rejects
  anything over `MAX_UPLOAD_BYTES` before it reaches the handler, and a failed write leaves no stray
  file behind.
- The accepted types are a **narrow allowlist**, and SVG is deliberately excluded: these files are
  served from the app's own origin, and an SVG can carry script.
- Commons can still bring in an SVG, so `/uploads` responses also carry
  `Content-Security-Policy: sandbox; default-src 'none'` and `X-Content-Type-Options: nosniff`.
  Navigating straight to an uploaded file therefore cannot execute anything in our origin.
- Roles are managed in the app, not by the SSO proxy, which supplies identity only. An admin cannot
  demote themselves — that is nearly always a slip, and it could leave an instance with nobody able
  to create projects.

Finna notes:

- Searches use `free_online_boolean` and `~format_ext_str_mv:"0/Image/"`, because plenty of Finna
  records are catalogue entries with no file attached.
- **A file is copied only where the licence plainly allows redistribution** — CC0, PDM, CC BY, CC
  BY-SA and CC BY-ND, the last because ND still permits redistributing a *verbatim* copy and Finna's
  own rendering is stored unaltered. Anything else (InC, CNE, NonCommercial when a project opts out)
  is imported as a reference: title, credit and a link to Finna, with no local file. Each search
  result says which it will be before the author chooses.
- NonCommercial is copied in by default — it still requires attribution and forbids commercial use,
  which is the situation a wiki project is normally in. It is a per-project setting
  (`finnaAllowNonCommercial`, managed on the project page) rather than a global one: only the
  operator of a given project knows whether their deployment is commercial.
- Finna's terms ask for the creator **and** the holding organisation, so the credit names both.

### M6 — Static site export (planned)

Export a project as plain files that any web server can host, so the editor runs
locally — on an author's machine — and only the built site is published. Nothing
public to attack, nothing public to keep patched, and a folder that can be backed
up or handed to an archive.

**Why this fits.** Most apps cannot be exported this way because their public side
does something per visitor. Wikitail's does not: browsing is read-only by design,
there are no comments, accounts or likes, and authentication exists only for
editing. Media is already copied to disk rather than hotlinked, so an export is
self-contained. The public API surface is small and already computes exactly what
a reader needs — `listProjectContent`, `getArticle`, `getLibraryItem` — so an
exporter can call those services directly rather than through HTTP.

**Shape.**

- A command in the server package (`npm run export -- --project <slug> --out <dir>`)
  reusing the public service functions; no running server required.
- **Pre-rendered HTML per page**, not the SPA plus a JSON dump. It costs more to
  build, but the result reads without JavaScript, survives bundler rot, and is
  what a local-history archive should still be in fifteen years. JavaScript stays
  for enhancement only — the image and article dialog, which degrades to a plain
  link without it.
- Real directories per route (`/p/<project>/<language>/<slug>/index.html`) rather
  than history-mode routing, so no server rewrite rule is needed and the site
  works on anything, including a plain file host.
- `uploads/` copied across; a configurable base path so it can live in a
  subdirectory.
- Only published articles, which is already the public rule. The
  "write this translation" call to action degrades to the plain missing-translation
  notice, since there is no editor to link to.

**This makes hard copies worth more than they look.** An exported site on live
links still depends on Wikipedia being reachable when a reader opens a dialog;
one on hard copies is genuinely self-contained. The two settings serve different
goals — live links keep the working database small, hard copies make an export
survive on its own — so a project aiming at a published archive may well want to
switch before exporting, and the exporter should say so rather than let it come
as a surprise.

**Open questions.**

- **Search.** There is no server to query. A small client-side index over titles
  and article text would cover it, or the first version can simply omit search.
- **Running "locally" still means running something.** Node and SQLite on the
  author's machine — no public server, but not zero-install either. Whether that
  eventually wants packaging as a desktop app is a separate question.
- **Multiple projects per site**, or one export per project? One project per
  export is simpler and matches how the setting is scoped.
- **Incremental export** is probably unnecessary at this scale; a full rebuild is
  simpler and fast enough.

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

- **No test suite yet.** `vitest` is planned but not installed; verification so far has been manual
  plus scripted browser runs. Worth addressing before the codebase grows much further — the language
  work in M2 adds fallback and resolution logic that is exactly the kind of thing tests should pin
  down.
- **Images inside Wikipedia snapshots are still hotlinked.** Commons files imported through the
  Commons tab are stored locally, but an imported Wikipedia *article* keeps its `<img>` tags pointing
  at `thumb.wikimedia.org`, so such an article is not fully offline-independent.
- **No Tailwind.** The plan called for it; the UI currently uses plain scoped CSS per component.
  Revisit when the mobile-first browse view (M3) makes a utility system worth its weight.
- **Snapshot refresh is unbuilt by design**, and matters less now: projects on live links have
  nothing to refresh. For hard copies, `source_revision` and `external_url` are stored so re-fetching
  remains possible; when and how to refresh is still open.
- **Only implemented editor tabs are rendered.** Commons/Finna/Local appear as their adapters land,
  rather than sitting disabled.

## Open questions

- Exact upload size limits — current defaults are placeholders.
- Whether a derived `article_library_links` table is needed for "where is item X used" queries.
- **Translating an existing article**: the tail can now be copied (see below), but the *body* still
  starts blank. Pre-fill it with the source language's markdown as a starting point for the
  translator, or keep translators writing from scratch?
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
  confirm the listing still shows the article, marked with the language it does exist in.
- **M3**: write an article referencing a library item, add items to the Tail with commentary,
  drag-reorder, publish; confirm the Finnish article's Tail renders the Finnish snapshot.
- **M4**: load the public browse URL in a mobile viewport with no `mail` header — drafts hidden,
  published article + Tail render, external links open in a new tab; switch UI language and confirm
  both the chrome and the article version change, with fallback where a translation is missing.
- **M5**: import a Commons image; confirm the binary lands under `uploads/` with a `local_files` row
  and displays in both editor and browse view.
