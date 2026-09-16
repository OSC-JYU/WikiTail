# Wikitail

Wikitail is a self-hosted, local extension of Wikipedia: authors write markdown articles and enrich
them with material imported from Wikipedia, Wikimedia Commons, Wikidata and Finna.fi. Each article
carries a curated "Tail" of that material, which the public browses as a mobile-first feed.

See [`idea.md`](idea.md) for the concept and [`docs/implementation-plan.md`](docs/implementation-plan.md)
for the architecture and current status.

## Requirements

- Node.js 22 (tested on 22.22) and npm 9+
- No database server — data lives in a local SQLite file

## Install

```bash
git clone <repo-url> wikitail
cd wikitail
npm install
```

The repo is an npm workspace, so a single `npm install` at the root covers the server, client and
shared packages.

## Run in development

```bash
npm run dev
```

This starts both halves side by side:

- API (hapi) on <http://localhost:3000>
- Client (Vite) on <http://localhost:5173> — **open this one**

Vite proxies `/api` and `/uploads` to the API, so the app works from port 5173 alone. The SQLite
database and migrations are created on first start; uploads land in `packages/server/uploads/`.

### Logging in

Development defaults to `AUTH_MODE=dev`: every request is the single fixed user
`dev@wikitail.local`, who is also an admin, so you can create projects without any setup. In
production the app instead runs behind an SSO/reverse proxy and trusts a `mail` header
(`AUTH_MODE=header`).

### Configuration

Every setting has a working default, so no configuration is needed to get started.
[`.env.example`](.env.example) documents what can be changed — port, auth mode, admin emails,
database and uploads paths, default language, the Wikipedia user agent and the import size limits.

Nothing loads a `.env` file automatically; export the variables in your shell instead:

```bash
PORT=4000 DEFAULT_LANGUAGE=fi npm run dev
```

To start over, stop the server and delete `packages/server/data/wikitail.db`.

base path
podman build --build-arg VITE_BASE_PATH=/s/wikitail/ -t localhost/wikitail:latest .

## Other commands

| Command                             | What it does                                             |
| ----------------------------------- | -------------------------------------------------------- |
| `npm test`                          | Server test suite (vitest)                               |
| `npm run lint`                      | ESLint over the whole repo                               |
| `npm run format`                    | Prettier, writing in place                               |
| `npm run build`                     | Type-check and build server + client                     |
| `npm run start -w @wikitail/server` | Run the built server, which also serves the built client |




## Layout

```
packages/server   hapi JSON API, SQLite, source adapters (Wikipedia, Commons, Wikidata, Finna)
packages/client   Vue 3 SPA (Vue Router, Pinia, vue-i18n), built with Vite
packages/shared   TypeScript types shared by both
```
