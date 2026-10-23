// End-to-end tests for Tapestry Fabric (Fabric ADR 0001, Tapestry ADR 0046), the user's News example:
// the Display Modes page; a "News item" template whose content area is shown in Full and Teaser; a news
// page filled in through the area's tabs; more news pages; and a News page with a Page list showing them
// as teasers (newest first, linked, an empty teaser as a card with trimmed text, no nested lists, never
// itself).
//
// Prereqs: same as editor.e2e.mjs (Tapestry's StudioCMS and SDK patches for taxonomy). Deletes only what it
// creates; the display modes row is restored as it was.
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, login, openEditor, SHOTS, saveAndWait, step, summary, working } from './helpers.mjs';

const DM = `${BASE}/dashboard/nascencestudio_tapestry_fabric/display_modes`;
const TM = `${BASE}/dashboard/nascencestudio_tapestry/templates`;
const MODES_ROW = '@nascencestudio/tapestry-display-modes';
const stamp = Date.now().toString(36);
const slug = (name) => `e2e-fabric-${name}-${stamp}`;
const BANNER = 'E2E news banner';
const BADGE = 'E2E teaser badge';
const LONG =
	'Fabric lists pages by category and template. When a teaser is empty the list shows a card with the start ' +
	'of the full text instead, trimmed at a word boundary, so this sentence goes on for quite a while longer ' +
	'than two hundred characters to be sure it gets cut somewhere in the middle of all these words.';

let cookie;
const api = (method, path, body) =>
	fetch(`${BASE}${path}`, {
		method,
		redirect: 'manual',
		headers: { Cookie: `auth_session=${cookie}`, Origin: BASE, 'Content-Type': 'application/json' },
		body: body === undefined ? undefined : JSON.stringify(body),
	});
const pageRow = async (s) =>
	(await db.execute({ sql: 'select id from StudioCMSPageData where slug = ?', args: [s] })).rows[0];
const modesRow = async () =>
	(await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [MODES_ROW] })).rows[0]?.data ??
	null;
const visitorHtml = async (path) => (await fetch(`${BASE}${path}`)).text();
const canvasReady = (page) =>
	page.waitFor(
		() =>
			document.querySelector('.tp-canvas__status')?.dataset.state === 'ready' &&
			!document.querySelector('[data-tapestry-canvas]')?.hasAttribute('data-tapestry-pending'),
		[],
		{ timeout: 30_000, message: 'canvas ready' },
	);
const inCanvas = (page, fn, ...args) =>
	page.eval(
		(source, list) => {
			const d = document.querySelector('[data-tapestry-canvas]')?.contentDocument;
			// biome-ignore lint/security/noGlobalEval: the test's own function, run in the page
			return d ? eval(`(${source})`)(d, ...list) : null;
		},
		fn.toString(),
		args,
	);

/** A real click on an element inside the canvas iframe. */
async function clickInCanvas(page, selector) {
	const point = await page.eval((sel) => {
		const frame = document.querySelector('[data-tapestry-canvas]');
		const el = frame.contentDocument.querySelector(sel);
		if (!el) return null;
		el.scrollIntoView({ block: 'center' });
		const box = el.getBoundingClientRect();
		const f = frame.getBoundingClientRect();
		return { x: f.left + box.left + box.width / 2, y: f.top + box.top + box.height / 2 };
	}, selector);
	if (!point) throw new Error(`no canvas element ${selector}`);
	for (const type of ['mouseMoved', 'mousePressed', 'mouseReleased']) {
		await page.send('Input.dispatchMouseEvent', { type, ...point, button: 'left', clickCount: 1 });
	}
}

/** Add a component from the library (nothing selected) and return its id (it's selected). */
async function addFromLibrary(page, label) {
	await page.eval(() => document.activeElement?.blur());
	await page.press('Escape');
	const before = await page.eval(() => document.querySelectorAll('.tp-tree [data-tp-row]').length);
	await page.click(`.tp-library__item[title^="Add ${label}"]`);
	await page.waitFor((n) => document.querySelectorAll('.tp-tree [data-tp-row]').length > n, [before], {
		message: `${label} added`,
	});
	return page.eval(() => document.querySelector('.tp-row[aria-selected="true"]')?.dataset.tpRow);
}

/** Type into a chips field's box and press Enter (adds the matching choice). */
async function addChip(page, fieldId, text) {
	// The box appears once the choices have loaded (`optionsUrl`).
	await page.waitFor((id) => Boolean(document.getElementById(id)), [fieldId], { message: `${fieldId} ready` });
	await page.fill(`#${fieldId}`, text);
	await page.press('Enter');
	await page.waitFor(
		(id, t) =>
			[...document.querySelectorAll(`[data-tapestry-chips="${id}"] .tp-chips__chip`)].some((c) =>
				c.textContent.includes(t),
			),
		[fieldId, text],
		{ message: `chip ${text}` },
	);
}

async function submitModes(page, selector) {
	// The previous outcome's notice goes first, so the wait sees this one.
	await page.eval(() => {
		for (const el of document.querySelectorAll('[data-fabric-modes-saved], [data-fabric-modes-error]')) el.remove();
	});
	await page.click(`${selector} button[type="submit"]`);
	await page.waitFor(
		() =>
			document.readyState === 'complete' &&
			Boolean(document.querySelector('[data-fabric-modes-saved], [data-fabric-modes-error]')),
		[],
		{ timeout: 20_000, message: 'form saved' },
	);
	return page.eval(() => document.querySelector('[data-fabric-modes-error]')?.textContent.trim() ?? null);
}

const openModes = async (page) => {
	await page.goto(DM);
	await page.waitFor(
		() => document.readyState === 'complete' && Boolean(document.querySelector('[data-fabric-modes]')),
		[],
		{
			timeout: 20_000,
			message: 'Display Modes page',
		},
	);
};
const modeRows = (page) =>
	page.eval(() =>
		[...document.querySelectorAll('[data-fabric-mode]')].map((li) => ({
			key: li.dataset.fabricMode,
			name: li.querySelector('.fabric-modes__name')?.textContent.trim(),
			usage: li.querySelector('[data-fabric-mode-usage]')?.textContent.trim(),
			renamable: Boolean(li.querySelector('input[name="name"]')),
		})),
	);

/** A Tapestry page through StudioCMS's API (the create form's encoded fields), with a category. */
async function createPage(name, title, category) {
	const s = slug(name);
	const created = await api('POST', '/studiocms_api/dashboard/content/page', {
		title,
		slug: s,
		// Required by StudioCMS's edit form (an empty one silently blocks saving there).
		description: `${title} (e2e)`,
		package: 'tapestry/canvas',
		showOnNav: 0,
		draft: 0,
		showAuthor: 0,
		showContributors: 0,
		categories: JSON.stringify(category ? [String(category)] : []),
		tags: '[]',
		augments: '[]',
		heroImage: '',
		parentFolder: null,
	});
	assert.equal(created.status, 200, await created.text());
	return { id: String((await pageRow(s)).id), slug: s, title };
}

/** Published content straight into the database (before the page is first requested: no stale cache). */
async function publishDirect(pageId, document, publishedAt) {
	const stored = { version: 2, published: document, publishedAt, draft: null, history: [] };
	await db.execute({
		sql: 'update StudioCMSPageContent set content = ? where contentId = ?',
		args: [JSON.stringify(stored), pageId],
	});
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
const before = { modes: null };
const created = { pages: [], category: null, template: null };
const errors = [];

try {
	cookie = await login();
	before.modes = await modesRow();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	page.cdp.on((message) => {
		if (message.method === 'Runtime.exceptionThrown') errors.push(message.params.exceptionDetails.text);
	});

	await step('the modes endpoint refuses visitors and other sites', async () => {
		const form = new URLSearchParams({ action: 'add', name: 'Nope', return: '/' }).toString();
		const anonymous = await fetch(`${BASE}/_fabric/modes`, {
			method: 'POST',
			redirect: 'manual',
			headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: form,
		});
		assert.equal(anonymous.status, 403);
		const crossSite = await fetch(`${BASE}/_fabric/modes`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				Cookie: `auth_session=${cookie}`,
				Origin: 'https://evil.example',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: form,
		});
		assert.equal(crossSite.status, 403);
		assert.equal((await fetch(`${BASE}/_fabric/options/modes`)).status, 403, 'options are for editors');
		assert.equal((await modesRow()) ?? null, before.modes ?? null, 'nothing saved');
	});

	await step('Display Modes: Full and Teaser are built in; admins add and rename their own', async () => {
		await openModes(page);
		const rows = await modeRows(page);
		assert.deepEqual(
			rows.slice(0, 2).map((r) => [r.key, r.name, r.renamable]),
			[
				['full', 'Full', false],
				['teaser', 'Teaser', false],
			],
		);
		await page.fill('[data-fabric-mode-create] input[name="name"]', 'E2E Card');
		assert.equal(await submitModes(page, '[data-fabric-mode-create]'), null);
		assert.ok((await modeRows(page)).some((r) => r.key === 'e2e-card' && r.name === 'E2E Card' && r.renamable));
		await page.fill('[data-fabric-mode-create] input[name="name"]', 'teaser');
		assert.match(await submitModes(page, '[data-fabric-mode-create]'), /already exists/);
		await page.fill('[data-fabric-mode="e2e-card"] input[name="name"]', 'E2E Big card');
		assert.equal(await submitModes(page, '[data-fabric-mode="e2e-card"] form'), null);
		const card = (await modeRows(page)).find((r) => r.key === 'e2e-card');
		assert.deepEqual([card.name, card.usage], ['E2E Big card', 'Not used in a template yet'], 'renamed, same key');
		if (SHOTS) await page.screenshot(`${SHOTS}/fabric-display-modes.png`);
	});

	await step('the News item template: a banner in Full, a badge in Teaser, a content area in both', async () => {
		const category = await api('POST', '/studiocms_api/dashboard/taxonomy', {
			mode: 'create',
			type: 'categories',
			id: 0,
			name: `E2E News item ${stamp}`,
			slug: `e2e-news-item-${stamp}`,
			description: '',
			parent: null,
			meta: '{}',
		});
		assert.equal(category.status, 200, await category.text());
		created.category = Number(
			(
				await db.execute({
					sql: 'select id from StudioCMSPageDataCategories where slug = ?',
					args: [`e2e-news-item-${stamp}`],
				})
			).rows[0].id,
		);
		await page.goto(`${TM}?view=templates`);
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-template-create]')), [], {
			timeout: 20_000,
		});
		await page.fill('[data-tapestry-template-create] input[name="name"]', `E2E News item ${stamp}`);
		await page.click('[data-tapestry-template-create] button[type="submit"]');
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tapestry-templates-saved]')),
			[],
			{
				timeout: 20_000,
			},
		);
		created.template = await page.eval(
			(name) =>
				[...document.querySelectorAll('[data-tapestry-template-row]')].find((li) =>
					li.querySelector('.tapestry-templates__name')?.textContent.includes(name),
				)?.dataset.tapestryTemplateRow,
			`E2E News item ${stamp}`,
		);
		assert.match(created.template ?? '', /^tt_/);
		await page.click(`[data-tapestry-template-row="${created.template}"] [data-tapestry-template-edit]`);
		await canvasReady(page);

		const banner = await addFromLibrary(page, 'Heading');
		await page.fill(`#tp-field-${banner}-text`, BANNER);
		// New components are in Full; the last mode can't be removed.
		const chips = await page.eval(
			(id) =>
				[...document.querySelectorAll(`[data-tapestry-chips="tp-node-modes-${id}"] .tp-chips__chip`)].map((c) => [
					c.textContent.trim(),
					c.querySelector('button').disabled,
				]),
			banner,
		);
		assert.deepEqual(chips, [['Full', true]]);

		const badge = await addFromLibrary(page, 'Heading');
		await page.fill(`#tp-field-${badge}-text`, BADGE);
		await addChip(page, `tp-node-modes-${badge}`, 'Teaser');
		await page.click(`[data-tapestry-chips="tp-node-modes-${badge}"] [data-tapestry-chip-value="full"] button`);
		await page.waitFor(
			(id) => !document.querySelector(`[data-tapestry-chips="tp-node-modes-${id}"] [data-tapestry-chip-value="full"]`),
			[badge],
		);

		const area = await addFromLibrary(page, 'Content area');
		await addChip(page, `tp-node-modes-${area}`, 'Teas');
		if (SHOTS) await page.screenshot(`${SHOTS}/fabric-template-shown-in.png`);
		const doc = await working(page);
		const modesOf = (id) => doc.root.find((n) => n.id === id)?.modes;
		assert.deepEqual([modesOf(banner), modesOf(badge), modesOf(area)], [undefined, ['teaser'], ['full', 'teaser']]);
		await page.click('[data-tapestry-publish]');
		await page.waitFor(
			() => /^Published/.test(document.querySelector('[data-tapestry-save-status]')?.textContent ?? ''),
			[],
			{
				timeout: 15_000,
				message: 'template published',
			},
		);
		await openModes(page);
		const usage = Object.fromEntries((await modeRows(page)).map((r) => [r.key, r.usage]));
		assert.equal(usage.teaser, 'Used by 2 components in 1 template');
		assert.match(usage.full, /in \d+ templates?/);
	});

	let one;
	await step(
		'a news page fills its content area through tabs: the article in Full, the summary in Teaser',
		async () => {
			one = await createPage('one', 'E2E story one', created.category);
			created.pages.push(one);
			await openEditor(page, one.id);
			await page.click('[data-tp-info="tp-template"]');
			await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-templates]')));
			await page.click(`[data-tapestry-template="${created.template}"]`);
			await page.waitFor(
				(t) => document.querySelector('[data-tapestry-canvas]')?.contentDocument?.body?.textContent.includes(t),
				[BANNER],
				{ timeout: 30_000, message: 'canvas inside the template' },
			);
			await canvasReady(page);
			const tabs = await inCanvas(page, (d) =>
				[...d.querySelectorAll('[data-tapestry-area-tab]')].map((b) => [b.textContent, b.getAttribute('aria-pressed')]),
			);
			assert.deepEqual(tabs, [
				['Full', 'true'],
				['Teaser', 'false'],
			]);
			const article = await addFromLibrary(page, 'Heading');
			await page.fill(`#tp-field-${article}-text`, 'E2E article one');
			await page.waitFor(
				(t) => document.querySelector('[data-tapestry-canvas]')?.contentDocument?.body?.textContent.includes(t),
				[`E2E article one`],
				{ timeout: 15_000 },
			);
			await clickInCanvas(page, '[data-tapestry-area-tab="teaser"]');
			await page.waitFor(
				() =>
					document
						.querySelector('[data-tapestry-canvas]')
						?.contentDocument?.querySelector('[data-tapestry-area-tab="teaser"]')
						?.getAttribute('aria-pressed') === 'true',
				[],
				{ timeout: 15_000, message: 'Teaser tab' },
			);
			await canvasReady(page);
			assert.doesNotMatch(await inCanvas(page, (d) => d.body.textContent), /E2E article one/, 'Full content hidden');
			const summaryId = await addFromLibrary(page, 'Heading');
			await page.fill(`#tp-field-${summaryId}-text`, 'E2E summary one');
			const doc = await working(page);
			assert.deepEqual(
				doc.root.map((n) => [n.id, n.slot]),
				[
					[article, 'main'],
					[summaryId, 'main.teaser'],
				],
			);
			assert.deepEqual(
				await page.eval(() =>
					[...document.querySelectorAll('.tp-tree > .tp-tree__area > .tp-tree__area-label')].map((e) =>
						e.textContent.trim(),
					),
				),
				['Main · Full', 'Main · Teaser'],
			);
			if (SHOTS) await page.screenshot(`${SHOTS}/fabric-area-tabs.png`);
			// Selecting the article shows the Full tab again.
			await page.click(`[data-tp-row="${article}"] .tp-row__label`);
			await page.waitFor(
				() =>
					document
						.querySelector('[data-tapestry-canvas]')
						?.contentDocument?.querySelector('[data-tapestry-area-tab="full"]')
						?.getAttribute('aria-pressed') === 'true',
				[],
				{ timeout: 15_000, message: 'Full tab after selecting the article' },
			);
			await saveAndWait(page, one.id, '[data-tapestry-publish]');
			const html = await visitorHtml(`/${one.slug}`);
			assert.match(html, /E2E article one/);
			assert.match(html, new RegExp(BANNER));
			assert.doesNotMatch(html, /E2E summary one/, 'the teaser isn’t on the page itself');
			assert.doesNotMatch(html, new RegExp(BADGE));
		},
	);

	let news;
	await step('a Page list on the News page shows the news items as teasers', async () => {
		// Two more news items, older than the first: one with an empty teaser (a card with trimmed text),
		// one whose teaser holds a Page list (lists don't nest).
		const two = await createPage('two', 'E2E story two', created.category);
		const three = await createPage('three', 'E2E story three', created.category);
		created.pages.push(two, three);
		await publishDirect(
			two.id,
			{
				version: 1,
				template: created.template,
				root: [
					{
						id: 'b1',
						type: 'text',
						slot: 'main',
						props: { body: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: LONG }] }] } },
					},
				],
			},
			'2026-01-01T00:00:00.000Z',
		);
		await publishDirect(
			three.id,
			{
				version: 1,
				template: created.template,
				root: [
					{ id: 'c1', type: 'heading', slot: 'main', props: { text: 'E2E article three', level: '2' } },
					{ id: 'c2', type: 'heading', slot: 'main.teaser', props: { text: 'E2E summary three', level: '2' } },
					{ id: 'c3', type: 'fabric-page-list', slot: 'main.teaser', props: { mode: 'teaser' } },
				],
			},
			'2026-02-01T00:00:00.000Z',
		);
		// The News page is in the category too: a list never shows its own page.
		news = await createPage('news', 'E2E News', created.category);
		created.pages.push(news);
		await openEditor(page, news.id);
		const list = await addFromLibrary(page, 'Page list');
		await addChip(page, `tp-field-${list}-categories`, `E2E News item ${stamp}`);
		await page.waitFor(
			(id) => !document.querySelector(`#tp-field-${id}-template`)?.closest('[data-tapestry-options-loading]'),
			[list],
		);
		await page.eval(
			(id, template) => {
				const select = document.querySelector(`#tp-field-${id}-template`);
				select.value = template;
				select.dispatchEvent(new Event('change', { bubbles: true }));
			},
			list,
			created.template,
		);
		const props = (await working(page)).root.find((n) => n.id === list).props;
		assert.deepEqual(
			[props.categories, props.template, props.mode, props.count],
			[[String(created.category)], created.template, 'teaser', 5],
		);
		await page.waitFor(
			() =>
				/Matches 3 pages/.test(
					document.querySelector('[data-tapestry-canvas]')?.contentDocument?.querySelector('[data-fabric-note]')
						?.textContent ?? '',
				),
			[],
			{ timeout: 30_000, message: 'the editor note' },
		);
		await canvasReady(page);
		// The items belong to other pages: nothing inside them is selectable on this canvas.
		assert.equal(
			await inCanvas(
				page,
				(d) =>
					d.querySelectorAll('[data-fabric-item] [data-tapestry-node], [data-fabric-item] [data-tapestry-area]').length,
			),
			0,
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/fabric-page-list-editor.png`);
		await saveAndWait(page, news.id, '[data-tapestry-publish]');

		const html = await visitorHtml(`/${news.slug}`);
		const items = [...html.matchAll(/data-fabric-item="([^"]+)"/g)].map((m) => m[1]);
		assert.deepEqual(items, [one.id, three.id, two.id], 'newest first, never the News page itself');
		// Each item's markup, from its <article> to the next one (dev output puts extra attributes in between).
		const starts = items.map((i) => html.lastIndexOf('<article', html.indexOf(`data-fabric-item="${i}"`)));
		const item = (id) => {
			const at = starts[items.indexOf(id)];
			const next = starts.filter((s) => s > at);
			return html.slice(at, next.length ? Math.min(...next) : undefined);
		};
		assert.match(html, /class="fabric-list fabric-list--teaser"/);
		assert.match(item(one.id), /^<article class="fabric-item fabric-item--teaser"/);
		assert.match(item(one.id), /E2E summary one/);
		assert.match(item(one.id), new RegExp(BADGE), 'teaser components show');
		assert.doesNotMatch(item(one.id), /E2E article one/, 'not the Full content');
		assert.doesNotMatch(item(one.id), new RegExp(BANNER), 'not the Full-only banner');
		assert.match(
			item(one.id),
			new RegExp(`<a class="fabric-link" href="/${one.slug}"[^>]*aria-label="Read more: E2E story one"`),
		);
		assert.match(item(two.id), /^<article class="fabric-item fabric-item--teaser fabric-card"/);
		assert.match(item(two.id), new RegExp(`<a class="fabric-link" href="/${two.slug}"[^>]*>E2E story two</a>`));
		const trimmed = /<p class="fabric-summary"[^>]*>([^<]*)<\/p>/.exec(item(two.id))?.[1] ?? '';
		assert.ok(
			trimmed.endsWith('…') && trimmed.length <= 201 && LONG.startsWith(trimmed.slice(0, -1)),
			`trimmed: ${trimmed}`,
		);
		assert.match(item(three.id), /E2E summary three/);
		assert.equal((html.match(/data-fabric-list/g) ?? []).length, 1, 'the list inside a listed teaser doesn’t render');
		assert.doesNotMatch(html, /data-fabric-note|data-tapestry-node/, 'nothing editor-only for visitors');
	});

	await step('an unused mode is deleted; Full and Teaser can’t be', async () => {
		await openModes(page);
		await page.click('[data-fabric-mode="e2e-card"] [data-fabric-mode-delete]');
		await page.waitFor(
			() => document.readyState === 'complete' && !document.querySelector('[data-fabric-mode="e2e-card"]'),
			[],
			{
				timeout: 20_000,
			},
		);
		assert.equal(
			await page.eval(() => document.querySelectorAll('[data-fabric-mode="teaser"] [data-fabric-mode-delete]').length),
			0,
		);
		const refused = await fetch(`${BASE}/_fabric/modes`, {
			method: 'POST',
			redirect: 'manual',
			headers: { Cookie: `auth_session=${cookie}`, Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ action: 'delete', key: 'teaser', return: '/x' }).toString(),
		});
		assert.match(refused.headers.get('location') ?? '', /error=built-in/);
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(errors, []);
	});
} finally {
	// Only what this suite created, newest first.
	if (cookie) {
		for (const p of created.pages.reverse()) {
			await api('DELETE', '/studiocms_api/dashboard/content/page', { id: p.id, slug: p.slug }).catch(() => {});
		}
		if (created.template) {
			await fetch(`${BASE}/_tapestry/templates`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					Cookie: `auth_session=${cookie}`,
					Origin: BASE,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({ return: '/', action: 'delete-template', id: created.template }).toString(),
			}).catch(() => {});
		}
		if (created.category) {
			await api('DELETE', '/studiocms_api/dashboard/taxonomy', { type: 'categories', id: created.category }).catch(
				() => {},
			);
		}
		// The display modes as they were.
		if (before.modes === null)
			await db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [MODES_ROW] });
		else
			await db.execute({
				sql: 'update StudioCMSPluginData set data = ? where id = ?',
				args: [before.modes, MODES_ROW],
			});
	}
	await cdp.close();
	await chrome.close();
}

summary('fabric');
