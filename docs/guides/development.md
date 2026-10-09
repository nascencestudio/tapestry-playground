# Development setup (the playground)

## Prerequisites

- Node ≥ 22.12 (`.nvmrc` says 22)
- pnpm ≥ 12 (`corepack enable` or install pnpm directly). **Never use npm or yarn here.**

## First-time setup

```sh
# 1. Install (Tapestry and the media library from npm). Supply-chain policies run
#    automatically; see Tapestry's docs/security.md.
pnpm install

# 2. Create the env file with a fresh encryption key.
cp .env.example .env
# put the output of `openssl rand --base64 16` into CMS_ENCRYPTION_KEY
chmod 600 .env

# 3. Create the database schema (local SQLite file: studiocms.db).
pnpm migrate

# 4. Start the dev server (Astro 7 runs it as a background daemon).
pnpm dev
```

For a **fresh database**, also complete StudioCMS's first-time setup. The setup routes
exist only while the dev server runs with `CMS_SETUP=1`:

```sh
CMS_SETUP=1 pnpm dev
node scripts/setup-site.mjs     # creates the site and owner "tapestry-dev", writes .dev-credentials
pnpm exec astro dev stop && pnpm dev
```

(Or open http://localhost:4321/start while `CMS_SETUP=1` and fill in the wizard;
common usernames like `admin` are rejected.) CI does the same (ADR 0020).

Then seed the demo page and open the site:

```sh
pnpm seed          # creates/resets the "index" Tapestry page
open http://localhost:4321/
open http://localhost:4321/dashboard
```

The existing local dev login is in `.dev-credentials` (gitignored).

## Daily workflow

| Task | Command |
| --- | --- |
| Use a local Tapestry checkout | `"@nascencestudio/tapestry": "file:../tapestry"` in package.json, `pnpm install`; after each `pnpm build` there, `pnpm install` here and restart the dev server. Same for `../medialibrary`. Switch back to the npm version before committing. |
| Type-check everything | `pnpm typecheck` |
| Lint / format | `pnpm lint` / `pnpm format` |
| Dev server status / logs / stop | `pnpm exec astro dev status` (or `logs`, `stop`) |
| Production build + run | `pnpm build`, `set -a; . ./.env; set +a; node dist/server/entry.mjs` |
| Security audit | `pnpm audit` |
| Browser e2e (dev server must be running) | `pnpm e2e` (`HEADED=1` to watch, `E2E_SCREENSHOTS=/some/dir` for screenshots) |
| Performance budget (production server) | `pnpm build`, `PORT=4600 node dist/server/entry.mjs` (with the `.env` loaded), then `BASE_URL=http://localhost:4600 pnpm budget` |

## Page types in the playground

StudioCMS has no page types of its own; each comes from a plugin. The playground
registers **Markdown** (the official StudioCMS plugin, also the create form's
hard-coded default) and **Tapestry**. Both render through the same `getPage()` route
and get the admin bar. Only Tapestry pages have the visual canvas. The HTML and
WYSIWYG plugins were tried and removed (HTML: used only as a reference, needed a local
patch to save; WYSIWYG: security advisories, broken rendering).

## Media library

The playground registers `@nascencestudio/medialibrary`. Dashboard → **Media** lists
uploads (stored in `data/media`, gitignored); the Hero component's
"Background image" and the Text toolbar's "Insert media" button open the same library
as a picker. Supported files and limits: [the media library README](https://github.com/nascencestudio/medialibrary).
For production, see [deployment.md](deployment.md).

## Editing a Tapestry page

How the editor works, step by step: Tapestry's
[development guide](https://github.com/nascencestudio/tapestry/blob/main/docs/guides/development.md#editing-a-tapestry-page).

## Browser e2e tests

`pnpm e2e` drives headless Chrome over the DevTools protocol (no extra
dependencies; see ADR 0008). It needs the dev server on :4321 and a completed
StudioCMS setup; it logs in with `.dev-credentials` (or
`TAPESTRY_E2E_USER` / `TAPESTRY_E2E_PASSWORD`). It resets the demo home page
through the editor before and after, so it's safe to re-run. Set `CHROME_PATH`
if Chrome isn't in the default location.

## Adding a dependency

```sh
pnpm add <dep>          # exact version saved automatically
```

If the install fails a supply-chain check, **investigate, don't bypass**:
check `pnpm view <pkg> time` and the provenance (`dist.attestations`), then
document any exception in `pnpm-workspace.yaml` (inline reason) and the devlog.

## Troubleshooting

| Symptom | Cause / fix |
| --- | --- |
| `ERR_PNPM_VERIFY_DEPS_BEFORE_RUN` | `package.json` changed. Run `pnpm install`. |
| `ERR_PNPM_IGNORED_BUILDS` | A new dependency wants an install script. Decide, then add it to `allowBuilds` (true or false) with a comment. |
| Trust downgrade error | See ADR 0003; check provenance history before adding any exception. |
| `Unknown at rule: @keyframes` in build | StudioCMS CSS bug. Keep `cssMinify: 'esbuild'` in `astro.config.mjs`. |
| Playground doesn't reflect plugin changes | Rebuild the plugin (`dist/` is what's consumed). |
| `No rendering plugins found` | StudioCMS needs at least one page-type plugin; Tapestry counts. |
| `pnpm seed` changes don't show | StudioCMS caches pages for 5 minutes. Restart the dev server, or edit through the dashboard. |
| Dashboard looks wrong in light mode (dark background, invisible text) in dev | Unscoped site CSS leaking into the dashboard (known issue #14). Scope site styles; see "Site CSS and the StudioCMS dashboard" in the defining-components guide. Restart the dev server. |
| Canvas says the route "doesn't support the canvas" | The site's page route must load pages with `getPage()` (see Tapestry's docs/admin-bar.md). |
| Canvas stays blank | The dashboard must be allowed to frame the site: same origin, no `X-Frame-Options: DENY` or `frame-ancestors 'none'` for editors. |
| Editor shows the old UI after plugin changes | Rebuild the plugin, then restart the dev server (`astro dev stop`, `pnpm dev`) so Vite picks up the new `dist/`. |
