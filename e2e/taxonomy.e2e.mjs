// End-to-end tests for StudioCMS's Tags and Categories pages (Tapestry docs/known-issues.md #42): new entries
// couldn't be created ("Expected number, actual undefined" for `id`) until our StudioCMS patch. Pages with a tag
// or category then failed to load (#43: saved as id strings, read as numbers) until our SDK patch.
//
// Prereqs: same as editor.e2e.mjs. Deletes only the entries it creates.
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, login, SHOTS, step, summary } from './helpers.mjs';

const stamp = `e2e-${Date.now()}`;
const TABLES = { tags: 'StudioCMSPageDataTags', categories: 'StudioCMSPageDataCategories' };

const PAGE_SLUG = `${stamp}-page`;

const api = (method, path, body) =>
	fetch(`${BASE}/studiocms_api/dashboard${path}`, {
		method,
		headers: { Cookie: `auth_session=${cookie}`, Origin: BASE, 'Content-Type': 'application/json' },
		body: JSON.stringify(body),
	});

const pageRow = async () =>
	(await db.execute({ sql: 'select id, tags, categories from StudioCMSPageData where slug = ?', args: [PAGE_SLUG] }))
		.rows[0];

const row = async (type, slug) =>
	(await db.execute({ sql: `select id, name, description from ${TABLES[type]} where slug = ?`, args: [slug] })).rows[0];

/** Poll until `fn` returns something truthy (the save goes through the API, then the database). */
async function until(fn, what, timeout = 10_000) {
	for (const end = Date.now() + timeout; Date.now() < end; ) {
		const value = await fn();
		if (value) return value;
		await new Promise((r) => setTimeout(r, 100));
	}
	assert.fail(`timed out waiting for ${what}`);
}

/** Open a taxonomy form once its scripts run (the meta field is a custom element; the submit handler loads with it). */
async function openForm(page, url, button) {
	await page.goto(url);
	await page.waitFor(
		(b) => Boolean(document.querySelector(b) && customElements.get('dynamic-key-value-pair')),
		[button],
	);
}

/** Fill the create (or edit) form and submit it with the page header's button, like an editor. */
async function submit(page, { name, slug, description }, button) {
	if (name !== undefined) await page.fill('input[name="name"]', name);
	if (slug !== undefined) await page.fill('input[name="slug"]', slug);
	// input[…]: the page also has <meta name="description">.
	if (description !== undefined) await page.fill('input[name="description"]', description);
	await page.click(button);
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });

	for (const type of ['tags', 'categories']) {
		await step(`a new ${type === 'tags' ? 'tag' : 'category'} can be created`, async () => {
			const slug = `${stamp}-${type}`;
			await openForm(page, `${BASE}/dashboard/taxonomy/${type}?mode=create`, '#create-taxonomy-entry-btn');
			await submit(page, { name: `E2E ${type}`, slug }, '#create-taxonomy-entry-btn');
			const created = await until(() => row(type, slug), `${type} row`);
			assert.ok(created, 'stored');
			assert.ok(Number(created.id) > 0, 'with a generated id');
			if (SHOTS) await page.screenshot(`${SHOTS}/taxonomy-${type}-created.png`);
		});
	}

	await step('editing an existing tag still saves', async () => {
		const slug = `${stamp}-tags`;
		const { id } = await row('tags', slug);
		await openForm(page, `${BASE}/dashboard/taxonomy/tags?mode=edit&edit=${id}`, '#save-taxonomy-entry-btn');
		await page.waitFor(() => document.querySelector('input[name="id"]')?.value !== '');
		await submit(page, { description: 'Edited by e2e' }, '#save-taxonomy-entry-btn');
		const edited = await until(async () => {
			const r = await row('tags', slug);
			return r?.description === 'Edited by e2e' ? r : null;
		}, 'edited description');
		assert.equal(edited.description, 'Edited by e2e');
		assert.equal(Number(edited.id), Number(id), 'same entry, no new one');
	});

	await step('a page saved with a tag and a category still loads', async () => {
		// A throwaway Markdown page, created like page-types.e2e.mjs does (the API's encoded form).
		const created = await api('POST', '/content/page', {
			title: 'E2E taxonomy page',
			slug: PAGE_SLUG,
			description: 'Throwaway page',
			package: 'studiocms/markdown',
			showOnNav: 0,
			draft: 0,
			showAuthor: 0,
			showContributors: 0,
			categories: '[]',
			tags: '[]',
			augments: '[]',
			heroImage: '',
			parentFolder: null,
		});
		assert.equal(created.status, 200, await created.text());
		const { id: pageId } = await pageRow();
		const tag = String((await row('tags', `${stamp}-tags`)).id);
		const category = String((await row('categories', `${stamp}-categories`)).id);

		const editUrl = `${BASE}/dashboard/content-management/edit?edit=${pageId}`;
		await page.goto(editUrl);
		await page.waitFor(() =>
			Boolean(document.querySelector('select[name="tags"]') && document.querySelector('#edit-button')),
		);
		// The pickers are StudioCMS UI selects over native <select multiple>s, which the form reads.
		await page.eval(
			(t, c) => {
				for (const [name, value] of [
					['tags', t],
					['categories', c],
				]) {
					const select = document.querySelector(`select[name="${name}"]`);
					for (const option of select.options) if (option.value === value) option.selected = true;
					select.dispatchEvent(new Event('change', { bubbles: true }));
				}
			},
			tag,
			category,
		);
		const saved = page.cdp.waitForEvent(
			'Network.responseReceived',
			(e) => e.response.url.includes('/studiocms_api/dashboard/content/page'),
			15_000,
		);
		await page.click('#edit-button');
		const { response, requestId } = await saved;
		if (response.status !== 200) {
			await new Promise((r) => setTimeout(r, 300));
			const body = await page.send('Network.getResponseBody', { requestId }).then(
				(r) => r.body,
				() => '',
			);
			assert.fail(`save answered HTTP ${response.status}: ${body.slice(0, 300)}`);
		}
		const stored = await pageRow();
		assert.deepEqual(JSON.parse(String(stored.tags)).map(String), [tag], 'tag stored');
		assert.deepEqual(JSON.parse(String(stored.categories)).map(String), [category], 'category stored');

		assert.equal((await fetch(`${BASE}/${PAGE_SLUG}`)).status, 200, 'the public page loads');
		await page.goto(editUrl);
		await page.waitFor(() => Boolean(document.querySelector('select[name="tags"]')));
		const selected = await page.eval(() =>
			['tags', 'categories'].map((n) =>
				[...document.querySelector(`select[name="${n}"]`).selectedOptions].map((o) => o.value),
			),
		);
		assert.deepEqual(selected, [[tag], [category]], 'the edit form shows them selected');
	});
} finally {
	// Remove only this run's entries, through the API like the dashboard's Delete button.
	if (cookie) {
		const scratch = await pageRow();
		if (scratch) await api('DELETE', '/content/page', { id: String(scratch.id), slug: PAGE_SLUG });
		for (const type of ['tags', 'categories']) {
			const created = await row(type, `${stamp}-${type}`);
			if (!created) continue;
			await api('DELETE', '/taxonomy', { type, id: Number(created.id) });
		}
	}
	await cdp.close();
	await chrome.close();
}

summary('taxonomy');
