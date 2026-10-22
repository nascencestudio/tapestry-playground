# Devlog

Chronological log of work sessions, newest first. Each entry covers what
changed, what we learned, and what's next. Keep entries factual. Link to ADRs
and known issues instead of repeating them.

---

## 2026-10-22: Sessions 44–46: content types (built, then removed)

**Request:** content types and lists (sessions 43–44: `@nascencestudio/tapestry-fabric` with fields, on Tapestry
0.7 hooks: companion `data`, fields panels, dependent options, a `date` prop; session 45: rebuilt on **content
templates** with display modes, Tapestry ADR 0045). After seeing it, the user found templates inside templates
too confusing and asked to remove it all; another approach later.

### Done
- Removed: Tapestry's `fabric-hooks` branch (0.7.0: ADRs 0044, 0045 and all their code) and the playground's
  `fabric` branch (Fabric suite, a11y states, dev-only list page, config). Both kept only as the tag
  `archive/content-types` in each repo. Tapestry is back on `companion-hooks` (0.6.0, 450 unit tests); the
  playground on `menus` without the Fabric dependency (30 suites; editor, templates, menus and webforms re-run
  and passing). `../tapestry-fabric` (local only) is no longer used anywhere.
- Left for the user: in the dev database, the "News Article" type row, one content template row and the pages
  "me" and "news-2" (made items while trying it out).

### Learned (kept)
- StudioCMS names plugin pages with `_` for every non-alphanumeric character of the identifier and route
  (research notes).
- Astro's dev toolbar covers the bottom of short pages in e2e (CLAUDE.md).

---

## 2026-10-21: Session 43: Content types and lists (design)

**Request:** Drupal-like content types, a "view" component (type, sort, limit) and display modes, much lighter
than Views. Verified in StudioCMS 0.6.1: page types allow only simple, code-defined, non-sortable `fields`;
categories (hierarchy) and tags exist on every page with a Taxonomy section; Astro content collections are
build-time files, not editor content. The user chose: types defined by admins in the dashboard; items are
Tapestry pages with fields; display modes in the dashboard with a code override; StudioCMS categories and tags.

### Done
- `../tapestry-content` (local): ADR 0001 (proposed) for `@nascencestudio/tapestry-content`: content types,
  fields in the page document, schema-change rules, display modes (plain HTML + classes for CSS), the Content
  list component (filter, sort, limit, pager, published only, page language), default templates, limits;
  and three Tapestry 0.7 changes it needs (companion data in documents, panels that edit the document,
  dependent select options).

### Next
- The user reviews the ADR; then Tapestry 0.7's ADR and changes, then the plugin.

---

## 2026-10-20: Session 42: StudioCMS mail patch (#39, #40)

**Request:** patches for known issues #39 and #40, shipped with the plugins for sites to apply.

### Done
- The fix (identical code in StudioCMS 0.6.1 and 0.7.0): the `Notifications` service's three send functions
  log any failure (`Notification "…" was not sent`) instead of failing the dashboard action; the mailer
  handler updates saved SMTP settings (`SDKCoreJs.CONFIG.mailerConfig.update`) and creates them only the
  first time, for both the setup (`POST`) and update (`PATCH`) endpoints.
- Shipped in Tapestry's StudioCMS patch (`templates` → 0.5.0, merged into `companion-hooks` and
  `studiocms-0.7`, which has the 0.7.0 file), README and known issues (#39, #40 Patched); a mail-only patch
  for both versions in `@nascencestudio/webforms` for sites without Tapestry (pnpm takes one patch per
  package version, so Tapestry sites use Tapestry's). Both checked with `git apply --check` against the
  0.6.1 and 0.7.0 tarballs.
- Playground: its own StudioCMS patch gained the hunks (reason in pnpm-workspace.yaml). The webforms mail
  step (`E2E_MAIL_SINK=1`) no longer deletes the SMTP row: it saves settings like the dashboard (setup, then
  update; the new port is stored) and creates a folder while SMTP points at a closed port (succeeds; the
  failure is logged). Passing on a fresh scratch site; webforms and publishing suites pass on this machine.

### Next
- Unchanged: releases (user), StudioCMS 0.7.0 install after 2026-10-22 19:47 UTC.

---

## 2026-10-20: Session 41: Webforms 0.1.0

**Request:** build webforms on the accepted design (ADR 0001 in `../webforms`), with IP Guard.

### Done
- `@nascencestudio/webforms` 0.1.0 (`../webforms`, local commit): see its devlog and README (Brevo setup
  checklist). No runtime dependencies; 21 unit tests.
- IP Guard: trusted proxies' own addresses are never judged (dev loopback had been counted as one visitor,
  a `::/64` row); local commit.
- Playground: `webforms()` + `webformComponents()` in studiocms.config (`file:` dependency uncommitted, like
  the others; the suite is added to the uncommitted e2e chain, now 30 suites). `webforms` suite: 8 steps (the
  dashboard builder, the Tapestry block, a visitor in the browser with the proof of work, every spam layer
  answered like success, IP Guard refusing a blacklisted visitor, the Submissions page and CSV export,
  deleting by name); with `E2E_MAIL_SINK=1` (scratch/CI only) a 9th step sends a real email through
  StudioCMS's mailer to a tiny SMTP server, then turns mail off again. a11y: every Webforms dashboard view and
  the public form (empty, errors, sent) through the dev-only `/e2e/webform` page, both themes. All passing on
  a fresh scratch site and on this machine's database (webforms, ipguard, a11y).

### Learned
- StudioCMS's mailer sends quoted-printable; decode before matching.
- SMTP settings save only once (Tapestry known issue #39); with mail on, a failed notification email makes
  every dashboard save answer 400 (#40, found when a previous run left mail on with the sink gone). Both in
  0.7.0 too; research notes updated.
- axe's `target-size` caught default-size radios/checkboxes on the public form (now 20px, rows ≥ 28px).
- Server-side field errors only appear after the 3 s minimum fill time (quicker = quiet spam), so browser
  tests wait first.

### Next
- Releases (user): Tapestry 0.5.0/0.6.0, tapestry-menus, IP Guard, webforms (each needs its GitHub repo; first
  releases a one-time npm token). Then the playground switches to npm versions and commits package.json.
- StudioCMS 0.7.0 install after 2026-10-22 19:47 UTC (checklist in session 38).

---

## 2026-10-20: Session 40: IP Guard 0.1.0

**Request:** build the accepted design, IP Guard first (webforms builds on it); the user confirmed the
webforms defaults and chose our own proof of work. Both ADRs Accepted.

### Done
- `@nascencestudio/ipguard` 0.1.0 (`../ipguard`, local commit): see its devlog. No runtime dependencies.
- Playground: `ipguard()` in studiocms.config (with an uncommitted `file:` dependency); dev-only
  `/e2e/ipguard-check` (404 in production builds) to drive the guard before forms exist; `ipguard` suite
  (9 steps: endpoint refusals, lockout guards, a ban, flag → dismiss → flag → blacklist → ban, rejected
  attempts counting, IPv6 /64, Check an address, settings validation), all passing first time; IP Guard
  views in the a11y audit (both themes, entries on every list). Cleanup removes only the suite's entries
  and restores settings.

### Learned
- Astro itself refuses cross-site form POSTs (no `Origin`) before plugin code runs.
- Admin-only plugin pages appear in StudioCMS's Admin section (fine for IP Guard).

### Next
- `@nascencestudio/webforms` (its ADR 0001).

---

## 2026-10-19: Session 39: Mail, webforms and IP protection (design)

**Request:** contact/web forms like Drupal's Webform, mail without running a mail server, strong spam
protection without Google. Findings: StudioCMS's mailer (`studiocms:mailer`, SMTP Configuration) is
usable by plugins but has no Reply-To; no StudioCMS form plugin exists; Hetzner blocks outgoing 25/465
(587 is open), and Drupal only "just works" where the host runs mail. The user chose **Brevo** (one
agency account, each client's domain verified; free 300/day shared).

The user's Drupal module `nh_form_submission_blocker` (in `tapestry/temp/`, not to be committed) was
read in full: whitelist / flagged / blacklist / banned lists, rate limit + AbuseIPDB with a careful
client (header key, timeouts, 24 h cache, fail open, 401/429 circuit breaker), a site-wide ban before
routing. Its code differs from the description in two places (rate limit only flagged without
blocking; a high score alone blacklisted rather than banned); the user decided: flag **and block** until
reviewed; high score → blacklist, ban only with the rate limit; whitelist protects against bans; no
self-bans; a separate plugin.

### Done
- Two new local repos with a proposed ADR each, for the user's review before any building:
  `../webforms` (`@nascencestudio/webforms`: forms built in the dashboard, `<Webform>`, optional Tapestry
  component, submissions stored then emailed, honeypot + timing token + our own proof of work, CSV export)
  and `../ipguard` (`@nascencestudio/ipguard`, working name: the four lists with CIDR and IPv6 /64,
  the decision table, the AbuseIPDB client, site-wide bans as middleware, self-lockout guard,
  `IPGUARD_DISABLE` for recovery).

### Next
- The user reviews both ADRs (open defaults: first-version fields, editors seeing submissions, 90-day
  retention, our own proof of work vs ALTCHA's library). Then build IP Guard first (webforms uses it).

---

## 2026-10-19: Session 38: StudioCMS 0.7.0, reviewed; upgrade after the release-age gate

**Request:** upgrade to StudioCMS 0.7.0 and make sure the plugins, dependencies and patches work.
0.7.0, `@studiocms/md` 0.5.1 and four `@withstudiocms/*` packages were published the same day (19:44
UTC), so `minimumReleaseAge` blocks them until 2026-10-22 19:47 UTC. The user chose to prepare now and
install then (no exception), and to support StudioCMS 0.6 and 0.7. Tapestry ADR 0043.

### Done
- Reviewed both tarballs (integrity-checked) without installing: 8 files differ; markdown parsing moves
  to `satteri` (reviewed: MIT, provenance, prebuilt binaries per platform, no install scripts), a Windows
  path fix, and a security fix (the dashboard search API listed all pages and folders, drafts included,
  to anyone; now editors only). Nothing we patch or depend on changed.
- All three patches (Tapestry's StudioCMS patch, the playground's StudioCMS and `@studiocms/md` patches)
  apply to the new versions unchanged; the SDK and Astro patches are unaffected.
- Branches `studiocms-0.7` (Tapestry: from `templates`; media library and tapestry-seo: from `main`;
  tapestry-menus: from `main`): peer range `^0.6.0 || ^0.7.0`; Tapestry also ships
  `patches/studiocms@0.7.0.patch` (README: copy the file for your version), known issues note the bugs
  are still in 0.7.0.

### Next (from 2026-10-22 19:47 UTC)
1. Playground: `studiocms` 0.7.0, `@studiocms/md` 0.5.1; rename `patches/studiocms@0.6.1.patch` →
   `@0.7.0` and `@studiocms__md@0.5.0.patch` → `@0.5.1` (and `patchedDependencies`); `pnpm audit`.
2. Tapestry, media library, tapestry-seo, tapestry-menus: dev dependency `studiocms` 0.7.0 on their
   `studiocms-0.7` branches; unit tests, typecheck, build.
3. All 28 e2e suites, `pnpm budget` (production build), the Docker image, and a fresh-site run.
4. Releases (the user): media library 0.2.1, tapestry-seo 0.2.1; Tapestry's range in its next release.

---

## 2026-10-19: Session 37: Template usage and safe deleting

**Request:** a "Used on N pages" badge beside a template's status, opening a list of those pages as
links; deleting a template that pages use warns and asks for its name first (like StudioCMS's page
delete). Tapestry `templates` (merged into `companion-hooks`), ADR 0041: `pagesUsingTemplates()` (pure,
published version or draft, 3 tests), `loadTemplateUsage()`/`templateUsage()`, the badge and dialogs
(native `<dialog>`), the endpoint refusing an unconfirmed delete (`confirm-name`).

### Done
- `templates` suite step: the count, the list's link to the page editor, the Delete button waiting for the
  exact name (a partial name keeps it disabled), a reopened dialog starting empty, the server refusing a
  delete without the name. The a11y suite audits both dialogs (its template is used by the home page's
  draft, then the page is reset before the next theme).

### Learned
- In headless Chrome 156 on dashboard pages, a `<dialog>`'s `close` event never fired (likely the
  frame stall after a dialog closes, noted in CLAUDE.md): the typed name is cleared when a dialog opens.
- An a11y step that changes the home page must reset it in its own cleanup: the suite runs every state
  once per theme, and the second pass saw the first pass's template.

---

## 2026-10-19: Session 36: Menus page layout

**Request:** a narrower menu name field with a sensible limit and Add menu below it; on a menu's page,
the name and the Add item / Save / Delete menu buttons grouped like a template's card (darker bar, no
line above it), and no line above Template Management's bars either. Done: names 50 characters at most
(they show in the sidebar, the picker and Navigation settings), a 24rem field with a hint; the menu
card with a bar holding the status and actions; Tapestry `templates` (merged into `companion-hooks`):
no top border on template bars. `menus` suite checks the field, the button below it and the bar's
contents; menus and a11y suites pass.

---

## 2026-10-19: Session 35: Template menu layout

**Request:** the Template menu was cut off in a narrow editor, the header/footer pickers looked out of
place, and the help text sat in the menu. Now (Tapestry `templates`, merged into `companion-hooks`;
ADR 0041): the menu is right-aligned with its button (`Popover` `align="end"`); "No template" and the
header/footer pickers form one grey, bordered group; then "Available templates" and the list (or "None
yet"); the help is behind an "i" button in the menu's header (`Popover` `headerExtra`). Nested popovers:
Escape closes the help first. The `templates` suite checks the alignment, the grouping, the heading and
the nested Escape; templates and a11y suites pass.

---

## 2026-10-16: Session 34: "Show in navigation" hidden; a default Main navigation

**Request:** StudioCMS's "Show in navigation" field confuses users next to Tapestry Menus. Source check:
its flag is read only by `frontendNavigation()`, a flat list of Markdown pages by date for StudioCMS's
ready-made themes (docs/research/studiocms-internals.md); nothing on our sites. The user chose a hybrid:
hide it on the create and edit forms (all page types) and end Basic Information with a notice ("Site
navigation is managed by Tapestry Menus", icon, link to Dashboard → Menus); and create **Main
navigation** once on a site without menus. tapestry-menus ADR 0002.

### Done
- tapestry-menus: middleware rewriting only those two dashboard pages (one CSS rule + the notice; no
  StudioCMS patch, a no-op on unknown markup), `ensureDefaultMenu()` (marker row, so it happens once).
- `menus` suite step for both forms, plus a fresh-site check of the default menu; a11y audits the notice.
- Verified the fresh-site path on a scratch site (second dev server on port 4500 with its own database
  and credentials file, removed afterwards). On this machine's database, which already has a "Main
  Navigation" menu, only the marker row was added.

### Learned
- `#tab-label-basic-info` is the tab's panel (`<sui-tab-item>`), not its button: click `[role="tab"]`.
- A scratch site started with `CMS_SETUP=1` must be restarted without it after setup-site.mjs (else
  every route 500s on `studiocms:plugins/augments`).

---

## 2026-10-16: Session 33: Template button without templates

**Request:** on a site without templates, the purple bar showed the separator but no Template button.
Now the button is always there; with no templates, headers or footers it's disabled and reads "No
available templates" (with headers or footers but no templates it stays usable: it picks the page's
own header and footer). Tapestry `templates` branch (0.5.0), merged into `companion-hooks`; ADR 0041.
The `templates` suite checks it in its own tab, with the editor page's template list emptied in flight
(CDP `Fetch`), so the site's real templates stay. Learned: a page whose HTML is rewritten that way
can't open Vite's live-reload socket (errors from `@vite/client`), hence the separate tab.

---

## 2026-10-16: Session 32: Tapestry Menus 0.1.0 (and Tapestry 0.6.0's companion hooks)

**Request:** back to menus. Decisions (2026-10-13/15): tied to Tapestry; data plus an unstyled
default; one menu whose links follow the language; breadcrumbs, per-link options, visibility by
login, menu blocks with depth; menus as components (pages, templates); CSS-safe classes from the
labels; a target per item; its own **Menus** sidebar item after Template Management; admins edit,
editors view; no drafts (saving makes it live); menu settings in the page editor in the first version.
tapestry-menus ADR 0001, Tapestry ADR 0042.

### Done
- Tapestry 0.6.0 (branch `companion-hooks`): `select` `optionsUrl`, `resolveSiteLinks()`,
  `pageLanguage()`, `inEditorCanvas()` (from `/page`), `@nascencestudio/tapestry/links` (browser-safe
  `cleanLinkValue()`/`isSafeUrl()`), companion buttons from `virtual:tapestry/extensions` (replaces
  `seo-client`), option `menus`. Docs in the README, the components guide and the site guide.
- `@nascencestudio/tapestry-menus` 0.1.0 (`../tapestry-menus`, local commit, not on GitHub): model with
  28 unit tests; plugin data rows with revisions (a save from an outdated copy gets 409); endpoints
  `/_menus/menus|options|page`; `getMenu()`/`getBreadcrumbs()`; `<Menu>`, `<Breadcrumbs>`;
  `menuComponents()`; Dashboard → Menus (tree editor: drag and drop, keyboard buttons, item settings);
  the editor's Menu dialog. Bundles: Menus page ~22 KB gzipped, dialog ~11 KB; public pages none.
- Playground (branch `menus`, on `templates`): Tapestry Menus in studiocms.config (+ `menuComponents()`),
  menu styles in the layout, `menus` suite (7 steps: endpoints refused to visitors and other origins,
  the sidebar position, building a tree with the form, the keyboard buttons and a real drag, saving,
  an outdated save refused, editors read-only, Menu + Breadcrumbs on the home page as visitor and
  logged in, the page dialog renaming an entry live), the a11y suite audits the Menus page, the tree
  editor and the dialog in both themes. `file:` dependencies stay uncommitted.
- Library icons for Menu and Breadcrumbs ship with `menuComponents()` (the library suite expects one
  per component). All 28 suites pass (2026-10-16) with the local Tapestry 0.6.0 and Tapestry Menus builds.

- Then, at the user's request, menu settings moved from a **Menu** button (purple bar) with a dialog
  to a Drupal-style **Menu settings** section under the settings panel: "Provide a menu link", title,
  parent item (any menu's top level or item), description, Save menu link (live at once). Tapestry's
  companions now come in two kinds (ADR 0042): bar buttons (SEO) and sidebar panels (`CompanionPanels`,
  loaded on first open, pages only). The `menus` suite checks there's no Menu button, the panel's
  values, a rename that's live at once and absent from the page's draft; the a11y suite audits the panel.
- Renamed **Navigation settings** (the user: so it isn't confused with a selected Menu component's
  settings). The user's browser showed "this version of the plugin has no panel": it still had the old
  editor module (Vite's `?v=` cache doesn't change for `file:` updates; a hard reload fixes it). The
  message now says to reload without the cache.
- A hard reload didn't help (Chrome doesn't revalidate modules loaded with `import()`; Firefox, never
  used before, was fine). astro.config.mjs now sets `vite.optimizeDeps.force`: each dev start gets a new
  `?v=` hash (checked: 3f781a15 → b2feacf7), so restarting after a `file:` install reaches every browser.

### Learned
- StudioCMS turns a plugin identifier into the dashboard URL with `_` for both `/` and `-`:
  `/dashboard/nascencestudio_tapestry_menus/menus`.
- Pragmatic DnD with `dragHandle` ignores a drag whose pointer has left a small handle by the time
  the browser fires `dragstart` (the CDP drag moves 20 px first): no data, no drop. Rows are dragged
  whole, like the layer tree. The tree-item hitbox measures indent from the drop target's left edge,
  so the target is the full-width `<li>` with the indent as padding.
- A `beforeunload` guard (unsaved changes) silently blocks navigation in headless Chrome; the suite
  accepts `Page.javascriptDialogOpening`.
- Dev HTML carries `data-astro-source-*` on every element; strip it before matching markup.
- axe `label-content-name-mismatch` again: no `aria-label` on buttons with visible text; the row's level
  is visually hidden text inside the button.
- A Python `replace` matched inside a longer CSS selector and broke two rules (every label struck
  through). The first match isn't always the one meant.
- An early failed run left a test menu behind (cleanup hung on the beforeunload prompt). I deleted
  only that menu. "Main Navigation" was there before the tests and was left alone.

### Next
- The user releases Tapestry 0.5.0, then 0.6.0. Then: create nascencestudio/tapestry-menus, switch its
  dev dependency to 0.6.0, push, and make the first release (one-time token). The playground switches
  to npm versions, runs every suite and commits.

---

## 2026-10-15: Session 31: Templates and Template Management (Tapestry 0.5.0)

**Request:** menus (no StudioCMS plugin does them: checked all 33 StudioCMS packages on npm and its
roadmap). The user designed templates built like pages; after trying a first version (headers and
footers only) they revised it: **Template Management** under Media with **Headers and Footers** and
**Templates**; templates are page layouts with a body of their own (layout and content components)
that pages inherit, with named **content areas** pages fill. Decisions: inherit (not copy), several
named areas, fixed template content locked, one-off pages start with no header/footer but can pick
existing ones, admins edit; then (StudioCMS lists only editor-level plugin pages under Media) editors
see Template Management read-only. Tapestry ADR 0041 (revised the same day).

### Done
- Tapestry 0.5.0 (branch `templates`): parts and templates (bodies with the built-in content area,
  `tapestry-area`), `mergeTemplate()` (the page poured into its template's areas, template ids
  `tpl_`), `assignAreas()` (template switches), `loadLayout()` in `getPage()` and the render endpoint,
  `<Region>`, a page's own header/footer, the Template menu, root areas in the editor (`#root` manifest
  entry: layer groups, drops into areas, Alt+arrows into empty areas), the template editor, Template
  Management (dashboard page with an inner sidebar), shared save rules (`save-rules.ts`).
- StudioCMS patch (playground and the one Tapestry ships): plugin dashboard pages named by slug.
  Without it two plugins with dashboard pages (Media + Template Management) 404 the whole dashboard
  (Tapestry known issue #38).
- Playground (branch `templates`): `<Region>` header/footer in the layout; `templates` suite (9 steps:
  Template Management under Media, a header, a template with two areas, a page inheriting it, moving
  content between areas, draft vs publish, a one-off page with its own header, editors read-only); the
  a11y audit covers both sub-pages, the part and template editors and the Template menu.

### Learned
- StudioCMS's generated dashboard-pages module names components `item.title + key`, but titles are
  translation objects: every page is `[object Object]pageBodyComponent`.
- StudioCMS puts admin-only plugin pages in the Admin section; only editor-level ones appear under Media.
- The canvas used the first root marker in the page; with a header region first it would have edited
  the header. `editableRoot()` picks the page body's root (or the part being edited).
- `display: contents` wrappers ignore opacity: fades go on the components.
- Keyboard moves (Alt+↓/↑) couldn't reach an empty slot or area; they can now.
- Chrome 156 (updated itself today) + StudioCMS dashboard: frames stop after a dialog closes (see
  CLAUDE.md gotchas); the suites pass, slower.

- After the user's review: one active sub-page link (StudioCMS's `SidebarLink` matches paths only;
  now plain `inner-sidebar-link`s marked on the server) and StudioCMS's spacing; red delete buttons and
  a bottom bar per template (areas, Edit layout, Delete); the part editor's page-content placeholder
  says it's edited on each page and doesn't look droppable; Template menu items are buttons, the
  current one purple. A probe's cleanup deleted the user's test templates (it removed everything,
  not only its own records); probes now must clean up only what they create.

### Next
- Release Tapestry 0.5.0; the playground switches to it. Then `@nascencestudio/tapestry-menus`.

## 2026-10-12: Session 30: Per-page SEO (tapestry-seo 0.2.0, Tapestry 0.4.0)

**Request:** the SEO button in Tapestry's editor for each page's SEO tags. Decisions (the user): the
essential fields (search title, description, social image, hide from search engines, canonical under
Advanced), site defaults on the settings page, search and link previews, editors may change SEO.
Tapestry ADR 0040, tapestry-seo ADR 0002.

### Done
- Tapestry 0.4.0 (branch `seo-button`): `seo` option, `virtual:tapestry/seo-client`, SEO button in
  the purple bar (only with tapestry-seo installed); known issue #23 updated with the WAL fix.
- tapestry-seo 0.2.0 (branch `page-seo`): the SEO dialog (Preact, saves at once via `/_seo/page`),
  `<Seo>` for `<head>`, Site defaults section, sitemap leaves out noindex pages and pages with a
  canonical elsewhere.
- Playground (branch `page-seo`): `Layout.astro` uses `<Seo page={result}>` (the 404 page passes a
  title and `noindex`); new `seo-page` suite (9 steps); a11y audits the SEO dialog in both themes.

### Learned
- tapestry-seo reaches the media library through Tapestry's virtual modules (both plugins share the
  Vite build), so it needs no dependency on the media library.
- `noindex` routes shouldn't carry a self-canonical (the 404 page had one pointing at itself).

### Next
- Released: Tapestry 0.4.0 and tapestry-seo 0.2.0 (2026-10-13). The playground uses both from npm;
  all 26 suites pass. Push the `page-seo` branch.

## 2026-10-11: Session 29: Component icons, canvas light/dark, content check badge (Tapestry 0.3.1)

**Request:** icons for every library component (like "Two columns"), a cleaner Button icon, and a
canvas that matches the public page's background (the page was dark, the canvas white).

### Done
- Thumbnails for all 9 playground components (`src/components/tapestry/thumbnails/`, same palette as
  `split.svg`). On hover/focus the library shows the enlarged icon instead of a live preview (ADR
  0029's rule for components with a thumbnail); the user chose to keep it that way.
- Tapestry 0.3.1 (branch `canvas-color-scheme`): site frames (canvas, version comparison, library
  previews) get `color-scheme: normal`, so they follow the system light/dark setting like the site.
- Tapestry 0.3.1: the "Valid" badge didn't say what was valid. It now reads **Content OK** (hover
  explains the check) or **Content: n problems**, which opens a list (component › setting + what's
  wrong, from `src/editor/problems.ts`); choosing one selects the component. Lists suite checks it,
  a11y audits the open list in both themes.
- e2e: the library suite checks that every component has an icon, and the enlarged icon on hover
  and focus (identified by the SVG's `<title>`: Vite inlines small files as data URIs).

### Learned
- Chrome passes an iframe element's `color-scheme` into the framed page's `prefers-color-scheme`.
  StudioCMS sets `color-scheme` on every element from the dashboard theme, so the canvas followed
  the dashboard, not the system. CDP media emulation hides this; `--force-dark-mode` shows it.
- Vite inlines some SVGs as base64 and others URL-encoded.

### Next
- Pushed to GitHub (nascencestudio/tapestry-playground). Dependabot's first npm run failed on astro
  (7.3.5 → 7.3.8): the patch is keyed to the exact version. Patched packages are now in Dependabot's
  `ignore` list and get updated by hand (astro 7.3.8 is pending: re-check or re-create the patch).
- The first CI e2e run hung on `CMS_SETUP=1 pnpm dev` until its 30-minute limit: Astro 7 backgrounds
  the dev server automatically only for AI agents, so it never returned on the runner (or for a
  person following the README). The `dev` script now passes `--background`.
- The next CI run failed on the first screenshot: `E2E_SCREENSHOTS` pointed to a directory that didn't
  exist (screenshots had never been on locally). `page.screenshot()` creates it now; all 25 suites
  pass with screenshots on.
- Then the site suite's light-mode check failed: the theme toggle flips, and a fresh account starts
  light. It now switches only when needed. A full rehearsal of the CI job on a fresh checkout (git
  worktree, new database, port 4500: setup, seed, 25 suites with screenshots, performance budget)
  passed end to end before pushing again.
- Dependabot's npm PR (#2) failed the a11y suite: axe-core 4.14 flags the rich text subscript and
  superscript buttons (visible "X₂"/"X²" not in their names "Subscript"/"Superscript",
  `label-content-name-mismatch`). Tapestry 0.3.2 draws them as icons; the playground uses 0.3.2, and
  PR #2 passes once rebased on it.
- `main`'s run after merging 0.3.2 failed before any test: "Chrome did not start remote debugging"
  (the same code had just passed on the PR). The harness waited only 10 s and discarded Chrome's
  output. It now waits up to 30 s, stops at once if Chrome exits, and puts Chrome's messages in the
  error.
- The PR's next run failed in the publishing suite: every save answered 400 (reset, retry and the
  final cleanup minutes later), i.e. the database stayed locked (known issue #23; reproduced locally
  by holding a write transaction: `{"error":"Database query failed"}`). `saveAndWait()` now includes
  StudioCMS's response body.
- The CI dev server log showed the cause: a page creation and a session check wrote at the same time,
  StudioCMS's session check failed (`SessionError`) and kept its read lock, and with SQLite's rollback
  journal one open read blocks all writes, so every later save answered 400. Fix: the database runs
  in WAL mode (`scripts/sqlite-wal.mjs`, from `pnpm migrate` and the Docker entrypoint, so production
  too). Checked: on a scratch file, a held read makes a write fail with SQLITE_BUSY in rollback mode
  and succeed in WAL; in the editor, a save succeeds while a read is held. Worth reporting upstream
  (auth-kit's session check doesn't release its transaction on errors), only when the user asks.
- After rebasing PR #2, the publishing suite's compare step failed on the runner: the wait accepted
  a preview frame whose heading was there while it was still loading, and the next check (which
  requires a fully loaded frame) got null. The wait now uses the same condition.
- Then the migrations suite: a row click right after opening the editor missed (the canvas was still
  loading and moved the layout). `openEditor()` now waits for the canvas (up to 30 s), and the step
  confirms the selection. New `E2E_CPU_THROTTLE=4` (CDP CPU throttling) runs the suites like a slow
  runner: all passed except the SEO suite, where a click right after a save landed before the page's
  script attached its handler (checkboxes stayed disabled). The suite waits for the full load now;
  tapestry-seo 0.1.1 syncs the checkboxes when its script starts (a real, if rare, bug for people too).
- Done: Tapestry 0.3.1 is on npm (provenance); the playground uses it, all 25 suites pass. Next: the
  user creates `nascencestudio/tapestry-playground`, pushes, and adds the `main` ruleset after the
  first CI run.
- tapestry-seo: merge `trusted-publishing-only` (no npm token in the release workflow).

## 2026-10-11: Session 28: Tapestry SEO, stage 1

**Request:** an SEO plugin with admin control over robots.txt (AI crawlers and others) and a sitemap;
later per-page SEO. Decisions (the user): one plugin named **tapestry-seo**, tied to Tapestry; robots.txt
only (no enforcement); crawler list bundled and updated through releases; per-page SEO via an SEO
button in Tapestry's editor (stage 2), saved immediately. tapestry-seo ADR 0001, Tapestry ADR 0039.

### Done
- Tapestry (branch `public-pages`, 0.3.0): `listPublicPages()`.
- New repo `../tapestry-seo` (stage 1): crawler data (ai.robots.txt + curated), settings page,
  robots.txt, page sitemap via StudioCMS's sitemap hook, build stop when StudioCMS's robots.txt is on.
- Playground: plugin added, `features.robotsTXT: false`, new `seo` suite (8 steps), SEO settings page
  in the a11y audit. All 25 suites pass.

### Learned
- StudioCMS's robots.txt is under `features` (top-level ignored) and is a static file written at build
  time: invisible in dev, wins in production. The plugin's build check caught the misplaced setting.
- StudioCMS's middleware fetches npm for its version check; while the network dropped, **every page
  returned 500** (logins too). Restart the dev server once the connection is back.
- e2e: after a form save, remove the old "Saved" notice before waiting for the new one (the old one
  made the test move on early).

- Releases (2026-10-11): Tapestry 0.3.0 and tapestry-seo 0.1.0 (first release with a token). The
  playground now installs all three packages from npm (tapestry-seo added to
  `minimumReleaseAgeExclude`); all 25 suites pass. The waiting test changes are committed.

### Next
1. User: tapestry-seo trusted publisher + no-bypass publishing access, delete the token; create the
   playground repo on GitHub. Then stage 2 (SEO button in Tapestry's editor).

## 2026-10-09: Session 27: History and JSON in modals (Tapestry)

- History, Compare and JSON open in modals (Tapestry commit "…open in modals"). Tests: publishing
  waits for the History modal to close after Restore/Discard and closes Compare then History; a11y
  audits each dialog itself (with the editor dimmed behind a modal, axe blended the backdrop into
  backgrounds and flagged the language label in the light theme). All suites pass.
- media-folders was flaky: its first click raced the folder list loading (rows arriving moved
  "+ New folder"). The list now marks itself ready (media library); the suite waits for it.

## 2026-10-09: Session 26: Editor toolbars (Tapestry)

**Request:** a less cluttered editor toolbar. Done in Tapestry (commit "Editor toolbars"):
- Top row: only the status pills (unchanged position).
- Purple bar above the canvas bar (`tp-actionbar`, same color as the Components panel): undo and
  redo as icon buttons (new icons), a separator, then the language menu, History and JSON.
- Canvas bar: full screen (icon) next to Desktop/Tablet/Mobile; View page next to reload (new icon).
- Canvas bottom bar: keyboard help on the left; Save draft, Schedule…, Publish on the right.
- The JSON view replaces the canvas, so it renders the same bars around itself.
- Tests: inline and richtext suites click `[data-tapestry-undo]`/`[data-tapestry-redo]` (they used
  the old toolbar). Full chain: all 24 suites pass (with `file:` Tapestry and media library).

### Learned
- `pnpm exec astro dev stop` can fail silently when pnpm thinks a `file:` package is out of date
  (`verifyDepsBeforeRun`): the old server keeps running with old code. Run `pnpm install` first, or
  `./node_modules/.bin/astro dev stop`, and check `astro dev status` shows a fresh uptime.

## 2026-10-09: Session 25: Media library folders (0.2.0); e2e harness reused a stale browser

**Request:** folders in the media library, mirrored on the file system. Design and decision:
[medialibrary ADR 0100](https://github.com/nascencestudio/medialibrary/blob/main/docs/decisions/0100-folders.md)
(the user chose "mirror disk, stable URLs"). The work is in the medialibrary repo; here: tests.

### Done
- New suite `e2e/media-folders.e2e.mjs` (10 steps): folders created/renamed/moved/deleted through the
  UI with the **disk checked** at each step, uploads into a folder, moves by the details panel and by
  dragging a multiple selection, URLs unchanged throughout, API refusals (empty names, unknown
  parents, cross-site, visitors), and that a drag never uploads anything. a11y: a folder selected
  with its form open, both themes.
- **Harness fix (cdp.mjs):** Chrome picks its own debugging port. The fixed port 9333 had a leftover
  browser from 2026-10-07 listening, and every run since connected to it (with its cache) instead of
  the browser it had just launched. Earlier results stand: until today's `file:` packages, the code
  under test changed URL with each change (workspace links, new package versions).
- Real dev data migrated on first start with 0.2.0: 6 files moved out of `2026/10`, keys rewritten,
  old URLs still serve. Backup taken first.
- Found and fixed with the browser runs: an unhandled rejection from the folder form, a stale-form race
  when switching folders, and dragging a card **uploading a copy** of its thumbnail (a dragged `<img>`
  carries a file).

### Verified
- All 24 suites pass with media library 0.2.0 (`file:`); publishing once hit the known SQLite save
  flake (#23) in the full chain and passed on its own.

### Next
1. User: release medialibrary 0.2.0 (staged; approve). Then switch here to `0.2.0`, commit the folders
   suite, a11y state and chain entry, and push (CI runs them on a fresh site).
2. Tapestry: next release ships embedded source maps (dev warnings) and can move its devDependency
   to medialibrary 0.2.0.

## 2026-10-09: Session 24: Plugin-only Tapestry repository; tapestry-playground

**Request:** the `tapestry` repository should hold only the plugin (the monorepo had been pushed).
Decisions (the user): playground to a new repo, user docs + ADRs stay with the plugin, replace
the pushed history. Tapestry [ADR 0038](https://github.com/nascencestudio/tapestry/blob/main/docs/decisions/0038-plugin-only-repository.md).

### Done
- **tapestry**: the package at the root (src, test, scripts, the shipped StudioCMS patch, README
  as npm/GitHub front page, docs, ADRs, `website/`). No dependency patches applied there (the
  plugin's build and tests don't need them). CI: lint, audit, build, typecheck, unit tests,
  `pnpm pack --dry-run`, docs build; release workflow stages from the root. Links in docs to
  moved files point at this repo on GitHub. The old monorepo commit is on a local
  `monorepo-archive` branch; `main` gets one plugin-only commit (the user force-pushes).
- **tapestry-playground** (this repo, new): the site at the root, e2e, budget, Docker (now a
  single-package build: install, build, `install --prod`, copy), the four dependency patches,
  CI (checks, fresh-site e2e + budget, Docker image), the devlog, research, upstream drafts,
  deployment and development guides, its own CLAUDE.md and README. Tapestry is `file:../tapestry`
  until 0.1.0 is on npm. The local dev database, media and credentials moved with it.
- Stopped two stray servers from earlier sessions (a dev server and an `astro preview` on 4700)
  that kept recreating `playground/.astro` in the old location.

### Learned
- A `file:` directory dependency is hard-linked into the store: edits show at once, new files
  need `pnpm install`.
- Biome's `useIgnoreFile` needs a git repository; before `git init` it checks fewer files.

### Verified
- tapestry: build, typecheck, 406 unit tests, audit (1 reviewed ignore), lint, docs site (no
  broken internal links), release dry run (`pnpm stage publish --dry-run`), package contents.
- playground: typecheck, lint, audit, all 23 e2e suites (199 steps), production build, budget.
- Not verified: the Docker image (needs Tapestry on npm first).

- **npm 0.1.0** turned out to be built from the old monorepo commit `1d09db4` (a release created
  before the force push): same 291 files, but stale `repository.directory`, README links and a
  provenance commit no longer on any ref. Version numbers can't be reused (not even after
  unpublish), so Tapestry is bumped to **0.1.1**; 0.1.0 gets deprecated. The old Dependabot PRs
  (against the monorepo) should be closed.

- **Tapestry 0.1.1 released** through the trusted publisher (no token), approved with 2FA,
  provenance on the plugin-only commit `8e101a6`. The release workflow no longer has a token
  fallback. The playground uses `0.1.1` from npm: typecheck, audit, all 23 e2e suites, and the
  Docker image (built, healthy on a read-only filesystem as uid 1000, sharp resizes) pass.

### Next
1. The user: deprecate Tapestry 0.1.0; publishing access "2FA, no bypass tokens"; delete the
   npm token and the `NPM_TOKEN` secrets; create + push tapestry-playground (its CI can run now).
2. File the StudioCMS issue (docs/upstream/).

## 2026-10-09: Session 23: Media library 0.1.0 released; Tapestry uses it from npm

**Request:** help with the first media library release (the user ran it), then switch over.

### Done
- Release fixes: `"private": true` removed from both published packages (pnpm refused to publish).
- `@nascencestudio/medialibrary` 0.1.0 is on npm: 173 files, SLSA v1 provenance, linked to its repo.
- `file:` dependencies replaced with `0.1.0` (playground, Tapestry devDependency). Verified: build,
  lint, typecheck, 406 unit tests, audit (1 reviewed ignore), production build, full e2e (23 suites).

### Learned
- GitHub refuses pushes whose commits expose a private email: commit with the no-reply address.
- A release tag stays on the commit it was created on; re-running the workflow doesn't pick up
  later commits. Fix code → new release; fix settings only → re-run.
- npm answers 404 when a token can't publish a new scoped package. The first publish needs a
  token (trusted publishing is configured per existing package).
- npm stages new packages: a `0.0.0-stage` stub is `latest` until an automated check releases
  the real version.

- **Staged releases** (ADR 0035 update): npm's trusted publisher allows "stage" by default and warns
  against allowing direct publish; a direct publish through it failed with 403 "OIDC permission
  denied for this action". Both release workflows now run `pnpm stage publish --provenance`
  (dry runs pass); a maintainer approves each version on npmjs.com with 2FA.

- medialibrary **0.1.1** released the intended way: staged by `GitHub Actions` through the trusted
  publisher (no token), approved by the maintainer with 2FA, SLSA provenance. Package publishing
  access is now "require 2FA, disallow bypass tokens". Tapestry and the playground use 0.1.1
  (typecheck, 406 unit tests, audit, the four media e2e suites pass). The tarball returned 404 for
  ~4 minutes after approval while metadata was already visible: retry installs, don't debug.

### Next
1. Tapestry's first release (bypass token once), then trusted publisher (stage only), publishing
   access option 1, delete the token + secret, and remove `NODE_AUTH_TOKEN` from release.yml.
2. Tapestry: git init, push, Pages, token for the first release, `v0.1.0`, then trusted publisher.
3. File the StudioCMS issue (docs/upstream/). Don't merge Dependabot's TypeScript 7 PR.

---

## 2026-10-08: Session 22: Repositories, media library moved out

**Request:** the GitHub repositories are `nascencestudio/tapestry` and
`nascencestudio/medialibrary`; the user chose to move the media library out of this monorepo.

### Done
- `repository`, `homepage` and `bugs` in `packages/tapestry/package.json`; README links point to GitHub.
- **Media library moved** to `../medialibrary` (its own repo, `git init -b main`, nothing pushed;
  [ADR 0037](decisions/0037-media-library-repository.md)): sources, tests and fixtures, its own
  `pnpm-workspace.yaml` hardening, CI + release workflows (provenance), Dependabot, CLAUDE.md,
  devlog and copies of ADRs 0003/0016/0018/0019. There: build, 174 tests, typecheck, lint, audit pass.
- Here: `packages/medialibrary` removed; the playground and Tapestry's devDependency use
  `file:../medialibrary` until 0.1.0 is on npm; media e2e fixtures copied to
  `playground/e2e/fixtures`; CI, release workflow and Dockerfile build Tapestry + playground only;
  `minimumReleaseAgeExclude` for our own package.
- Audit: http-cache-semantics is now 4.3.0, so its ignore entry is gone (known issue #8).

### Learned
- pnpm resolves an optional peer from the registry when nothing in the workspace provides it,
  so Tapestry needs a dev dependency on the media library for its own tests and types.
- `file:` installs a copy and dedupes its dependencies; `link:` keeps the other repo's
  `node_modules` (two Preacts).
- A dev server running for many hours kept serving the deleted workspace package; restart after
  moving packages.

### Verified
- Lint, typecheck, 406 unit tests, the docs site build, `pnpm audit` (1 reviewed ignore), and the
  full e2e run (23 suites, 199 steps) against the `file:` dependency.

### Next
1. Release order (the user): medialibrary v0.1.0 → switch `file:` to `0.1.0` here + `pnpm install`
   → push, Pages, trusted publishing, tapestry v0.1.0 → file the StudioCMS issue (docs/upstream/).
2. Re-check the braces advisory on 2026-11-01.

---

## 2026-10-08: Session 21: Phase 5: permissions, accessibility, performance budget, release prep, docs site

**Request:** continue the Phase 5 items.

### Done
- **Component permissions** ([ADR 0033](decisions/0033-component-permissions.md)): `permission:
  'admin' | 'owner'` on a definition locks it for lower roles. One rule in `permissions.ts` (a
  saved document must leave locked components as in some version the page already has), used
  by the editor store (refuses commits; a visible notice explains) and the server
  (`guardSaves()`, the former publish guard: 403 for crafted changes). UI: locks in the library
  and page structure, read-only settings (disabled fieldset, read-only rich text), no canvas
  drag/duplicate/delete/inline editing for locked components. Playground: the Hero is admin-only.
- **Toolbar:** the status pills moved to the end. Their width changes (Published / Unpublished
  changes), and with the new language button the toolbar wraps, so Publish moved under the
  pointer between measuring and clicking (a full-run e2e failure in the publishing suite).
- e2e: media-extras' `clickAt` waits for a loaded, on-screen, still image (one flaky run).
- **Accessibility audit** ([ADR 0034](decisions/0034-accessibility-and-performance.md)): axe-core 4.13.0
  (dev dependency, reviewed) in a new `a11y` suite: the public page, and the editor in many states
  and both themes, plus the media library page. Fixed: heading outline (hidden `<h2>`), status pill
  contrast (text color + colored border/dot), a theme-aware danger text color, the media library's
  primary button contrast, reduced motion.
- **Performance budget**: `pnpm budget` measures what visitors download from a production server
  (home: 1.3 KB HTML, 1.5 KB CSS, 0.2 KB JS, 3 requests; one-island page: 8 KB JS) against
  `perf-budget.json`; CI runs it after the e2e suites.

### Learned
- A layout that shifts when a status changes is both a UX wobble and an e2e flake; the
  screenshot on failure showed it directly.

- axe found only one rule in the default dark theme (heading order); the light theme and an error
  state found the contrast problems. Auditing several states and both themes matters.

### Verified
- Unit: Tapestry 406 (+14), media library 174. Lint and typecheck clean.
- Full e2e: 23 suites, 199 steps (permissions +1, a11y 4). `pnpm budget` within budget.

### Publishing readiness (dry run, nothing published)
- `pnpm pack` works for both packages (tapestry 268 KB, medialibrary 100 KB; only `dist/` and
  `package.json`; workspace versions resolved).
- Missing before a release: `repository`, `homepage`, `author`, `engines`, `publishConfig`
  (public, provenance), a README and LICENSE file per package (MIT is declared, no license text
  or copyright holder). Provenance needs publishing from GitHub Actions (trusted publishing), so
  the repo must be on GitHub.
- Caveat: islands and component scripts rely on our StudioCMS patch (#37); sites installing from
  npm won't have it unless they apply it too, or StudioCMS fixes it upstream.

### Release preparation (user decisions: MIT © Nascence Studio, provenance from GitHub Actions,
document the StudioCMS patch and report it upstream, Starlight docs site on GitHub Pages)
- [ADR 0035](decisions/0035-npm-release.md): both packages at 0.1.0 with README, LICENSE, `author`,
  `engines`, `keywords`, `publishConfig` (public, provenance); Tapestry ships
  `patches/studiocms@0.6.1.patch` (the two islands hunks; applies cleanly to a pristine 0.6.1).
  `.github/workflows/release.yml`: on a GitHub release, checks + `pnpm -r publish --provenance`
  (trusted publishing, `NPM_TOKEN` fallback). Root LICENSE; README status refreshed.
- StudioCMS issue #37 drafted in `docs/upstream/` (no `gh` here; file once on GitHub).
- Waiting for: the GitHub repository URL (for `repository`/`homepage`/`bugs`, and to publish).

### Documentation site
- [ADR 0036](decisions/0036-documentation-site.md): `website/` (Starlight 0.42.5, reviewed) built from
  `docs/` and the package READMEs by `scripts/sync-docs.mjs` (titles from headings, links rewritten
  to site URLs or GitHub); `.github/workflows/docs.yml` deploys to GitHub Pages (SHA-pinned Pages
  actions). 48 pages, 2,553 internal links checked with a `/tapestry` base, none broken.
- Audit: a moderate advisory via Expressive Code (`postcss-selector-parser` < 7.1.6), fixed with a
  scoped override (`postcss-nested` 8.0.1).
- Learned: Starlight 0.39+ wants sidebar groups as `items: [{ autogenerate }]`; GitHub's API
  `git/ref` lookups were unreliable here, `git ls-remote` gave the action tag SHAs.

### Next
- Waiting for the GitHub repository URL: add `repository`/`homepage`/`bugs`, push, enable Pages,
  configure npm trusted publishing, file the StudioCMS issue (#37), publish 0.1.0 via a release.

---

## 2026-10-07: Session 20: Phase 5: migrations, translations

**Request:** finish the Phase 5 items, in order.

### Done
- **Migrations** ([ADR 0031](decisions/0031-migrations.md)): components get `version`, a `migrations`
  module (`{ 2: (props) => … }`) and `replaces` (renamed types). Nodes record `version` (only when
  above 1). Migrations run lazily inside `validateDocument()`, on a copy, before the usual
  cleaning; failures keep the earlier props with an error; newer-than-installed versions are kept
  with a warning. `virtual:tapestry/manifest` is now generated JS that imports the migration
  modules. Format migrations (`migrateFormat()`, `FORMAT_MIGRATIONS`) refuse newer formats, and
  version 2 is reserved (the stored page wrapper), so the next format is 3.
- Playground: Counter version 2 (`start` → `initial`).
- **Fix:** the info popover registered its outside-click listener in a passive effect; a quick
  click could arrive first (seen once in a full e2e run). Now a layout effect.

### Learned
- The shared version number space (document 1, stored page 2) would have bitten the first format
  migration; it's now encoded (`RESERVED_FORMATS`) and tested.

- **Translations** ([ADR 0032](decisions/0032-translations.md)): StudioCMS's content-language rows
  turned out to be data-model only (the dashboard never edits them; titles and slugs can't vary),
  so each language is its own page in a translation group (plugin-data rows `{ lang, source }`).
  `languages` option; a translations menu in the editor (status per language, "Create French
  version": an unpublished copy at `fr/<slug>`, opened in the editor); `getPage()` returns
  `language` and the visible `translations`; page links follow the current language. Playground:
  `['en', 'fr']`, `<html lang>`, hreflang links and a zero-JS language switcher.

### Learned (translations)
- StudioCMS slugs may contain `/`; `SDKCoreJs.POST.page` wants booleans for the flag columns.
- Dev-mode HTML carries `data-astro-source-*` attributes: e2e regexes must allow extra attributes.

### Verified
- Unit: Tapestry 392 (+32), media library 174. Lint and typecheck clean.
- Full e2e: 22 suites, 194 steps (new: migrations 4, translations 8).

---

## 2026-10-07: Session 19: Editor UI clean-up

**Request:** tidy the editor before the rest of Phase 5: (1) the Components panel in StudioCMS's
dark purple with white text; (2) icon buttons for collapse/expand all; (3) better markers in the
page structure (a purple dot for leaves, a purple chevron for containers); (4) and (5) keyboard
hints behind info buttons with a closable popup, in the page structure and in a new bottom
toolbar of the canvas (≥ 8 px padding).

### Done
- **Components panel:** `--tp-brand: hsl(259 74% 25%)` (StudioCMS's light-theme `--primary-base`),
  the same in both themes, white text (≈ 11:1); search field, items, thumbnails, pattern actions
  and focus rings adjusted for the dark background; the preview popover keeps editor colors.
- **Page structure:** collapse/expand all are icon buttons (`aria-label` + `title`). Rows show a
  16×16 purple dot (no children) or a purple chevron that turns right when collapsed. Both use the
  theme's `--primary-base`, so they stay visible in dark mode.
- **Info popovers** (`InfoPopover.tsx`, new `UI_ICONS` in `icons.tsx`): an "i" button opens a
  small dialog with the shortcuts as a list; ✕, Escape (focus returns to the button) or a click
  outside closes it. The same shortcuts stay in a visually hidden `aria-describedby` text for
  the tree and the canvas iframe.
- **Popover placement** (follow-up): the page-structure popover was right-aligned, so it opened
  leftwards under StudioCMS's inner sidebar (`#sui-sidebar-inner`). Popovers now left-align with
  their button (opening towards the editor) and flip to right-aligned only when there's no room on
  the right (measured before paint). The layers e2e step checks it never overlaps the sidebar.
- **Canvas footer:** `<div class="tp-canvas__footer" role="toolbar">` (8 px padding, room for
  future tools) instead of the `#tp-canvas-keys` paragraph; the id now names the hidden
  description inside it.
- **Fix:** the link field's "Page on this site" click could be undone. It synced its mode from the
  stored link in a passive effect, which can run *after* a quick click. This was the real cause
  of the intermittent links-suite failure (session 17 suspected SQLite). It now follows outside
  changes only, in a layout effect.

### Learned
- StudioCMS saves the dashboard theme **per user, on the server**, when `data-theme` changes.
  Setting it in a screenshot script switched the dev account to light; the canvas iframe follows
  the dashboard's `color-scheme`, so the canvas suite's "canvas looks like the public page" step
  failed until the theme was switched back.
- The failure dump added to the links suite in session 17 paid off: it showed the mode buttons'
  state, which pointed straight at the effect race.

### Verified
- Unit: Tapestry 360, media library 174. Lint and typecheck clean.
- Full e2e: 20 suites, 182 steps (layers +1: icon labels, popovers, footer padding).
- Screenshots in the dark and light dashboard themes: panel colors, row markers, both popovers.

### Next
- Phase 5: document migrations framework, i18n, component permissions, a11y + performance budget,
  npm publish (ask first), documentation site.

---

## 2026-10-07: Session 18: Interactive components (islands)

**Request:** Phase 5, starting with islands. Asked whether to add `@astrojs/preact` to the
playground (Babel-based build tooling); the user chose full support (option 1).

### Done
- **Islands** ([ADR 0030](decisions/0030-islands.md)): framework components (`.tsx`, `.jsx`,
  `.svelte`, `.vue`) as Tapestry components; `client: 'load' | 'idle' | 'visible'` makes them
  islands through generated `.astro` wrappers (`node_modules/.tapestry/islands/`).
- **StudioCMS strips component scripts** (known issue #37): its post-render passes re-sanitize the
  rendered page and drop every `<script>`, so islands never hydrated (and Astro component scripts
  in Tapestry components were silently lost). Patched: renderers opt out with
  `componentScripts: true`; Tapestry does. Adversarial e2e step for content payloads.
- **Canvas** runs new scripts from live renders once (`canvas/scripts.ts`), so an island added
  while editing hydrates; plain-text editing skips text inside islands.
- Playground: `@astrojs/preact` 6.0.5 (reviewed in ADR 0030; 6.0.6 is inside the release-age
  window), `preact` as a direct dependency, a Preact **Counter** component (`client: 'visible'`).
- Biome now ignores `.claude/` (local tool settings, not project code).

### Learned
- Astro emits the island bootstrap (`<style>` + directive and runtime `<script>`s) inline before
  the first island; StudioCMS kept the `<style>` but dropped the scripts, which pointed at a
  sanitizer that only drops `<script>`: ultrahtml's default.
- The render endpoint goes through the same StudioCMS renderer as public pages, so the canvas
  showed the same problem: one fix covered both.
- Production check: pages without islands are unchanged; a Counter page loads ≈ 7.9 KB gzipped.

### Verified
- Unit: Tapestry 360 (+7), media library 174. Lint and typecheck clean. `pnpm audit`: only the two
  reviewed advisories.
- Full e2e: 20 suites, 181 steps pass (new: islands 5).
- Production build: island hydrates for an anonymous visitor (e2e) and ships only on its page.

### Next
- Phase 5: document migrations framework, then i18n, component permissions, a11y + performance
  budget, npm publish (ask first), documentation site.

---

## 2026-10-07: Session 17: Phase 4 complete (plain text on the canvas, links, lists, slots, patterns, previews)

**Request:** continue the roadmap in order (same request as session 16).

### Done
- **Dependabot** (`.github/dependabot.yml`): weekly; Actions SHAs and npm (pnpm lockfile);
  minor/patch grouped; 3-day cooldown matching `minimumReleaseAge`. Active once on GitHub.
- **Plain `text` props editable on the canvas** ([ADR 0024](decisions/0024-inline-editing-plain-text.md)):
  the element showing the value is found automatically (or marked with
  `data-tapestry-text-prop`); ambiguous matches stay in the panel.
- **Link prop** ([ADR 0025](decisions/0025-link-prop.md)): `link` stores a page id or a web
  address plus `newTab`; components get a `ResolvedLink` (href, external, newTab, rel, title).
  Page links follow renames, and resolve to `null` for deleted pages and, for visitors, draft
  pages. Editor field with a page list from the new editors-only `GET /_tapestry/pages`.
  Stored strings are read as web addresses, so `url` → `link` is a safe switch. The
  playground Button uses it (its `newTab` prop is gone).
- **List (repeater) and object props** ([ADR 0026](decisions/0026-list-and-object-props.md)):
  items are objects of single-value fields (one level of nesting); invalid items are dropped,
  not the node; at most 100 items. Media and links resolve at any level (`collectRefs()`,
  pure). Editor: collapsible items with move/remove/add (each one undo step), focus
  management and announcements. Playground: an FAQ component (`<details>`, zero JS).
- **Named slots** ([ADR 0027](decisions/0027-named-slots.md)): `slots` on a definition, `slot`
  on children (one children array, grouped by area). StudioCMS's registry only passes a default
  slot, so the renderer wraps slot children in `<tapestry-slot>` and `Node.astro` splits them
  (`splitSlots()`) into real Astro named slots. Canvas drop areas per slot, a group per slot in
  the page structure, keyboard moves across slots. Playground: "Two columns".
- **Patterns** ([ADR 0028](decisions/0028-patterns.md)): "Save as pattern…" in the settings panel;
  the library's Patterns section inserts fresh copies (click or drag, tree and canvas); author or
  admin can delete. Stored as plugin data rows; editors-only same-origin API. Node and pattern
  names now also drop bidi override characters.
- **Library thumbnails and live previews** ([ADR 0029](decisions/0029-library-previews.md)): hover or
  focus a component to see it rendered with its starting values (sandboxed frame, the canvas
  page's CSS); an optional `thumbnail` image shows instead, and as an icon on the item.
  Playground: an SVG thumbnail for "Two columns". **Phase 4 is complete.**
- **Fix:** the link field cached a failed page-list load for the whole session (empty list, no
  way out); it now shows "Couldn't load the site's pages. Try again" and retries.
- **Fix:** dragging a component by its editable plain text left that text focused (Chrome
  refocuses the drag source on dragend); the re-render then restored the caret and Ctrl+Z
  went to the browser instead of undoing the move. The canvas now blurs it on `dragend`.

### Learned
- Blurring in `drop` isn't enough: Chrome gives focus back to an editable drag source when
  the drag ends, after `drop`. (Caught by the canvas suite's undo-after-drag step.)
- StudioCMS's page edit endpoint updates its page cache, so a renamed page's new slug is
  visible to the next render (no 5-minute wait).
- Nested field ids built with `-` collided: a field named `label` inside an object got the
  object's own `…-label` id, so the test typed into nothing. Nested ids now use `__`.
- The validator refactor (one `cleanSlot` for props, fields and items) kept every existing
  test passing unchanged, which made the new types cheap to add.
- Storing the slot on the child (not a map on the parent) meant no tree walker changed; only
  placement code (insert/move targets, drop geometry, the layer tree's grouping) learned slots.
- e2e geometry again: `realDrag()` resolves its target *after* pressing, so a resolver that
  scrolls moves the page mid-drag; and a point helper that scrolls the outer page even with
  `scroll: false` invalidates earlier points. Resolve both points first, without scrolling.
- `page.waitFor()` returning an `<option>` element never became truthy through CDP's by-value
  result; return booleans.
- The layers hover test broke when "Save as pattern" made the Section settings taller: the sticky
  settings panel can be the tallest column, so selecting another component changes the page
  height, the scroll position clamps, and rows move under the pointer. The test now selects
  first; the layout quirk is noted for canvas polish (cap the panel to the viewport).

### Verified
- Unit: Tapestry 353 (+83), media library 174. Lint and typecheck clean.
- Full e2e: 19 suites, 176 steps pass (new: links 10, lists 9, slots 7, patterns 6, library 4).
- Screenshots checked by eye: the preview popover (live Hero; thumbnail for Two columns) and the
  library's inline thumbnail icon.
- The links suite failed twice in full runs ("target page listed") and never alone; the likely
  cause is the cached failed page-list load above (suspected SQLite busy, #23). The suite now
  uses "Try again" and prints the editor state if it fails again.

### Next
- Phase 5, in order: interactive islands (then re-run client scripts after a live swap),
  document migrations, i18n, component permissions, a11y + performance budget, npm publish
  (ask first), documentation site.
- Polish: keep the settings panel within the viewport (scroll inside it) so selection changes
  don't move the page.

---

## 2026-10-06 – 2026-10-07: Session 16: Roadmap: editor, canvas and publishing follow-ups

**Request:** complete the roadmap features in order, minding deferred items and dependencies.
The user dropped two items: "View page" on StudioCMS's edit screen (it would need a
StudioCMS patch; no extension point) and shareable preview links.

### Done
- **Layer tree** (Phase 2 follow-ups):
  - collapse/expand (toggle, ←/→, collapse/expand all, reveal on selection, opens while hovering during a drag);
  - auto-scroll while dragging;
  - node names (`label`, editor-only, canonical key order, shown on rows and the canvas chip);
  - copy/cut/paste as validated clipboard text with fresh ids, so it works between pages.
- **Canvas** (Phase 3 follow-ups):
  - drop zones in empty containers (canvas mode only);
  - keyboard navigation on the canvas, sharing `structure-keys.ts` with the tree;
  - partial re-render of a single changed component (`partial.ts`); label-only changes skip rendering.
- **Publishing** ([ADR 0023](decisions/0023-scheduled-publishing-and-version-comparison.md), [ADR 0022](decisions/0022-publish-permission.md)):
  - **Scheduled publishing** with no background job: every reader applies due schedules.
  - **Version comparison:** a change list plus both versions on the real page via the editors-only
    `?tapestry-version=…`. This also covers Phase 5's "visual diff".
  - **Publish permission** (`publishPermission`), enforced in the middleware by rewriting saves
    from non-publishers. The playground requires admin.
- Fixes found on the way:
  - StudioCMS can't delete any user (inverted check; patched, #35).
  - Constrained editor inputs silently blocked StudioCMS's Save (#36).
  - Canvas "pending" never cleared when an edit was undone before rendering.

### Learned
- A drag-enter timer in Pragmatic DnD got a spurious drag-leave right after entering; dwell
  measured in `onDrag` is robust.
- In e2e, drop zones appear when a drag starts and shift rows; `page.center()` scrolls; canvas
  markers have no box. Three test bugs, all from geometry assumptions.
- `next(request)` in Astro middleware rewrites the request for the endpoint (used by the publish guard).

### Verified
- Unit: Tapestry 270 (+55), media library 174.
- Lint and typecheck clean. New/updated e2e suites: layers 9, canvas 19, publishing 13, permissions 6.
- Full e2e run: all 14 suites, 139 steps pass.

### Next
- Dependabot config, then Phase 4: inline editing for plain text props, link prop, repeaters/objects,
  named slots, patterns, component thumbnails.

---

## 2026-10-06: Session 15: Clean console on public pages

**Request:** look at the console errors and warnings on public pages (Permissions-Policy
`attribution-reporting`, `SELECT * FROM "main".sqlite_schema`, a 500, a long `ParseError`)
and fix whatever comes up.

### Done
- **Captured it ourselves** with a CDP script that records console messages, exceptions,
  browser log entries, failed requests and policy headers. Covered logged out and logged in,
  dev and production, and home, other page, draft preview and 404.
- **StudioCMS dev-toolbar "Database Viewer"** (known issue #12) was the source of everything
  you listed:
  - It embeds an external site in an iframe and feeds it the local database; that site logs
    the `sqlite_schema` query and sends the `attribution-reporting` policy.
  - Its query endpoint answered 500, hence the `ParseError`.
  - The endpoint also ran any SQL **without a login** in dev.

  Patched: the toolbar app isn't registered, and the endpoint requires the owner role in dev too.
- **favicon.ico 404**: playground favicon (`public/favicon.svg` + `<link rel="icon">`).
- **Found on the way:** the public 404 page was StudioCMS's, rendered in the full dashboard
  layout (~190 KB, with the dashboard's hidden user forms; #34). Fix: the site's own
  `src/pages/404.astro` plus `features.dashboardConfig.inject404Route: false` (avoids the
  route collision). Now 1.5 KB in production.
- **Tests:** the e2e harness no longer ignores any console errors. New site step: a logged-out tab
  (`cdp.page({ isolated: true })`, its own browser context) must see no console messages, log
  entries or failed requests on the home page, and the 404 page must be the site's.

### Verified
- Console after the fixes:
  - Dev, logged out and logged in: only Vite's debug "connected" lines.
  - Production: nothing.
  - 404: only its own 404 status.
- All 12 e2e suites pass with no ignored errors (site suite now 12 steps); lint and typecheck clean.

### Next
- Upstream reports when asked (#12, #32, #33, #34).
- Phase 4: link prop, repeaters, named slots.

---

## 2026-10-06: Session 14: Dashboard CSS off public pages

**Request:** the logged-out home page has lots of inline `<style>` tags (Markdown heading
styles and more) that don't apply to anything; find out what they are and remove them.

### Done
- **Measured first**, dev vs. production, logged out:

  | | Dev page | Production page | Production stylesheets |
  | --- | --- | --- | --- |
  | Before | 295 KB, 102 style tags | 7.4 KB HTML | `DashboardLayout` 54 KB, `BaseLayout` 13 KB, `library` 8 KB, Markdown 1.9 KB |
  | After | 10 KB, 6 style tags (site's own) | 5.3 KB HTML | only the site's 3.2 KB inline CSS |
- **Traced** the import chains in the build graph ([ADR 0021](decisions/0021-keep-dashboard-css-off-public-pages.md),
  known issue #32):
  - StudioCMS's middleware imported a dashboard component (via `studiocms:i18n`);
  - Astro's manifest puts the middleware in every page's graph;
  - Astro's dev collector walks through the manifest.
- **Patched** (`pnpm patch`, reasons in `pnpm-workspace.yaml`):
  - StudioCMS middleware (one line);
  - Astro's dev CSS collector (stop at the manifest);
  - @studiocms/md: no global CSS; the layout inlines `studiocms:md/styles-inline` on Markdown pages (#33).
- **Media library:** stylesheet loaded on demand (`ui/styles.ts`, `?url` + `<link>`) instead of
  a CSS import in browser code.
- Dockerfile copies `patches/` before `pnpm install` (otherwise the image build fails).
- Known issues #2 (open since session 1) and #14 resolved.

### Learned
- Dev output isn't representative; check production builds for what visitors get.
- Astro 7 collects dev CSS in `vite-plugin-css`, not `crawlGraph` (a first dev patch in the wrong
  place did nothing; found by instrumenting).
- A first StudioCMS patch (`astro:config/server` → `import.meta.env.SITE`) wasn't enough, because
  `studiocms/effect` reaches the manifest too. Cutting the one bad edge (middleware → component)
  fixed it, and the extra patch was dropped.
- When instrumenting `node_modules`, move the original aside (keeps the pnpm store's hard link
  intact) and restore with absolute paths. One restore ran from the wrong directory and was
  caught and fixed right away.
- Left alone: the 174-byte transition-event polyfill from @studiocms/ui (the dashboard needs it;
  Astro can't inject per page).

### Verified
- Lint, typecheck, unit tests (174 + 215) clean; all 12 e2e suites pass. Screenshots: editor,
  picker and Media page fully styled (the library's CSS loads on demand).
- Production build and Docker image: the public page has only the site's CSS (plus the polyfill).
- Dev dashboard: the site layout's CSS no longer appears there.

### Next
- Report upstream when the user asks: StudioCMS (#32 middleware, #33 md), Astro (#32 dev collector).
- Phase 4: link prop, repeaters, named slots.

---

## 2026-10-06: Session 13: Media editing extras, resized images, CI

**Request:** continue the roadmap in the proposed order (replace file, folders/tags,
captions, focal point, responsive images, CI), **without S3** (no use for it now; maybe later).

### Done
- **Media editing extras** ([ADR 0019](decisions/0019-media-editing-extras.md)):
  - New columns (tags, focal point, tracks, variants), added to existing tables on first use.
  - Storage keys can carry a suffix, so a replaced file, a resized copy or a caption file always gets a new URL.
  - **Replace file** with the same checks as an upload, the same kind required; the id and its metadata are kept.
  - **Tags** with a toolbar filter and chips with suggestions.
  - **Focal point**, set by click or arrow keys, with crop previews.
  - **Captions/subtitles**: WebVTT, or SRT converted; files rebuilt by `subtitles.ts`.
  - **Resized WebP copies** with sharp (`srcset`), plus an admin backfill on the settings page.
  - `Media.astro` now emits `srcset`/`sizes`, `object-position` and `<track>`; the playground Hero uses a variant and the focal point.
  - Shared upload checks moved to `receive.ts`.
- **Bug fixed:** SQLite `LIKE` has no default escape, so the media search's backslash escaping
  never worked (`_`/`%` in a search matched wrongly). Search, tag filter and usage now use
  `LIKE ? ESCAPE '!'` (Kysely `sql`; kysely 0.29.6 added as a dependency, the version StudioCMS uses).
- **Delete button contrast:** StudioCMS's `--danger-base` is a dark fill; the button is
  now solid `--danger-vibrant` with white text, and error text mixes red with the text colour.
- **CI** ([ADR 0020](decisions/0020-continuous-integration.md)): `.github/workflows/ci.yml` with
  three jobs:
  - checks;
  - e2e on a fresh site: `CMS_SETUP=1` plus `scripts/setup-site.mjs` replace the browser wizard;
  - the production image, run hardened, healthcheck, non-root, plus a sharp check.

  Actions are pinned to SHAs, with a read-only token; the workflow passes `actionlint`.
- Dependencies: `sharp` 0.35.5 and `kysely` 0.29.6. Review in ADR 0019: provenance throughout,
  no install scripts.

### Learned
- **A bundled sharp can't load its binary** (known issue #30). Astro bundles workspace packages
  into `dist/server`. Only the production build showed it, and the Docker test caught it.
  Fix: resolve sharp at runtime from the package's install location.
- Running all suites against a **fresh** site (scratch DB, second dev server on :4500) found
  three test assumptions:
  - resetting an already-published demo page sends no save;
  - the media suite counted items it didn't add (session 12);
  - an inline-editing step raced the toolbar re-render (flaky, 2 of 4 runs).

  All fixed; the inline suite then passed 5 of 5 runs.
- StudioCMS dashboard saves go to the configured site URL, not the page's origin (#31).
- StudioCMS's setup wizard is two JSON endpoints; `process.env` works in `studiocms.config.mjs`.
- One "Failed to fetch NPM package data" burst (StudioCMS update check) in the container;
  outbound requests from the hardened container work, so it was a network blip.

### Verified
- Unit: media library 174 (+60), Tapestry 215. Lint, typecheck, audit (2 reviewed ignores),
  production build clean.
- e2e on the dev server: 12 suites, 136 steps (new: media extras 7). All 12 also pass against a
  fresh scratch site (the CI flow), where the backfill button was exercised too.
- Docker: image builds; in the production container, uploads make WebP copies, captions are
  converted and attached, `%` searches are literal; sharp resolves on a read-only filesystem.
- Smoke tests of every new endpoint; the user's library items untouched (the backfill e2e step
  skips itself when other images need copies).

### Next
- Push to GitHub to run CI; add Dependabot/Renovate for action SHAs.
- Phase 4: link prop (internal page picker), repeaters, named slots.

---

## 2026-10-06: Session 12: Media library settings page

**Request:** a settings page like Tapestry's where admins adjust the upload size limits
and turn SVG uploads on or off; then continue with the roadmap.

### Done
- **Plugins → Media Library → Uploads** ([ADR 0018](decisions/0018-media-upload-settings.md)):
  `SettingsPage.astro` (StudioCMS layout, inner sidebar, admins only), number inputs per kind
  (whole MB) and an SVG checkbox; `POST /_media/settings` (same-origin, admins, 8 KB, invalid
  input saves nothing and is reported); storage in `StudioCMSPluginData`.
- Pure `settings.ts` (parse/clean, form, env ceiling). New options `allowSvg` (default true) and
  `maxUploadSize` (default 1 GB; `MEDIA_MAX_UPLOAD_MB` overrides). Uploads read the settings on
  every request; `detectType(…, { allowSvg })`. `GET /_media/api/settings` for the library UI
  (no `.svg` in the file dialog when off; client-side size check uses the live limits).
- Docker: Caddy `max_size {$MEDIA_MAX_UPLOAD_MB:1024}MiB` (verified with `caddy adapt`: 1 GiB
  default, 300 MiB with the variable); `.env.production.example` documents it.

### Learned
- The media e2e suite assumed an empty library; with the user's own two items it passed its
  "5 uploads" wait early and cleaned up while uploads were still running (leaving two test files).
  It now counts only its own items. The Tapestry settings suite assumed Tapestry was the only
  plugin listed.
- One unexplained first-run failure of the new suite right after restarting the dev server
  (likely Vite's first compile of the page); 4 later runs passed.

### Verified
- Unit: media library 114 (+24), Tapestry 215. Typecheck, Biome, audit (2 reviewed ignores)
  clean; production build OK.
- e2e: all 11 suites, 122 steps (new: media settings 7).

### Next
- Media roadmap: captions, responsive images, focal point, replace file, folders/tags; CI.

---

## 2026-10-06: Session 11: @nascencestudio scope, media library, Docker

**Requests:** put everything under the user's business, Nascence Studio
(`@nascencestudio/tapestry`, `@nascencestudio/medialibrary`); build a Drupal-style
media library as a separate plugin (AVIF; SVG with sanitizing; 10 MB images, 200 MB
video; remote videos) usable from components and the rich text toolbar; Docker for a
Hetzner Cloud CPX server.

### Done
- **Rename** ([ADR 0015](decisions/0015-nascence-studio-namespace.md)): package, imports,
  docs, plugin id, settings page URL; toolbar settings read from the old row id too.
- **`@nascencestudio/medialibrary`** ([ADR 0016](decisions/0016-media-library.md)): content-based
  type detection (incl. AVIF), header-based image dimensions, allowlist SVG sanitizer,
  YouTube/Vimeo parsing with oEmbed titles, streamed uploads to local disk, Kysely table
  created on first use, editors-only API, public file route (ranges, sandbox CSP, nosniff),
  dashboard Media page (main sidebar group), picker dialog, `Media.astro`, server lookups.
- **Tapestry integration:** `media` prop type (`accept`), resolved to items in `Node.astro`;
  rich text `media` entry ("Insert media", `mediaAccept`) with editor previews (panel and
  canvas); virtual modules detect the library at build time (Tapestry works without it).
  Playground Hero has a background image; Text has "Insert media".
- **Docker** ([ADR 0017](decisions/0017-docker-deployment.md), [guide](guides/deployment.md)):
  multi-stage image (Node 22.23.3, Corepack pnpm, `pnpm deploy`), non-root, read-only FS,
  migrations at start, `/data` volume; Compose with Caddy (HTTPS, headers);
  `security.allowedDomains` so `Astro.url` is `https://` behind the proxy. `.nvmrc` → 22.23.3.

### Learned
- Fixture files for every format generated with `sharp` and `ffmpeg` (real headers).
- Optional peer dependencies on workspace packages need `workspace:^`, or pnpm asks the registry.
- Registering a plugin dashboard page activates StudioCMS's `/dashboard/[...pluginPage]`,
  which outranks `[dashboard]`-parameter routes (known issue #28); Tapestry now also
  registers the literal `/dashboard/...` path.
- Behind a reverse proxy, same-origin checks need Astro's `allowedDomains` (otherwise
  `Astro.url` is `http://` while browsers send `Origin: https://`).
- Two real UI bugs found by e2e: controlled inputs in the details panel lost typing on
  re-render; the media field's buttons jumped when the preview loaded.

### Verified
- Unit: media library 90, Tapestry 215. Typecheck, Biome, audit (2 reviewed ignores) clean;
  production build OK.
- e2e: editor 14, canvas 17, site 11, page types 5, publishing 11, rich text 12, inline 13,
  settings 6, media 8, media + Tapestry 8 (108 steps).
- Docker: image builds (35 s), fresh volume → migrations → healthy, non-root, read-only FS;
  backup command and CLI user creation checked in the container; Compose config validated.

### Next
- Media: captions, responsive images, replace file, folders/tags (known issue #29).
- CI building the image and running tests.

---

## 2026-10-06: Session 10: Icon-only formatting toolbar

**Request:** the toolbar mixed icons and words; use icons throughout, with the text
style (P, H1…) and alignment controls showing the current setting.

### Done
- `editor/icons.tsx`: inline SVG icons drawn for Tapestry (link, lists, quote, line,
  remove formatting, four alignments, chevron) and consistent letter glyphs.
- Text style and alignment became accessible **menu buttons** whose icon follows the
  cursor (P/H1–H6, alignment icon); native selects can't show icons
  ([ADR 0012](decisions/0012-rich-text.md), revision). Menus flip left near the right
  edge (found by a screenshot: the alignment menu opened off-canvas). Enter/Space on
  menu items handled explicitly; Escape in the toolbar returns to the text instead of
  deselecting the component (found by the e2e suite).
- e2e: inline suite +1 step (menus by mouse and keyboard, icons follow the text, menu
  inside the canvas) = 13; rich text and settings suites use the menus.

### Verified
- Unit 208/208; typecheck 0 errors; Biome clean; audit clean; production build OK.
- e2e: editor 14, canvas 17, site 11, page types 5, publishing 11, rich text 12, inline 13,
  settings 6 (89 steps).

---

## 2026-10-06: Session 9: More formatting (headings 1–6, alignment…); HTML plugin removed

**Requests:** turn the H3 button into an H1–H6 dropdown; add blockquote, strikethrough,
subscript, superscript and horizontal line buttons, and an alignment dropdown (left,
right, center, justify). Then: remove the HTML plugin (it was only a reference).

### Done
- Rich text ([ADR 0012](decisions/0012-rich-text.md), revision): toolbar entries
  `heading1`–`heading6`, `subscript`, `superscript`, `horizontalRule`, `alignLeft/Center/Right/Justify`;
  heading and alignment entries render as one dropdown each. Format: heading levels 1–6,
  optional `textAlign` on paragraphs/headings, `horizontalRule` nodes, sub/sup marks
  (mutually exclusive). Rendered as `h1`–`h6`, `hr`, `sub`, `sup` and a fixed
  `text-align` style. `stripDefaultAttrs()` keeps editor output byte-identical to stored values.
- Shortcuts: Ctrl/⌘+, / Ctrl/⌘+. (sub/sup), Ctrl/⌘+Alt+0–6 (paragraph/headings).
- Playground Text component: all of the above plus quote and strikethrough.
- **Toolbar settings now store turned-off buttons** (format 2, [ADR 0014](decisions/0014-admin-toolbar-settings.md)
  revision): with format 1, the new buttons were hidden until an admin enabled them
  (found by the e2e suite). Format 1 is still read.
- **HTML plugin removed** (user decision): package, config entry, `patches/` and
  `patchedDependencies`, the dev `optimizeDeps` workaround, its e2e steps. Known issues
  #19/#20 marked as no longer applying (kept for the upstream report). The lockfile lost
  CodeMirror and SunEditor with it.
- Tests: 9 new unit tests (208); rich text e2e gains a step for the new formatting and
  hostile alignment values (12 steps); page types suite now 5 steps.

### Verified
- Unit 208/208; `tsc`/`astro check` 0 errors; Biome clean; audit clean (2 reviewed ignores);
  production build OK.
- e2e: editor 14, canvas 17, site 11, page types 5, publishing 11, rich text 12, inline 12,
  settings 6 (88 steps).

---

## 2026-10-06: Session 8: Editable on selection; Tapestry under Plugins

**Feedback:** the second click to start editing wasn't intuitive and the double outline
looked bad; put the toolbar right under the chip, make room so it doesn't cover the
text, and drop the settings-panel field. "Text formatting" belongs under Plugins, as a
child of a "Tapestry" entry (more Tapestry settings later).

### Done
- **Editable on selection** ([ADR 0013](decisions/0013-inline-canvas-editing.md), revision):
  selecting a component (canvas or tree) makes its rich text editable at once; one click
  on text puts the caret there. Toolbar renders inside the canvas overlay under the chip;
  chip + toolbar sit above the component (below it without room, sticky for tall ones);
  `max-content` width, kept inside the visible area. No second outline.
- Typing doesn't re-render; other changes do and editing resumes with the same caret
  (`inline.suspend()/resume()`, session `selectionRange()/restoreSelection()`). Escape stops
  editing without deselecting; focus leaving the text no longer ends it. A static copy of
  the text stays visible until the re-render (no flash).
- Settings panel: "Edit this text directly on the canvas" with **Edit here instead**, only
  for fields the canvas can edit (`canvasTextTargets`).
- **Plugins → Tapestry → Text formatting** ([ADR 0014](decisions/0014-admin-toolbar-settings.md), revision):
  empty `settingsPage` (lists Tapestry under Plugins) + Tapestry's own page in StudioCMS's
  dashboard layout with a double sidebar; served at both the URL StudioCMS links to and the
  intended one; own session checks. The Admin entry is gone.
- e2e: inline suite rewritten (12 steps); rich text and settings suites use the new
  panel button and page URL.

### Learned
- StudioCMS's plugin links are missing a slash (#27); `requiredPermissions: 'none'` means
  no authentication; the double sidebar script needs `#back-to-outer` / `#show-page`;
  `studiocms/frontend/*` is exported and usable from plugins.
- Measure overlay elements after placing them horizontally: a wrapping toolbar changes
  height with position (it overlapped the text at first).
- ProseMirror empties its mount element on `destroy()`.

### Verified
- Unit 199/199; `tsc`/`astro check` 0 errors; Biome clean; audit clean; production build OK,
  and the Tapestry page renders on the production server at both URLs.
- e2e: editor 14, canvas 17, site 11, page types 9, publishing 11, rich text 11, inline 12, settings 6 (91 steps).

---

## 2026-10-06: Session 7: Remove formatting, inline canvas editing, admin toolbars

**Request:** the three rich text follow-ups: a "remove formatting" button, typing
directly on the canvas, and Drupal-style admin control of toolbar buttons.

### Done
- **Remove formatting** (`clearFormatting` button, Ctrl/⌘+\): removes marks from the
  selection, or stops typing with them. Added to the default toolbar and the
  playground Text component. It's an action, so it doesn't affect the allowlist.
- **Shared editor core** `editor/richtext-editor.tsx` (session: view, toolbar state,
  sync, focus-at-point; `RichTextToolbar`). `RichTextField` became a thin wrapper.
  Schema cache keyed by what's allowed, so fields that differ only in action buttons
  share a schema.
- **Inline editing on the canvas** ([ADR 0013](decisions/0013-inline-canvas-editing.md)):
  server-side owner registry + `<tapestry-canvas-text>` markers (canvas mode only),
  `canvas/inline.ts`, controller integration (double-click, click selected text,
  Enter; renders paused while editing; Escape doesn't also deselect), header toolbar
  with Done. Inserted links keep the active formatting (found by the e2e test).
- **Admin toolbar settings** ([ADR 0014](decisions/0014-admin-toolbar-settings.md)):
  `toolbar-settings.ts` (pure), dashboard page "Text formatting" (admins), admins-only
  `POST /_tapestry/settings`, storage in `StudioCMSPluginData`, settings applied to the
  editor's manifest.
- Tests: 15 new unit tests (199), e2e suites "inline editing" (10 steps) and
  "settings" (6 steps), both in `pnpm e2e`.

### Learned
- **StudioCMS `usePluginData()` can't save** (known issue #25): insert crashes, update
  silently does nothing, because the write goes through a cache already holding the
  lookup. Worked around with direct Kysely access to the same row.
- StudioCMS's generated `settingsPage` can't show saved values; `dashboardPages` with
  our own component can. Page URLs turn dashes into underscores (#26).
- Plugins *can* create tables (the Web Vitals plugin does); ADR 0011 annotated.
- ProseMirror works with its DOM in the canvas iframe while running in the dashboard window.
- **Correction:** last session's "editor main chunk ~24 KB" left out an 11 KB shared
  chunk. First load is ~35 KB gzipped (22.5 + 11.4 + ~1); docs fixed.

### Verified
- Unit 199/199; `tsc`/`astro check` 0 errors; Biome clean; audit clean (2 reviewed ignores);
  production build OK.
- e2e: editor 14, canvas 17, site 11, page types 9, publishing 11, rich text 11, inline 10,
  settings 6 (89 steps).

### Next
- Inline editing for plain text props (would need a component-side marker).
- Report upstream: #25 (plugin data), together with the earlier list when asked.

---

## 2026-10-05: Session 6: Rich text with a configurable toolbar (ProseMirror)

**Request:** a CKEditor-style formatting toolbar for body text, simple, with the
buttons chosen per field. The user picked ProseMirror (no Meta libraries, so not
Lexical). Decision: [ADR 0012](decisions/0012-rich-text.md).

### Done
- `richtext` prop type with a `toolbar` option (11 possible buttons; also the
  allowlist), `maxLength`, and a plain-text or rich `default`. Definition checks
  for unknown/duplicate buttons and defaults the toolbar wouldn't allow.
- `richtext.ts` (pure): stored format (ProseMirror JSON shape), `cleanRichText()`
  (toolbar allowlist, safe links, limits, plain-string conversion),
  `toRenderTree()`, plain-text helpers. Validator cleans rich text props (warning
  when formatting is removed; empty counts as missing).
- `RichText.astro` (`@tapestry/studiocms/RichText.astro`): recursive render from an
  allowlisted element tree, no `set:html`.
- Editor: `richtext-schema.ts` (schema per toolbar, safe paste rules) and
  `RichTextField.tsx` (toolbar with pressed states, shortcuts, inline link form,
  ProseMirror history), loaded as a separate chunk.
- Playground: Text component switched to `richtext` (bold, italic, link, lists, H3);
  the demo page has one rich text block and two plain-string ones (to exercise conversion).
- Dependencies: 8 ProseMirror packages (+3 transitive), reviewed in ADR 0012.
- Tests: 37 new unit tests (184 total), a new e2e rich text suite (11 steps) in `pnpm e2e`.

### Learned
- **Preact runs `useEffect` after paint.** Syncing outside changes into the field
  in a passive effect raced with fast typing: an older value was "restored" and the
  cursor jumped to the start (the e2e list step caught it). The sync is now a
  `useLayoutEffect`.
- **JSON key order matters** because documents are compared as strings (draft vs
  published). ProseMirror writes text nodes as `{ type, marks, text }`; the cleaner
  now does too, and a unit test checks byte-identical round trips.
- ProseMirror is ~67 KB gzipped, more than the 40–60 KB I'd estimated. Loading it
  on demand keeps the editor's main chunk at ~24 KB (gzip -9; the earlier "27 KB"
  figure used a different measurement).
- Process slip: I ran `npx --no-install tsc` once (npm tooling) instead of
  `pnpm exec tsc`. It found nothing to run and installed nothing; noted here because
  the rule is pnpm only.

### Verified
- Unit 184/184; `tsc`/`astro check` 0 errors; Biome clean; audit clean (2 reviewed ignores).
- e2e: editor 14, canvas 17, site 11, page types 9, publishing 11, rich text 11.
- Production build: rich text renders; public pages still load only Astro's 174-byte script.

### Next
- Inline text editing on the canvas (can reuse the schema and field).
- Phase 4: images, links to internal pages, repeaters.

---

## 2026-10-05: Session 5: Drafts, publishing and a 5-version history

**Request:** Drupal-style page status for Tapestry pages: save as a draft, publish
deliberately, keep 5 previous published versions. Scope: Tapestry only (no
StudioCMS changes). Decision: [ADR 0011](decisions/0011-draft-publish-history.md).

### Done
- `revisions.ts` (pure, 13 tests): stored page format 2 (`published`, `draft`,
  `history`), read-compatible with format-1 documents and `""`; `saveDraft`,
  `publish` (history capped at `historyLimit`, default 5), `discardDraft`,
  `restoreToDraft`, `documentFor`, `pageStatus`.
- Renderer renders `published` only. `getPage()` serves the draft to editors with
  `?tapestry-preview` and in the canvas, 404s never-published pages for visitors,
  and copies StudioCMS's cached page object instead of changing it.
- Editor: `publishing.ts` keeps the stored page in sync with the field;
  toolbar status pill, **Save draft**, **Publish**, **History (n)** panel with
  Restore to draft and Discard unpublished changes (both undoable). The JSON view
  accepts a pasted format-2 stored page.
- Admin bar: publishing status, **Preview draft** / **View published** links.
- **Found a leak and closed it:** StudioCMS's anonymous REST API
  (`/studiocms_api/rest/v1/public/pages`) returns raw stored content, so drafts and
  history would have been public (known issue #22). New plugin middleware
  (`runtime/middleware.ts` + pure `public-content.ts`, 9 tests) redacts every JSON
  response for non-editors. It matches on content because StudioCMS's router accepts
  `/pages/`, `//pages`, `/%70ages`, `/./pages` and `/pages;x`. Verified in dev
  (e2e) and against the production build.
- `getViewer()` moved to `runtime/viewer.ts` (still exported from `/page`).
- New e2e publishing suite (11 steps); added to `pnpm e2e`.
- `source-map-js` forced to 1.2.2 (`overrides`, GHSA-68fv-2mgg-jv7q, published
  2026-09-30, same maintainer, past the release-age gate).

### Learned
- **SQLite locking breaks StudioCMS saves** (known issue #23): the playground DB uses
  a rollback journal. The e2e helper polling the DB during saves made StudioCMS's
  update fail with HTTP 400, and after many overlaps, the dev server hung (logins
  returned 500) until restarted. `saveAndWait()` now waits for StudioCMS's save
  response over CDP, and `storedContent()` retries `SQLITE_BUSY`.
- StudioCMS's success toast covers the toolbar's Publish button for a few seconds
  (known issue #24); the harness's `page.click()` now waits until the target is
  actually under the pointer.
- StudioCMS's Edit History revert restores the whole stored page, including the
  live version (known issue #21). Use Tapestry's History panel.

### Verified
- Unit 147/147; `tsc`/`astro check` 0 errors; Biome clean; audit clean (2 reviewed
  ignores); production build OK (and API redaction checked on the built server).
- e2e: editor 14, canvas 17, site 11, page types 9, publishing 11. Three consecutive full
  runs passed before the middleware was added and one full run after it.

### Next
- Report upstream: #22 (public API exposes content), #23 (SQLite locking).
- Possible publishing follow-ups: scheduled publish, compare versions, separate
  publish permission.

---

## 2026-10-05: Session 4e: Remove WYSIWYG, fix the HTML editor's saving

**Reports:** WYSIWYG pages showed "Error parsing content"; HTML pages showed
"Error: No content found". The user asked to remove WYSIWYG and fix HTML.

### Findings
- **HTML (known issue #20):** reproduced. Typed text never reached the
  `page-content` textarea, so Save stored `""`. A regression in `@studiocms/html` 0.4.0
  (SunEditor 2 → 3 rewrite) dropped 0.3.0's `editor.onChange → editor.save()` sync.
  In SunEditor 3 the textarea is written only by its own "save" command.
- **WYSIWYG "Error parsing content"** on empty pages: StudioCMS substitutes
  `<h1>Error: No content found</h1>` for empty content and the WYSIWYG renderer
  `JSON.parse`s it. Not investigated further at the user's request.

### Done
- Removed `@studiocms/wysiwyg` (after confirming no WYSIWYG pages existed), its config
  entry, the `canvas` build denial, and its e2e cases. `pnpm audit` is back to clean
  (2 reviewed ignores).
- Fixed HTML via `pnpm patch` → `patches/@studiocms__html@0.4.2.patch` (`events.onChange`
  writes `$.html.get()` into the textarea), registered with a reason and exit condition.
- New e2e step: type into the HTML editor → Save → check the DB and the public page.
- Found while verifying: on a fresh dev server, Vite discovered the editor's
  dependencies on first visit and **reloaded the page**, which caused a one-off
  editor-suite failure. The plugin now pre-bundles them (`optimizeDeps.include`
  with `@tapestry/studiocms > …`). Verified: no reload message after clearing the Vite cache.

### Verified
- Unit 125/125; `tsc`/`astro check` 0 errors; Biome clean; audit clean (2 reviewed);
  production build OK.
- e2e from a fresh dev server: editor 14, canvas 17, site 11, page types 9, twice.

---

## 2026-10-05: Session 4d: StudioCMS page types, broken empty-type page, cleanup

**Reports:** only "Tapestry" in the page-type dropdown; a page created without a type
crashed the edit screen ("CurrentEditorComponent is undefined") and couldn't be deleted.

### Findings (known issues #15–19)
- StudioCMS ships **no** page types; the playground had only Tapestry. Not an override.
- The create form hard-codes `defaultValue="studiocms/markdown"`; without that plugin
  it submits `""`, and neither the form nor the server rejects it. The edit screen then
  renders an undefined editor, and Delete is unreachable. (StudioCMS bugs.)

### Done
- Installed `@studiocms/md`, `@studiocms/html` and `@studiocms/wysiwyg` (all with
  provenance, past the age gate) and registered them before Tapestry.
- Denied `canvas`'s install script (native module from the WYSIWYG image editor's
  fabric@4; Node-only).
- Deleted "Test One" (id `bf7cf9fc…`, empty type and content) through StudioCMS's
  `DELETE /studiocms_api/dashboard/content/page`; verified no leftover rows. The user's
  own new pages ("html", "wys") were not touched.
- Dev fix for the HTML editor: `optimizeDeps.include` for CodeMirror + its htmlmixed mode
  + SunEditor (it silently failed to load in dev; production was fine).
- New `page-types.e2e.mjs` (11 steps): create-form default and options, then per type:
  create, its own editor really loads (no Tapestry UI), and it renders via `getPage()`
  with the admin bar for editors only. The first version only checked that the editor
  area was non-empty and passed while the HTML editor was broken; it now waits for each
  real editor.

### Open
- **WYSIWYG adds 21 audit advisories** (2 critical, 10 high) via fabric@4, including two
  dashboard XSS advisories without a compatible fix. Left failing in `pnpm audit` pending
  the user's decision (known issue #18).

### Verified
- Unit 125/125; `tsc`/`astro check` 0 errors; Biome clean; production build OK.
- e2e: editor 14, canvas 17, site 11, page types 11, repeated runs green.

---

## 2026-10-05: Session 4c: Dashboard light mode unreadable in dev (user-reported)

**Report:** after switching StudioCMS to light mode, headings and tabs were about
the same color as the background.

### Diagnosis (known issue #14)
- Measured: text `rgb(0,0,0)` on body `rgb(18,18,22)`, contrast 1.12:1. The dark
  background came from the **playground's** `Layout.astro` (`body { background:
  var(--background) }`, dark values via `prefers-color-scheme`), not from StudioCMS.
- In `astro dev`, dashboard pages load the global CSS of **every site page**
  (a never-visited probe page's CSS appeared after a restart). Ruled out: route
  matching, load order, Tapestry's admin bar. Production is clean, and StudioCMS
  light mode measures 19.6:1.
- Name clash too: StudioCMS's `auth-layout.css` uses `var(--background)`/`var(--text)`.

### Fix
- Playground: site styles scoped to `<body class="site">`, variables renamed to
  `--site-*`; components updated.
- That surfaced a Tapestry weakness: `.site a` beat the admin bar's class-based
  isolation (purple links). The admin bar's selectors are now anchored on
  `#tapestry-adminbar`.
- Docs: site-author guidance (defining-components guide), troubleshooting row,
  ADR 0009 and admin-bar notes.
- The dev server needed a restart to stop serving the stale leaked stylesheet.

### Tests
- Site suite +1 step: dashboard light-mode contrast ≥ 4.5:1 (it failed at 1.12:1
  before the fix). Admin bar link color asserted. All suites green: editor 14,
  canvas 17, site 11; unit 125.

---

## 2026-10-05: Session 4b: Fix canvas drag-to-reorder (user-reported)

**Report:** reordering by dragging works in the page structure but not in the
canvas; the cursor turns into a hand on hover, but dragging never starts.

### Root causes
1. **The chip handle's drag was aborted instantly.** Our `dragstart` handler changed
   the overlay's class, which set `pointer-events: none` on the chip (the drag
   source) during `dragstart`; `dragover`/redraw also set the chip to `display: none`.
   Chrome aborts the drag: a real mouse drag logged `dragstart@33 dragend@34`. The
   suite missed it because it tested chip drags with **synthetic** `DragEvent`s.
2. **Components couldn't be dragged directly at all.** Only the small chip handle
   was draggable. Users naturally grab the component itself (as in the layer tree).

### Fix
- Drag handling moved to document-level `mousedown`/`dragstart`/`dragend` in the
  canvas. Pressing a component makes its top element draggable. The selected
  component wins if the press is inside it, otherwise the innermost one. Links and
  images move their component. The drag source is never modified during
  `dragstart` (visual changes deferred), and the chip stays rendered while dragged.
- Grab cursor on components in the canvas.

### Tests
- New `page.realDrag()` (genuine mouse input, no interception), which really runs
  native drag and drop inside the iframe in headless Chrome. Canvas suite: 13 → 17
  steps: chip drag, direct component drag, selected-container drag, link drag,
  grab cursor, all with real drags.
- Test-tooling lessons: resolve both drag points before pressing (a scroll in
  between cancels the drag); `childIds()` must search the whole tree.

### Verified
- Unit 125/125, `tsc`/`astro check` 0 errors, Biome clean; e2e editor 14 + canvas 17 + site 10,
  repeated runs green.

---

## 2026-10-05: Session 4: Visual canvas (Phase 3)

**Goal:** Make the editor visual: the editing surface should look exactly like
the public page, as in Drupal Canvas.

### Design ([ADR 0010](decisions/0010-visual-canvas.md))
The canvas is the page's real URL in an iframe with `?tapestry-canvas`. `getPage()`
enables **canvas mode** for editors (an `Astro.locals` flag), so `Root.astro`/`Node.astro`
emit invisible `display: contents` markers. Edits are POSTed to a new editors-only
`/_tapestry/render` endpoint and swapped into the iframe without reloading.
Checked first: no frame-blocking headers or CSP on StudioCMS pages.

### Built
- Server: `ROOT_ELEMENT` (`tapestry-root`) + node ids in the renderer output;
  `canvas-mode.ts`, `Root.astro`, canvas-aware `Node.astro`, `Render.astro` (injected
  route); `getPage()` canvas mode; admin bar hidden in the canvas;
  `tapestryComponentRegistry()` now returns both wrappers.
- Editor: `canvas/geometry.ts` (pure drop placement, 10 tests), `canvas/controller.ts`
  (live swap, overlay, chip, selection, native DnD, keyboard), `canvas/Canvas.tsx`
  (viewports, status, reload); shared `activeDrag` + `applyDrop()` in `dnd.ts`;
  new layout (canvas centre or top), full-screen mode, Save button, Ctrl/⌘+S.
- e2e: `canvas.e2e.mjs` (13 steps); helpers moved to `helpers.mjs`; `drag()` accepts
  computed points; the error filter ignores StudioCMS dev-toolbar sources by stack URL.

### Bugs and findings
1. **Dev styles leaked into the canvas.** The render endpoint's dev output carries
   Astro's `<style>` tags (including StudioCMS dashboard CSS) inside the content
   root; swapping them in would restyle the site. Caught by the visual-parity e2e
   step → page-level tags are stripped on swap.
2. **`all: unset` disables native dragging.** It resets `-webkit-user-drag`, so the
   chip's drag handle wasn't draggable for real users → restored explicitly.
3. **CDP can't intercept drags that start inside an iframe** (only top-level frames).
   The chip-drag test checks native draggability and dispatches drag events in the iframe.
4. **Clicks racing a re-render** could miss the moving chip → the iframe gets
   `data-tapestry-pending` while an update is queued or in flight; tests wait on it.
5. **Correction:** the DB Studio error from session 3 wasn't fixed by the 0.6.1
   upgrade. It's StudioCMS's dev-toolbar "DB viewer" app (dev-only, intermittent;
   known issue #12). Known-issues entry corrected.
6. `Astro.locals` set in a page reaches registry-rendered components (research notes).

### Verified
- Unit 125/125; `tsc` + `astro check` 0 errors; Biome clean; audit clean apart from the 2 reviewed advisories.
- e2e: editor 14 + canvas 13 + site 10 steps, all passing on repeated runs (canvas suite 4× in a row after the last fix).
- Production: canvas markers only for editors, render fragment clean (no style or script tags),
  editor chunk 27.2 KB gzipped (was 22.5).

### Next
1. Inline text editing on the canvas; per-node partial re-render.
2. "View page" for all page types; separate-tab Preview of unsaved changes.
3. Phase 4: rich content (images, rich text, named slots).

---

## 2026-10-04: Session 3: Admin bar and draft-safe pages

**Goal:** The user noticed StudioCMS has no preview, no way to jump from the
dashboard to the live page, and nothing like Drupal's admin toolbar. We
investigated, then built the first two pieces: draft-safe page loading and an admin bar.

### Investigation
- StudioCMS ships a client-side **Quick Tools** corner menu (avatar bottom-right, shown
  after the first mouse movement, ~18 KB script to every visitor). Its "Edit" goes to the
  content list, not the current page. There's no "view page" in the dashboard and no preview.
- No third-party plugins exist (the ecosystem is 8 official packages).
- **Security finding:** `GET.page.bySlug()` doesn't filter drafts, and the official
  `@studiocms/blog` route (which our playground copied) serves drafts publicly
  (known issue #10).
- StudioCMS only resolves the session on dashboard/API routes; public routes must ask
  via `User.getUserData()` from `studiocms:auth/lib` (research notes updated).

### Built ([ADR 0009](decisions/0009-server-rendered-admin-bar.md), guide: [admin-bar.md](admin-bar.md))
- `src/access.ts`: pure rules: permission ranks, `isEditor`, `pageAccess` (draft
  visibility + headers), `pagePath` (URL pattern). 10 new unit tests (114 total).
- `src/runtime/page.ts` → `@tapestry/studiocms/page`: `getViewer()`, `getPage()`.
- `src/runtime/AdminBar.astro` → `@tapestry/studiocms/AdminBar.astro`: zero-JS bar;
  markup **and** CSS emitted only for editors.
- Editor toolbar: **View page ↗** (from the slug field + new `pageUrlPattern` option via
  `virtual:tapestry/config`).
- Playground: route uses `getPage()`, layout renders `<AdminBar>`, corner menu disabled.
- e2e: shared `helpers.mjs`; new `site.e2e.mjs` (10 steps); `pnpm e2e` runs both suites.

### Bugs and surprises
1. Astro bundles a component's CSS whenever it's imported, so the bar's styles reached
   anonymous visitors → moved to an inline `<style>` rendered only with the bar.
2. `all: initial` on `.tapestry-adminbar *` would also un-hide a `<style>` placed inside
   the bar (CSS printed on the page) → the style sits next to the `<nav>`, plus an e2e check.
3. **`injectQuickActionsMenu` must be under `features`.** The top-level key is silently
   ignored, which is why session 1 thought it "didn't work". Public JS: 18,714 B → 174 B.
4. The editor suite caught a new browser error: StudioCMS DB Studio returned 500 on the
   edit page. Upgrading to **studiocms 0.6.1** (`@libsql/client` 0.18) fixed it.
5. Biome's import sorting moved a comment block under an import → restructured.

### Dependency changes
- studiocms 0.6.0 → **0.6.1**, `@libsql/client` 0.17.4 → **0.18.0**: removed the
  `peerDependencyRules` exception.
- vitest 5.0.2 → **5.0.3**: removed the `why-is-node-running` override.
- `pnpm audit`: clean apart from the 2 reviewed advisories; peers clean.

### Verified
- Unit 114/114; `tsc` + `astro check` 0 errors; Biome clean.
- e2e: editor 14/14 + site 10/10, three consecutive runs on the final code.
- Production: anonymous home page has no admin bar markup or CSS, 174 B of JS; anonymous
  draft → 404.

### Next
1. "View page" on StudioCMS's edit screen for all page types (check dashboard augments).
2. **Preview** of unsaved changes via `getPage()` + session-stored drafts, leading into Phase 3.
3. Report upstream: draft leak in `bySlug`/blog route; silently ignored config keys.

---

## 2026-10-02: Session 2: Visual editor MVP (Phase 2)

**Goal:** Build the drag-and-drop editor. The user asked whether to build on Puck.

### Puck evaluation → build our own ([ADR 0006](decisions/0006-build-our-own-editor-not-puck.md))
Measured in a scratch directory (outside the repo): Puck 0.23 needs React, bundles
to **367 KB gzipped** (303 KB even on `preact/compat`, which is unsupported), installs
115 packages, has **no provenance on any release**, and its canvas renders React
components, which our server-only Astro components can't be. We borrowed its UX
patterns instead.

### Drag-and-drop choice ([ADR 0007](decisions/0007-drag-and-drop-library.md))
Pragmatic DnD core + list-item hitbox (~7 KB gzipped) over `@dnd-kit/dom` (~35 KB,
pre-1.0). Pragmatic has no provenance; mitigated by pins, the age gate, and a tiny
dependency tree. Its 3.x/4.x import paths differ from most online examples.

### Built (`packages/tapestry/src/editor/`)
- `tree.ts`: pure immutable tree operations (insert, remove, move with cycle and
  `acceptsChildren` checks, update props, duplicate with fresh ids, keyboard nudges,
  insertion targets, valid initial props for required fields).
- `store.ts`: signals store with undo/redo (100 steps, typing coalesced per field).
- `dnd.ts`, `Library.tsx`, `Layers.tsx`, `PropsPanel.tsx`, `JsonView.tsx`, `App.tsx`,
  `mount.tsx`, `editor.css`. `Editor.astro` now mounts the Preact app (textarea
  fallback without JS).
- `validatePropValue()` exported from the validator for per-field errors.
- Playground: `scripts/demo-document.mjs` (shared demo page), `pnpm seed` now updates
  in place (preserves StudioCMS revision history), `e2e/` harness and suite.

### Browser e2e ([ADR 0008](decisions/0008-browser-e2e-via-cdp.md))
Dependency-free CDP client (Node 22 WebSocket + local Chrome). The 14-step suite
covers mounting, no-rewrite-on-open, prop editing, Enter-doesn't-save, library add,
keyboard move/undo/redo/delete, **native drag and drop** (reorder across containers,
drop inside a container, refusing cycles), **Save through StudioCMS** (DB checked),
public render, and no browser errors. Passed 4 consecutive runs.

### Bugs found by the e2e suite (all fixed)
1. Hidden row action buttons (`opacity: 0`) were still clickable → now `visibility: hidden`.
2. After deleting the focused row, focus fell to `<body>` and Ctrl+Z stopped working →
   undo/redo listen on the document, scoped to the editor or `<body>`.
3. Enter in a settings input submitted StudioCMS's form, which **saves the page** → suppressed.
4. Layout: the dashboard's content area is ~815 px wide, which squeezed the layer tree →
   container-query layout (three columns, or library strip on top, or stacked).
5. CSS cascade order made container-query rules lose to base rules → moved them last.

### Other findings
- StudioCMS saves unknown **named** form fields as plugin data. Editor controls are
  unnamed on purpose.
- StudioCMS caches pages (5 min), so direct DB writes (`pnpm seed`) may not show
  until the cache expires; the e2e suite resets through the editor instead
  (known issue #7).
- Someone (the user) created a draft "Test" page and saved Home via the dashboard;
  that revision history is why `pnpm seed` hit a foreign-key error and now updates in place.
- Two new **high** advisories with no patches (http-cache-semantics, braces). Reviewed:
  not exploitable here; ignored with reasons and a 2026-11-01 re-check (known issue #8).

### Verified
- Unit tests: 104 pass (29 new for the editor tree and store). `tsc` and `astro check`:
  0 errors. Biome: clean. `pnpm audit`: clean apart from the 2 reviewed advisories.
- e2e: 14/14, stable over repeated runs.
- Production build: editor chunk **22.5 KB gzipped**, dashboard-only.

### Next
1. Phase 3: live preview (authenticated preview endpoint, iframe canvas, click to select,
   viewport switcher).
2. Upgrade to studiocms 0.6.1 (≥ 2026-10-04), drop the peer rule.
3. Re-check the ignored advisories on 2026-11-01.

---

## 2026-10-02: Session 1: Foundation and render pipeline (Phases 0 and 1)

**Goal:** Kick off the project: pick an architecture for a Drupal Canvas-style
builder on Astro + StudioCMS, set up a secure monorepo, and get the smallest
end-to-end slice working, with thorough documentation.

### Research
- **Drupal Canvas**: React editor; code components run on **Preact**; SDC
  components with props and slots. Notes: [research/drupal-canvas.md](research/drupal-canvas.md).
- **StudioCMS 0.6 plugin API** (read from source; the docs are outdated): page
  types with `rendererComponent` + `pageContentComponent`; the renderer returns
  HTML; the **component registry** swaps custom elements for Astro components.
  Notes: [research/studiocms-internals.md](research/studiocms-internals.md).
- Latest versions: astro 7.3.5, studiocms 0.6.1 (blocked by age, so 0.6.0),
  preact 11 (unsupported by `@astrojs/preact`, so 10.x), TypeScript 7
  (unsupported by `@astrojs/check`, so 6.0.3).

### Decisions
- [ADR 0001](decisions/0001-build-as-a-studiocms-page-type-plugin.md): ship as a StudioCMS page-type plugin.
- [ADR 0002](decisions/0002-preact-for-editor-ui.md): Preact 10 + signals for the editor (DnD library TBD).
- [ADR 0003](decisions/0003-pnpm-and-supply-chain-hardening.md): pnpm 12 with release-age, trust, and build-script policies.
- [ADR 0004](decisions/0004-single-wrapper-element.md): one `<tapestry-node>` wrapper with URL-encoded props.
- [ADR 0005](decisions/0005-json-tree-document-format.md): versioned JSON tree document.

### Built
- Monorepo: `packages/tapestry` (`@tapestry/studiocms`), `playground`, Biome, Vitest, TS 6 strict.
- Plugin: `defineComponent`, `toManifest`, validator (limits, URL safety,
  never-throw cleaning), renderer, virtual modules, `Node.astro`, StudioCMS
  renderer, Phase 1 JSON editor with live validation.
- Playground: Astro 7 + StudioCMS 0.6 + local libSQL; six components (section,
  hero, heading, text, button, columns); catch-all page route;
  `pnpm seed` demo page script.
- Docs: CLAUDE.md, README, architecture, data model, security, roadmap, known
  issues, guides, research, ADRs.

### Course corrections (worth remembering)
1. **Per-component custom elements → single wrapper.** The first design emitted
   `<tapestry-hero heading="…">`. A test through the real ultrahtml pipeline
   showed attribute values aren't entity-decoded (`&quot;` would show up on the
   page) and every prop arrives as a string. Switched to ADR 0004. Bonus: typed
   props, and one registry line instead of one per component.
2. **Component types relaxed** from custom-element names (`tapestry-hero`) to
   kebab-case (`hero`), since they're no longer HTML tag names.
3. **Prop names starting with `on` are banned outright**, because components
   receive props as objects and may spread them onto elements.

### Supply-chain events (all investigated, none bypassed)
- `@parcel/watcher`, `msgpackr-extract` wanted install scripts → denied (optional accelerators).
- `why-is-node-running@3.2.2` flagged as a trust downgrade (no provenance) → overridden to 3.2.1 (same as Vitest upstream).
- `undici-types@6.21.0` flagged (Nov 2024 manual publish) → added `trustPolicyIgnoreAfter: 180 days`.
- `@libsql/client` peer conflict inside studiocms 0.6.0 → pinned 0.17.4 + `peerDependencyRules`.
- `pnpm audit`: no known vulnerabilities.

### Verified
- 75 unit tests pass (definitions, validation incl. prototype pollution and
  URL schemes, rendering, the real ultrahtml sanitize+swap pipeline, virtual modules).
- `tsc` (plugin) and `astro check` (playground): 0 errors. Biome: clean.
- Dev server: the seeded page renders real Astro components; quotes,
  ampersands, `<b>` and emoji come through correctly escaped; nested children,
  number and boolean props work.
- Dashboard: logged in via API; the edit page renders the Tapestry editor with
  the stored document; the page type appears as "Tapestry (visual builder)".
- Production: `astro build` succeeds (with the CSS workaround) and the built
  server renders the page.

### Problems found upstream
See [known-issues.md](known-issues.md) #1 (nested `@keyframes` breaks the
build), #2 (StudioCMS CSS/JS on public pages), #4 (peer conflict), #5 (outdated docs).

### Local environment notes
- Dev admin `tapestry-dev`; password in `playground/.dev-credentials` (gitignored).
- Database: `playground/studiocms.db` (gitignored).

### Next
1. Manually check the dashboard save round trip (known issue #3).
2. Upgrade to studiocms 0.6.1 after 2026-10-04; drop the peer rule.
3. Phase 2: drag-and-drop spike → ADR → Preact editor MVP.
4. Report the `@keyframes` bug upstream; investigate the public-page payload.
