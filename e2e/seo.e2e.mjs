// End-to-end tests for Tapestry SEO (tapestry-seo ADR 0001): robots.txt and the page sitemap,
// changed through Plugins → Tapestry SEO (presets, a category chosen one by one, extra rules with a
// mistake, sitemap options), checked from what crawlers actually download.
//
// Prereqs: same as editor.e2e.mjs. Puts the settings back the way they were.
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, get, login, SHOTS, step, summary } from './helpers.mjs';

const SETTINGS_PAGE = '/dashboard/plugins@nascencestudio/tapestry-seo';
const ROW_ID = '@nascencestudio/tapestry-seo-settings';
const robots = async () => (await get('/robots.txt')).text();
const blockedIn = (text) => {
	const group = text.split('\n\n').find((g) => g.includes('Disallow: /\n') || g.endsWith('Disallow: /'));
	return group ? [...group.matchAll(/^User-agent: (.+)$/gm)].map((m) => m[1]) : [];
};
/** Submit with a button and wait for the reloaded page's "Saved" (the old notice is removed first). */
async function save(page, selector = '[data-seo-save]') {
	await page.eval(() => document.querySelector('[data-seo-saved]')?.remove());
	await page.click(selector);
	await page.waitFor(() => Boolean(document.querySelector('[data-seo-saved]')), [], {
		timeout: 15_000,
		message: 'saved',
	});
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
let original = null;

try {
	cookie = await login();
	original = (await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [ROW_ID] })).rows[0]
		?.data;
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });

	await step('visitors cannot open the settings; admins see every crawler category', async () => {
		const visitor = await get(SETTINGS_PAGE);
		assert.notEqual(visitor.status, 200);
		await page.goto(`${BASE}${SETTINGS_PAGE}`);
		await page.waitFor(() => Boolean(document.querySelector('[data-seo-settings]')), [], { timeout: 20_000 });
		const categories = await page.eval(() =>
			[...document.querySelectorAll('[data-seo-category]')].map((el) => el.getAttribute('data-seo-category')),
		);
		for (const id of ['search', 'ai-training', 'ai-search', 'ai-assistants', 'seo', 'social', 'archive']) {
			assert.ok(categories.includes(id), id);
		}
		// Start from "allow everything" (the suite restores the previous settings at the end).
		await save(page, '[data-seo-preset="open"]');
		if (SHOTS) await page.screenshot(`${SHOTS}/seo-settings.png`);
	});

	await step('robots.txt allows everything, keeps the dashboard private and links the sitemap', async () => {
		const response = await get('/robots.txt');
		assert.equal(response.status, 200);
		assert.match(response.headers.get('content-type'), /^text\/plain/);
		const text = await response.text();
		assert.deepEqual(blockedIn(text), []);
		assert.match(text, /User-agent: \*\nDisallow: \/dashboard\/\n/);
		assert.match(text, /\nSitemap: http.+\/sitemap-index\.xml\n/);
	});

	await step('a preset blocks a whole category, including in robots.txt', async () => {
		await save(page, '[data-seo-preset="no-ai-training"]');
		const blocked = blockedIn(await robots());
		assert.ok(blocked.includes('GPTBot') && blocked.includes('CCBot'), 'AI training crawlers blocked');
		assert.ok(!blocked.includes('Googlebot') && !blocked.includes('OAI-SearchBot'), 'others still allowed');
	});

	await step('a category can be chosen one by one', async () => {
		await page.click('[data-seo-category="seo"] [data-seo-mode="custom"]');
		await page.waitFor(() => !document.querySelector('[data-seo-bot="AhrefsBot"]').disabled, [], {
			message: 'checkboxes enabled',
		});
		await page.click('[data-seo-bot="AhrefsBot"]');
		await save(page);
		const blocked = blockedIn(await robots());
		assert.ok(blocked.includes('AhrefsBot'));
		assert.ok(!blocked.includes('SemrushBot'));
		assert.ok(blocked.includes('GPTBot'), 'the preset stays');
	});

	await step('extra rules with a mistake are refused with the line; nothing is saved', async () => {
		const before = await robots();
		await page.fill('[data-seo-extra]', 'User-agent: *\nblock the bad bots');
		await page.click('[data-seo-save]');
		await page.waitFor(() => Boolean(document.querySelector('[data-seo-error]')), [], { message: 'error shown' });
		assert.match(await page.eval(() => document.querySelector('[data-seo-error]').textContent), /Line 2/);
		assert.equal(
			await page.eval(() => document.querySelector('[data-seo-extra]').value),
			'User-agent: *\nblock the bad bots',
			'what was typed is kept',
		);
		assert.equal(await robots(), before);
		await page.fill('[data-seo-extra]', 'User-agent: *\nDisallow: /e2e-private/');
		await save(page);
		assert.match(await robots(), /# Extra rules\nUser-agent: \*\nDisallow: \/e2e-private\/\n/);
	});

	await step('the sitemap lists published pages and follows its options', async () => {
		const index = await (await get('/sitemap-index.xml')).text();
		const url = /<loc>([^<]*tapestry_seo[^<]*)<\/loc>/.exec(index)?.[1];
		assert.ok(url, 'listed in the sitemap index');
		const sitemap = await get(new URL(url).pathname);
		assert.match(sitemap.headers.get('content-type'), /xml/);
		const xml = await sitemap.text();
		assert.match(xml, new RegExp(`<loc>${BASE.replace(/[.]/g, '\\.')}/</loc>`), 'the home page');
		const tapestryPages = xml.match(/<url>/g)?.length ?? 0;
		// Leaving out Tapestry pages removes them; turning the sitemap off empties it and drops it from robots.txt.
		await page.click('[data-seo-exclude="tapestry/canvas"]');
		await save(page);
		const fewer = (await (await get(new URL(url).pathname)).text()).match(/<url>/g)?.length ?? 0;
		assert.ok(fewer < tapestryPages, `${fewer} < ${tapestryPages}`);
		await page.click('[data-seo-sitemap]');
		await save(page);
		assert.equal((await (await get(new URL(url).pathname)).text()).match(/<url>/g), null);
		assert.doesNotMatch(await robots(), /Sitemap:/);
	});

	await step('the settings form refuses other sites', async () => {
		const response = await fetch(`${BASE}${SETTINGS_PAGE}`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				Origin: 'https://evil.example',
				Cookie: `auth_session=${cookie}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'preset=no-ai',
		});
		assert.equal(response.status, 403);
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('SEO suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/seo-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	// Put the settings back (no row = the defaults).
	await (original
		? db.execute({ sql: 'update StudioCMSPluginData set data = ? where id = ?', args: [original, ROW_ID] })
		: db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [ROW_ID] })
	).catch((cause) => console.error('Restoring the SEO settings failed:', cause));
	cdp.close();
	await chrome.close();
	db.close();
}
