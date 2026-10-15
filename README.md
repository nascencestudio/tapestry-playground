# Tapestry playground

An [Astro](https://astro.build) + [StudioCMS](https://studiocms.dev) site for developing, testing
and demonstrating [Tapestry](https://github.com/nascencestudio/tapestry) (drag-and-drop page
building), the [media library](https://github.com/nascencestudio/medialibrary) and
[Tapestry SEO](https://github.com/nascencestudio/tapestry-seo), all by Nascence Studio.

It contains:

- **The demo site**: example Tapestry components (`src/components/tapestry/`, registered in
  `src/tapestry.config.mjs`), a page route using `getPage()` and the admin bar, translations
  (English and French), an interactive island, and a seeded demo page.
- **Browser tests** (`e2e/`): 27 suites driving headless Chrome over the DevTools protocol, no
  test framework, plus accessibility checks with axe-core.
- **A performance budget** (`pnpm budget`): what visitors download from a production server.
- **Deployment**: a Docker image and Caddy (HTTPS) for a single server
  ([deployment guide](docs/guides/deployment.md)).
- **Dependency patches** (`patches/`, reasons in `pnpm-workspace.yaml`): fixes for StudioCMS,
  its SDK, Astro and `@studiocms/md` that the site needs.
- **Working notes**: the [devlog](docs/devlog.md), [research](docs/research/) on StudioCMS
  internals and Drupal Canvas, and [upstream issue drafts](docs/upstream/).

## Quick start

Requires Node ≥ 22.12 and pnpm ≥ 12 (**pnpm only**).

```sh
pnpm install
cp .env.example .env    # set CMS_ENCRYPTION_KEY to the output of: openssl rand --base64 16
pnpm migrate
CMS_SETUP=1 pnpm dev && node scripts/setup-site.mjs   # first run only: creates the owner account
pnpm exec astro dev stop && pnpm dev
pnpm seed               # the demo home page
pnpm e2e                # browser tests (dev server running)
```

Details, including testing an unreleased Tapestry checkout (`file:../tapestry`):
[docs/guides/development.md](docs/guides/development.md).

## License

[MIT](LICENSE) © Nascence Studio
