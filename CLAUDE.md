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

- `main`: all from npm (Tapestry `0.4.0`, media library `0.2.0`, tapestry-seo `0.2.0`); on GitHub with
  rulesets. Our packages are in `minimumReleaseAgeExclude`.
- Local branches waiting for releases: `templates` (Tapestry 0.5.0, templates suite) and `menus` (on top:
  Tapestry 0.6.0 hooks + `@nascencestudio/tapestry-menus` 0.1.0, `menus` suite, menu states in a11y; then
  `@nascencestudio/ipguard` and `@nascencestudio/webforms` 0.1.0 with their suites and a11y states).
  They use `file:../tapestry`, `../tapestry-menus`, `../ipguard` and `../webforms`, **uncommitted** in
  package.json and the lockfile (with the e2e chain's new suites; studiocms.config already imports them):
  switch to the npm versions once released, run every suite, then commit.
- 0.2.0 of the media library migrated the dev media directory one way (backup in
  `backups/2026-10-09-before-folders/`, gitignored).

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
astro.config.mjs, studiocms.config.mjs ← the site; registers Tapestry (+ languages, menu components), the media library, SEO, Menus
src/tapestry.config.mjs   ← example component definitions; src/components/tapestry/ the components
src/pages/[...slug].astro ← pages via getPage() + AdminBar; src/pages/404.astro; src/layouts/ (Layout: <Seo> from tapestry-seo, <Region> header/footer, styles for menus)
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
| `pnpm dev` | Dev server in the background (`astro dev --background`; `pnpm exec astro dev stop` / `status` / `logs`) |
| `pnpm migrate` | Apply StudioCMS DB migrations |
| `CMS_SETUP=1 pnpm dev` + `node scripts/setup-site.mjs` | First-time setup of a fresh DB (writes `.dev-credentials`); restart without `CMS_SETUP` |
| `pnpm seed` | (Re)create the demo Tapestry home page (running servers cache pages for 5 min) |
| `pnpm e2e` | 30 browser suites in headless Chrome (dev server running; `HEADED=1`, `E2E_SCREENSHOTS=dir`, `E2E_CPU_THROTTLE=4` to run like a slow CI runner) |
| `pnpm build`, then `PORT=4600 node dist/server/entry.mjs` (with `.env` loaded) + `BASE_URL=http://localhost:4600 pnpm budget` | Performance budget |
| `pnpm typecheck` / `pnpm lint` / `pnpm audit` | `astro check` / Biome / vulnerabilities |
| `docker build --build-arg SITE_URL=… -t nascence-site .` | Production image (docs/guides/deployment.md) |

Testing unreleased plugin code: set the dependency to `file:../tapestry` (or `file:../medialibrary`),
`pnpm install`; after each `pnpm build` in that repo run `pnpm install` here (new files) and restart
the dev server. Don't commit a `file:` dependency once the package is on npm.

Login details: `.dev-credentials` (gitignored). Secrets: `.env` (gitignored, `chmod 600`).

## Site dependencies (2026-10-22)

| Package | Version | Note |
| --- | --- | --- |
| Node | ≥ 22.12 (dev and Docker: 22.23.3) | `.nvmrc` |
| Caddy (Docker) | 2.11.4 | HTTPS proxy in `compose.yaml` |
| astro / studiocms | 7.4.1 / 0.7.0 | StudioCMS patched (Astro 7.4 fixed the dev CSS leak itself) |
| @astrojs/node | 11.1.9 | SSR adapter (StudioCMS requires on-demand rendering) |
| @libsql/client | 0.18.0 | matches StudioCMS 0.7.0 |
| @astrojs/preact + preact | 6.1.0 + 10.29.8 | islands demo (Tapestry ADR 0030) |
| @studiocms/md | 0.5.1 | Markdown page type; also StudioCMS's hard-coded create-form default |
| satteri | 0.10.5 | StudioCMS 0.7's Markdown parser, direct + external so production finds its binary (#41) |
| axe-core | 4.14.0 | accessibility checks in e2e (Tapestry ADR 0034) |
| typescript | 6.0.3 | not 7 (`@astrojs/check` supports ≤ 6) |

## Gotchas

Comments in the site and e2e code that cite `docs/decisions/…`, `docs/known-issues.md` or
`docs/admin-bar.md` refer to Tapestry's repository.

- Production builds need `vite.build.cssMinify: 'esbuild'` because of a StudioCMS
  CSS bug (Tapestry's known issues #1).
- StudioCMS 0.7's Markdown parser `satteri` is a direct dependency and external in the server build
  (`vite.ssr.external`), or production can't find its native binary (Tapestry known issue #41). Keep its
  version equal to StudioCMS's. Only a production build shows this.
- The budget's `BASE_URL` is `http://localhost:4600` (the `SITE_URL` host): since Astro 7.4 a `Host` not in
  `security.allowedDomains` makes the request URL `localhost:<port>`, so a login sent from `127.0.0.1`
  fails the same-origin check (403). Use the `SITE_URL` host for anything that POSTs to a production server.
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
  this necessary (#14) is fixed in Astro 7.4 (our patch for it is gone), but scoping is still good practice.
- **Three dependencies are patched** (`patches/`, reasons in `pnpm-workspace.yaml`, Tapestry ADR 0021):
  StudioCMS (middleware no longer imports a dashboard component, which put ~67 KB of dashboard
  CSS on every public page; no dev DB viewer; component scripts kept for `componentScripts`
  renderers, #37, and the mail fixes #39/#40, the same fixes Tapestry ships),
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
- The SQLite database runs in **WAL mode** (`scripts/sqlite-wal.mjs`, run by `pnpm migrate` and the
  Docker entrypoint). With the default rollback journal any open read blocks every write: CI froze
  when StudioCMS's session check failed mid-transaction and kept its lock (every save 400 until a
  restart, known issue #23). A database created another way must run the script once (server stopped).
  e2e `saveAndWait()` still waits for the save response rather than polling the database.
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
- StudioCMS stores the dashboard theme per user on the server when `data-theme` changes; scripts that
  switch it (screenshots) must switch it back. The canvas follows the system light/dark setting
  (Tapestry ≥ 0.3.1 sets `color-scheme: normal` on site frames; before, it followed the dashboard's
  theme). CDP `Emulation.setEmulatedMedia` overrides every frame: test real behaviour with Chrome's
  `--force-dark-mode`.
- The settings panel is sticky and can be the tallest column: selecting another component can
  change the page height and shift everything (scroll clamps). In e2e, select before measuring.
- The e2e harness lets Chrome pick its debugging port (`--remote-debugging-port=0` + the profile's
  `DevToolsActivePort`). A fixed port made every run since 2026-10-07 reuse one leftover browser and
  its cached scripts: changed code looked unchanged. If results look stale, check for leftover
  `tapestry-e2e-` Chrome processes.
- Astro 7 backgrounds `astro dev` on its own only when it detects an AI agent; for people and CI it
  stays in the foreground. Hence `--background` in the `dev` script: the first CI run hung for 30
  minutes on `CMS_SETUP=1 pnpm dev`, which worked in every agent session. `--background` waits until
  the server answers (up to 30 s).
- CI runners are much slower than a dev Mac: timing assumptions pass locally and fail there. Before
  pushing e2e changes, run `E2E_CPU_THROTTLE=4 pnpm e2e`. `openEditor()` waits for the canvas to finish
  loading (it moves the layout); click-then-check steps should confirm the result (e.g. `aria-selected`).
- Headless Chrome 156 (2026-10-15) stops producing frames on StudioCMS dashboard pages after a modal
  `<dialog>` closes: `requestAnimationFrame` never fires and every CDP mouse move waits 5 s for its
  ack. Not Tapestry (the dashboard home page shows it too; a plain page doesn't; Chrome 155 didn't).
  Tests still pass, slower (the a11y suite went from ~10 s to ~90 s per theme). Flags
  (`E2E_CHROME_ARGS`), bringToFront and viewport changes didn't help.
- After changing a `file:` dependency, `pnpm exec …` (including `astro dev stop`) can refuse to run
  ("a linked package is out of date") and the old dev server keeps serving old code. Run
  `pnpm install` (a second time if a `file:` package depends on another one, e.g. webforms on ipguard), restart, and confirm `astro dev status` shows a fresh uptime.
- Vite serves dependency files (`file:` and npm packages) with `?v=<hash>` and a one-year immutable
  cache; the hash changes only with the lockfile, which `file:` rebuilds don't touch. Chrome then kept
  old plugin code even after a hard reload (modules loaded with `import()` aren't revalidated). Hence
  `vite.optimizeDeps.force: true` in astro.config.mjs: every dev start gets a new hash, so restart after
  each install. e2e uses fresh browsers anyway.
- Astro's dev toolbar (`astro-dev-toolbar`) covers the bottom of the window: hide it before clicking things that end
  up there on short pages (`page.click` waits forever for them to be "uncovered").
- e2e: `page.realDrag()` resolves the target after pressing; resolve both points beforehand and
  don't scroll (not even the outer page) after the first one. `waitFor` callbacks should return
  booleans, not elements (an `<option>` never came back truthy).
- Email in e2e: only with `E2E_MAIL_SINK=1` on a scratch or CI site (it rewrites SMTP Configuration). The suite
  turns mail off when done: with mail on and the SMTP server gone, StudioCMS fails every dashboard save
  (Tapestry known issue #40). Mail bodies are quoted-printable.
- Dev-only test pages live in `src/pages/e2e/` and return 404 in production builds (`ipguard-check.ts`,
  `webform.astro`).
