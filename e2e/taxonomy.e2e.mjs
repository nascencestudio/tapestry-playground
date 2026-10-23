// End-to-end tests for StudioCMS's Tags and Categories pages (Tapestry docs/known-issues.md #42): new entries
// couldn't be created ("Expected number, actual undefined" for `id`) until our StudioCMS patch.
//
// Prereqs: same as editor.e2e.mjs. Deletes only the entries it creates.
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, login, SHOTS, step, summary } from './helpers.mjs';

const stamp = `e2e-${Date.now()}`;
const TABLES = { tags: 'StudioCMSPageDataTags', categories: 'StudioCMSPageDataCategories' };

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
} finally {
	// Remove only this run's entries, through the API like the dashboard's Delete button.
	if (cookie) {
		for (const type of ['tags', 'categories']) {
			const created = await row(type, `${stamp}-${type}`);
			if (!created) continue;
			await fetch(`${BASE}/studiocms_api/dashboard/taxonomy`, {
				method: 'DELETE',
				headers: { Cookie: `auth_session=${cookie}`, Origin: BASE, 'Content-Type': 'application/json' },
				body: JSON.stringify({ type, id: Number(created.id) }),
			});
		}
	}
	await cdp.close();
	await chrome.close();
}

summary('taxonomy');
