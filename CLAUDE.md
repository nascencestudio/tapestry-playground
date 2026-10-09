# CLAUDE.md: Tapestry playground

The source of truth for anyone (human or AI) working in this repo. Read it at the start of every
session and keep it current.

## What this is

The Astro + StudioCMS site used to develop, test and demo
[Tapestry](https://github.com/nascencestudio/tapestry) (`@nascencestudio/tapestry`) and the
[media library](https://github.com/nascencestudio/medialibrary) (`@nascencestudio/medialibrary`),
both by the user's business, Nascence Studio (MIT). Split out of Tapestry's monorepo on
2026-10-09 (Tapestry ADR 0038); the plugin's own rules, architecture, ADRs and gotchas are in
`../tapestry/CLAUDE.md` and `../tapestry/docs/` (read them for any plugin work).

Sibling checkouts in `/Volumes/T7/www/`: `tapestry/` (plugin), `medialibrary/`, and this repo.

This repo also holds the project's **working notes**: [docs/devlog.md](docs/devlog.md) (all
sessions, Tapestry's included), [docs/research/](docs/research/) (StudioCMS internals, Drupal
Canvas), [docs/upstream/](docs/upstream/) (issue drafts), and the deployment guide.

## Status

- Tapestry `0.1.1` and media library `0.1.1`, both from npm (Tapestry 0.1.0 came from the old
  monorepo commit; deprecate it). - Verified 2026-10-09 from this repo: typecheck, lint, audit, all 23 e2e suites (199 steps),
  production build, performance budget, Docker image (healthy, non-root, sharp works).

## Rules

1. **Security first.** pnpm only (never npm/npx/yarn; `pnpm view`). Every `pnpm-workspace.yaml`
   exception (overrides, patches, allowBuilds, ignored advisories) has a written reason and exit
   condition. Pin exact versions. New dependencies need a size/provenance/tree review (ADR in
   Tapestry's repo). `pnpm audit` must pass. No Meta libraries (React, Lexical).
2. **Document everything.** Every session: a devlog entry here (what changed, learned, next);
   decisions as ADRs in the repo they concern; surprises in Tapestry's known issues.
3. **Verify, don't assume.** StudioCMS docs lag its code; check `node_modules/studiocms` and
   record findings in docs/research/studiocms-internals.md.
4. **e2e covers editor UI.** New Tapestry or media library UI behavior gets steps here; suites
   must pass on a fresh site (CI) as well as this machine's database.
5. Upstream reports only when the user asks (only #37 approved so far: docs/upstream/).

## Layout

```
astro.config.mjs, studiocms.config.mjs ← the site; registers Tapestry (+ languages) and the media library
src/tapestry.config.mjs   ← example component definitions; src/components/tapestry/ the components
src/pages/[...slug].astro ← pages via getPage() + AdminBar; src/pages/404.astro; src/layouts/
scripts/                  ← setup-site.mjs (fresh DB), seed-demo-page.mjs + demo-document.mjs, check-budget.mjs
e2e/                      ← CDP harness (cdp.mjs), helpers, one *.e2e.mjs per suite (chain in package.json), fixtures/
perf-budget.json          ← budget for `pnpm budget`
patches/                  ← dependency patches (reasons in pnpm-workspace.yaml)
Dockerfile, compose.yaml, docker/ ← production image + Caddy (docs/guides/deployment.md)
.github/                  ← ci.yml (checks, e2e on a fresh site, budget, Docker image), dependabot, scripts/check-sharp.mjs
docs/                     ← devlog, research, upstream drafts, guides (development, deployment)
```

## Commands

| Command | What it does |
| --- | --- |
| `pnpm install` | Install (supply-chain policies enforced) |
| `pnpm dev` | Dev server, **background daemon** (`pnpm exec astro dev stop` / `status` / `logs`) |
| `pnpm migrate` | Apply StudioCMS DB migrations |
| `CMS_SETUP=1 pnpm dev` + `node scripts/setup-site.mjs` | First-time setup of a fresh DB (writes `.dev-credentials`); restart without `CMS_SETUP` |
| `pnpm seed` | (Re)create the demo Tapestry home page (running servers cache pages for 5 min) |
| `pnpm e2e` | 23 browser suites in headless Chrome (dev server running; `HEADED=1`, `E2E_SCREENSHOTS=dir`) |
| `pnpm build`, then `PORT=4600 node dist/server/entry.mjs` (with `.env` loaded) + `BASE_URL=http://127.0.0.1:4600 pnpm budget` | Performance budget |
| `pnpm typecheck` / `pnpm lint` / `pnpm audit` | `astro check` / Biome / vulnerabilities |
| `docker build --build-arg SITE_URL=… -t nascence-site .` | Production image (docs/guides/deployment.md) |

Testing unreleased plugin code: set the dependency to `file:../tapestry` (or `file:../medialibrary`),
`pnpm install`; after each `pnpm build` in that repo run `pnpm install` here (new files) and restart
the dev server. Don't commit a `file:` dependency once the package is on npm.

Login details: `.dev-credentials` (gitignored). Secrets: `.env` (gitignored, `chmod 600`).

## Site dependencies (2026-10-09)

| Package | Version | Note |
| --- | --- | --- |
| Node | ≥ 22.12 (dev and Docker: 22.23.3) | `.nvmrc` |
| Caddy (Docker) | 2.11.4 | HTTPS proxy in `compose.yaml` |
| astro / studiocms | 7.3.5 / 0.6.1 | both patched |
| @astrojs/node | 11.1.6 | SSR adapter (StudioCMS requires on-demand rendering) |
| @libsql/client | 0.18.0 | matches StudioCMS 0.6.1 |
| @astrojs/preact + preact | 6.0.5 + 10.29.8 | islands demo (Tapestry ADR 0030) |
| @studiocms/md | 0.5.0 | Markdown page type; also StudioCMS's hard-coded create-form default |
| axe-core | 4.13.0 | accessibility checks in e2e (Tapestry ADR 0034) |
| typescript | 6.0.3 | not 7 (`@astrojs/check` supports ≤ 6) |

## Gotchas

Comments in the site and e2e code that cite `docs/decisions/…`, `docs/known-issues.md` or
`docs/admin-bar.md` refer to Tapestry's repository.

- Production builds need `vite.build.cssMinify: 'esbuild'` because of a StudioCMS
  CSS bug (Tapestry's known issues #1).
- StudioCMS rejects common usernames like `admin` during setup.
- StudioCMS caches pages for 5 minutes, so direct DB writes may not show on a
  running server. Reset content through the editor (the e2e suite does).
- CDP `Input.setInterceptDrags` doesn't catch drags that start inside an iframe;
  use `page.realDrag()` (genuine mouse input), and resolve both points before pressing.
- Test drag and drop with real input, not synthetic `DragEvent`s: synthetic events
  passed while the real chip drag was broken.
- Wait for `data-tapestry-pending` to disappear from the canvas iframe before
  interacting with it in tests (a re-render moves things).
- StudioCMS has **no built-in page types**; Markdown/HTML/WYSIWYG are plugins. Its
  create form hard-codes the Markdown default, so keep `@studiocms/md` installed.
- Deleting a page without the UI: `DELETE /studiocms_api/dashboard/content/page`
  with JSON `{ id, slug }` (session cookie + same-origin `Origin`).
- Editor checks in e2e must wait for the *real* editor element; "something rendered"
  passed while the HTML editor was broken.
- Keep site CSS scoped (`.site` on `<body>`, `--site-*` variables). The dev leak that made
  this necessary (#14) is fixed by the Astro patch, but scoping is still good practice.
- **Four dependencies are patched** (`patches/`, reasons in `pnpm-workspace.yaml`, Tapestry ADR 0021):
  StudioCMS (middleware no longer imports a dashboard component, which put ~67 KB of dashboard
  CSS on every public page; no dev DB viewer; component scripts kept for `componentScripts`
  renderers, #37, the same fix Tapestry ships), Astro (dev CSS collector stops at the manifest),
  @studiocms/md (no global CSS; layouts inline `studiocms:md/styles-inline` on Markdown pages),
  @withstudiocms/sdk (user deletion, #35). After
  editing a patch run `pnpm install`; the Dockerfile copies `patches/` before installing.
- Sites need their own `src/pages/404.astro` **and** `features.dashboardConfig.inject404Route: false`;
  StudioCMS's 404 renders the whole dashboard layout for visitors (#34).
- StudioCMS's dev-toolbar DB viewer is patched out (#12); the e2e harness no longer ignores any
  console errors, and the site suite fails if a public page logs anything.
- e2e: measure drag points after a drag starts (drop zones appear and move rows), and measure
  source/target without scrolling in between (`page.center()` scrolls). Canvas markers are
  `display: contents`: click `[data-tapestry-node="x"] > *`, not the marker.
- To check what a public page ships: production build, `node dist/server/entry.mjs` on another
  port, `curl` the page logged out and list `<link>`/`<style>`/`<script>` tags (dev output is
  not representative). To trace why a module is in a page's graph, a temporary Vite plugin
  replaying Astro's walk (`getModuleInfo` importers, page boundaries) works well (devlog session 14).
- Don't poll the SQLite DB while StudioCMS is saving (rollback journal → save fails with
  400). e2e `saveAndWait()` waits for the save response instead.
- StudioCMS toasts cover the editor toolbar briefly; e2e `page.click()` waits until
  the target isn't covered.
- Toolbar menus (text style, alignment) are menu buttons, not `<select>`s; in e2e open
  them with a click on `[data-tapestry-format="heading|align"]` and pick
  `[data-tapestry-menu-item="…"]`; the current value is the button's `data-value`.
  CDP `Input.dispatchKeyEvent` Enter doesn't "click" buttons, so handle Enter/Space
  explicitly on custom controls.
- Rich text e2e: set the caret with a DOM `Range` + wait ~60 ms (ProseMirror syncs on
  `selectionchange`); toolbar buttons keep focus via `mousedown` `preventDefault`.
- Media upload limits and the SVG switch are **runtime** settings (`loadMediaSettings()`),
  not `config.limits`; the build-time options are only defaults and the ceiling. Caddy's
  `max_size` follows `MEDIA_MAX_UPLOAD_MB`. e2e must not assume an empty media library:
  count only the items a suite adds.
- The media library resolves sharp at runtime from its install location (a bundled sharp can't find
  its binary, #30); the CI docker job checks it in the image (`.github/scripts/check-sharp.mjs`).
- e2e suites must also pass on a **fresh** site (CI): don't assume history, extra content, or
  that a save request happens when nothing changed. Test that with a scratch DB, a second dev
  server (`astro dev --port 4500 --ignore-lock`) and `SITE_URL=http://localhost:4500` (#31),
  plus `CREDENTIALS_FILE`/`BASE_URL`, so the real `.dev-credentials` isn't overwritten.
- Behind a proxy, Astro's `security.allowedDomains` must list the site's domain (`SITE_URL`
  at build) or every same-origin check fails. Docker builds need `--build-arg SITE_URL`
  (Compose passes it from `SITE_DOMAIN`).
- In e2e, CDP's simulated Enter doesn't submit forms or click buttons; click the button.
  Upload files with `DOM.setFileInputFiles` (absolute paths without `..`).
- Accessibility: new editor UI states belong in `e2e/a11y.e2e.mjs`. StudioCMS's success/warning/
  danger colors are background colors: don't use them as text (status pills use a border + dot;
  `--tp-danger` is Tapestry's own text-safe red per theme).
- StudioCMS stores the dashboard theme per user on the server when `data-theme` changes, and the
  canvas iframe follows the dashboard's `color-scheme`. Scripts that switch the theme (screenshots)
  must switch it back, or the canvas suite's parity check fails.
- The settings panel is sticky and can be the tallest column: selecting another component can
  change the page height and shift everything (scroll clamps). In e2e, select before measuring.
- e2e: `page.realDrag()` resolves the target after pressing; resolve both points beforehand and
  don't scroll (not even the outer page) after the first one. `waitFor` callbacks should return
  booleans, not elements (an `<option>` never came back truthy).
