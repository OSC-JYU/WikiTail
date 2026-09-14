# Wikitail — Implementation Plan

Status: **M0 and M1 complete.** M2 is next.

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

articles(id PK, project_id NOT NULL REFERENCES projects(id), slug, title,
         body_markdown TEXT NOT NULL DEFAULT '', status CHECK IN ('draft','published') DEFAULT 'draft',
         created_by REFERENCES users(id), created_at, updated_at, UNIQUE(project_id, slug))

library_items(id PK, owner_id NOT NULL REFERENCES users(id),
              source_type CHECK IN ('wikipedia','wikidata','commons','finna','local_upload'),
              external_id, external_url, source_revision,
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

Indices: `articles(project_id)`, `articles(status)`, `library_items(owner_id)`,
`library_items(source_type, external_id)`, `tail_entries(article_id, position)`.

- `main_article_id` circularity: create project (NULL) → create its article → `UPDATE projects`.
- Article bodies reference library content via a `[[library:N]]` shortcode resolved by a `markdown-it`
  plugin at render time; markdown stays the single source of truth.
- Duplicate library items within one article's Tail are allowed (independent rows, own commentary).
- Tail ordering is manual (`position` integer), reorderable by drag-and-drop.
- Snapshot HTML/JSON live in SQLite `TEXT`; binary media goes to disk under `uploads/`.
- Wikipedia `external_id` is namespaced `{lang}:{title}` for future multi-language support.

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

### M2 — Editor and Tail curation ⬅ next

Markdown editor (`markdown-it`, `html: false`) with live preview and the `[[library:N]]` shortcode
plugin; `TailEditor.vue` with drag-reorder; `tail_entries` CRUD. **Deliverable**: full authoring loop
— article references library items, Tail curated with commentary, article publishable.

### M3 — Public browse view (mobile-first)

`public` routes (`auth: false`, published only); `BrowseArticleView` + `ArticleFeed`/`TailItemCard`;
mobile-first layout. **Deliverable**: an anonymous visitor browses home → project → article + Tail on
a phone viewport, with external links opening in a new tab.

### M4 — Polish and second adapter

Commons adapter (chosen over Wikidata first — it exercises the binary media path via `local_files`,
validating the interface for media and not just text) + `CommonsTab.vue`; admin role management;
upload size limits; loading/error states.

## Package choices

- **hapi**: `@hapi/hapi`, `@hapi/inert`, `@hapi/boom`, `joi` for route validation.
- **HTML sanitization**: `sanitize-html` (server-side allowlist; no DOM post-processing needed).
- **SQLite**: `better-sqlite3` (synchronous, prepared statements, no ORM).
- **Markdown**: `markdown-it` with `html: false`, plus a `[[library:N]]` shortcode plugin (M2).
- **Uploads**: hapi's built-in multipart streaming to disk under `uploads/` with a
  `crypto.randomUUID()` filename. Default limits: images 20MB, audio 100MB, video 500MB.
- **Client**: plain `fetch` wrappers; `vue-draggable-plus` for Tail drag-reorder (M2).
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
  plus scripted browser runs. Worth addressing before the codebase grows much further.
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
- Multi-language Wikipedia in the UI (the data model already supports it via `{lang}:{title}`).
- Whether a derived `article_library_links` table is needed for "where is item X used" queries.

## Verification

- **M0**: `npm run dev` starts hapi + Vite; the SPA shows the fixed dev user; creating a project and
  article persists to SQLite.
- **M1**: search Wikipedia in the Wiki world tab, import a result, confirm it appears in My Library
  with correct license/attribution and a sanitized preview that renders without console errors.
- **M2**: write an article referencing a library item, add items to the Tail with commentary,
  drag-reorder, publish.
- **M3**: load the public browse URL in a mobile viewport with no `mail` header — drafts hidden,
  published article + Tail render, external links open in a new tab.
- **M4**: import a Commons image; confirm the binary lands under `uploads/` with a `local_files` row
  and displays in both editor and browse view.
