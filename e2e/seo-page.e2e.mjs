// End-to-end tests for per-page SEO (tapestry-seo ADR 0002, Tapestry ADR 0040): the SEO button in
// Tapestry's editor bar, the dialog (fields, counters, previews, the media picker), saving at once
// (outside the page's draft), what visitors and crawlers get (<Seo> tags, the sitemap), and the
// site defaults on the Tapestry SEO settings page.
//
// Prereqs: same as editor.e2e.mjs. Puts the home page's SEO and the site settings back afterwards.
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, homePageId, login, openEditor, SHOTS, step, storedContent, summary } from './helpers.mjs';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const SETTINGS_PAGE = '/dashboard/plugins@nascencestudio/tapestry-seo';
const SETTINGS_ROW = '@nascencestudio/tapestry-seo-settings';
const pageId = await homePageId();
const PAGE_ROW = `@nascencestudio/tapestry-seo-page:${pageId}`;

const rowData = async (id) =>
	(await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [id] })).rows[0]?.data ?? null;
const restoreRow = (id, data) =>
	data === null
		? db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [id] })
		: db.execute({
				sql: 'insert into StudioCMSPluginData (id, data) values (?, ?) on conflict(id) do update set data = excluded.data',
				args: [id, data],
			});

/** The home page's head as visitors get it. */
async function head() {
	const html = await (await fetch(`${BASE}/`)).text();
	const meta = (attr, key) =>
		new RegExp(`<meta ${attr}="${key}" content="([^"]*)"`).exec(html)?.[1]?.replaceAll('&amp;', '&') ?? null;
	return {
		title: /<title>([^<]*)<\/title>/.exec(html)?.[1] ?? null,
		description: meta('name', 'description'),
		robots: meta('name', 'robots'),
		canonical: /<link rel="canonical" href="([^"]*)"/.exec(html)?.[1] ?? null,
		ogImage: meta('property', 'og:image'),
		card: meta('name', 'twitter:card'),
	};
}

const dialog = (selector = '') => `[data-seo-dialog] ${selector}`.trim();
const status = (page) => page.eval(() => document.querySelector('[data-seo-status]')?.textContent ?? '');

async function openDialog(page) {
	await openEditor(page, pageId);
	await page.click('[data-tapestry-seo-toggle]');
	await page.waitFor(() => Boolean(document.querySelector('[data-seo-dialog] [data-seo-save]')), [], {
		timeout: 15_000,
		message: 'SEO dialog loaded',
	});
}

async function save(page) {
	await page.click(dialog('[data-seo-save]'));
	await page.waitFor(
		() => /^(Saved|Not saved)/.test(document.querySelector('[data-seo-status]')?.textContent ?? ''),
		[],
		{ timeout: 15_000, message: 'save finished' },
	);
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
const originalSettings = await rowData(SETTINGS_ROW);
const originalPage = await rowData(PAGE_ROW);
const created = [];
const mediaApi = (path, init = {}) =>
	fetch(`${BASE}/_media/api${path}`, {
		...init,
		headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, ...(init.headers ?? {}) },
	});

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	// Start from no page settings and default site settings.
	await restoreRow(PAGE_ROW, null);
	await restoreRow(SETTINGS_ROW, null);
	const upload = await mediaApi('/upload', {
		method: 'POST',
		body: readFileSync(`${FIXTURES}/sample.jpg`),
		headers: { 'X-File-Name': 'e2e-social.jpg' },
	});
	const { item: image } = await upload.json();
	created.push(image.id);

	await step('the editor bar has an SEO button; it opens the dialog for this page', async () => {
		await openDialog(page);
		assert.match(await page.eval(() => document.querySelector('#seo-dialog-title')?.textContent), /SEO for “.+”/);
		assert.equal(await page.eval(() => document.querySelector('[data-seo-dialog]')?.open), true, 'a modal dialog');
		// Empty fields show what's used instead; nothing to save yet.
		assert.ok(await page.eval(() => document.querySelector('#seo-title')?.placeholder));
		assert.equal(await page.eval(() => document.querySelector('[data-seo-save]')?.disabled), true);
	});

	await step('previews follow the fields; a long title is flagged', async () => {
		await page.fill('#seo-title', 'A very long search title that keeps going well past what results show');
		const state = await page.eval(() => ({
			serp: document.querySelector('[data-seo-serp-title]')?.textContent,
			over: document.querySelector('#seo-title-count')?.hasAttribute('data-over'),
		}));
		assert.equal(state.over, true);
		assert.ok(state.serp.endsWith('…') && state.serp.length <= 60, `shortened: ${state.serp}`);
		await page.fill('#seo-title', 'E2E search title');
		await page.fill('#seo-description', 'E2E description for search & sharing.');
		assert.equal(
			await page.eval(() => document.querySelector('[data-seo-serp-title]')?.textContent),
			'E2E search title',
		);
	});

	await step('a social image comes from the media library picker', async () => {
		await page.click(dialog('[data-seo-choose-image]'));
		await page.waitFor(
			(i) => Boolean(document.querySelector(`[data-media-picker] [data-media-item="${i}"]`)),
			[image.id],
			{
				timeout: 15_000,
				message: 'picker shows the image',
			},
		);
		await page.click(`[data-media-picker] [data-media-item="${image.id}"]`);
		await page.waitFor(() => !document.querySelector('[data-media-picker] [data-media-pick]')?.disabled);
		await page.click('[data-media-picker] [data-media-pick]');
		await page.waitFor(() => !document.querySelector('[data-media-picker]'), [], { message: 'picker closed' });
		assert.equal(await page.eval(() => document.querySelector('[data-seo-image-name]')?.textContent), 'e2e-social.jpg');
		assert.ok(await page.eval(() => document.querySelector('[data-seo-card-image]')?.getAttribute('src')));
		if (SHOTS) await page.screenshot(`${SHOTS}/seo-dialog.png`);
	});

	await step('saving applies at once: visitors get the tags; the page content and draft are untouched', async () => {
		const contentBefore = await storedContent(pageId);
		await save(page);
		assert.match(await status(page), /^Saved/);
		const tags = await head();
		assert.equal(tags.title, 'E2E search title');
		assert.equal(tags.description, 'E2E description for search & sharing.');
		assert.equal(tags.card, 'summary_large_image');
		assert.ok(tags.ogImage?.startsWith(BASE) && tags.ogImage.endsWith('.jpg'), `og:image ${tags.ogImage}`);
		assert.equal(await storedContent(pageId), contentBefore, 'SEO is saved outside the page content');
	});

	await step('an invalid canonical address is refused with a message; nothing is saved', async () => {
		await page.click(dialog('.seo-advanced summary'));
		await page.fill('#seo-canonical', 'not an address');
		await save(page);
		assert.match(await status(page), /^Not saved/);
		assert.ok(await page.eval(() => document.querySelector('#seo-canonical')?.getAttribute('aria-invalid') === 'true'));
		assert.equal((await head()).canonical, `${BASE}/`);
		await page.fill('#seo-canonical', '');
	});

	await step('"Hide from search engines": robots noindex, no canonical, and out of the sitemap', async () => {
		await page.click(dialog('[data-seo-noindex]'));
		assert.match(await page.eval(() => document.querySelector('[data-seo-serp]')?.textContent), /Hidden/);
		await save(page);
		const tags = await head();
		assert.equal(tags.robots, 'noindex, follow');
		assert.equal(tags.canonical, null);
		const index = await (await fetch(`${BASE}/sitemap-index.xml`)).text();
		const sitemap = /<loc>([^<]*tapestry_seo[^<]*)<\/loc>/.exec(index)?.[1];
		const xml = await (await fetch(new URL(new URL(sitemap).pathname, BASE))).text();
		assert.doesNotMatch(xml, new RegExp(`<loc>${BASE.replace(/[.]/g, '\\.')}/</loc>`), 'home left out');
		await page.click(dialog('[data-seo-noindex]'));
		await save(page);
		assert.equal((await head()).robots, null);
	});

	await step('Escape closes the dialog; the editor is usable again', async () => {
		await page.press('Escape');
		await page.waitFor(() => !document.querySelector('[data-seo-dialog]'), [], { message: 'dialog closed' });
		assert.ok(await page.eval(() => Boolean(document.querySelector('.tp-editor'))));
	});

	await step('site defaults: the site name and title format apply to pages without their own title', async () => {
		await openDialog(page);
		await page.fill('#seo-title', '');
		await save(page);
		await page.press('Escape');
		await page.goto(`${BASE}${SETTINGS_PAGE}`);
		await page.waitFor(
			() => Boolean(document.querySelector('[data-seo-site-name]')) && document.readyState === 'complete',
			[],
			{
				timeout: 20_000,
			},
		);
		await page.fill('[data-seo-site-name]', 'E2E Site');
		await page.fill('[data-seo-title-format]', '{site} · {page}');
		await page.eval(() => document.querySelector('[data-seo-saved]')?.remove());
		await page.click('[data-seo-save]');
		await page.waitFor(() => Boolean(document.querySelector('[data-seo-saved]')), [], {
			timeout: 15_000,
			message: 'saved',
		});
		assert.match(
			await page.eval(() => document.querySelector('[data-seo-title-example]')?.textContent),
			/^E2E Site · About us$/,
		);
		const tags = await head();
		assert.match(tags.title, /^E2E Site · /);
		assert.equal(tags.description, 'E2E description for search & sharing.', 'the page’s own description stays');
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Page SEO suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/seo-page-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	await restoreRow(PAGE_ROW, originalPage).catch((e) => console.error('Restoring page SEO failed:', e));
	await restoreRow(SETTINGS_ROW, originalSettings).catch((e) => console.error('Restoring settings failed:', e));
	for (const id of created) await mediaApi(`/items/${id}?force=1`, { method: 'DELETE' }).catch(() => {});
	cdp.close();
	await chrome.close();
	db.close();
}
