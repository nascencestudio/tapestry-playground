// End-to-end tests for templates (Tapestry ADR 0041): header/footer parts and templates on
// Plugins → Tapestry → Templates, the part editor (draft vs publish, what visitors get), and the page
// editor's Template menu (regions shown but not editable; a template change is part of the draft).
//
// Prereqs: same as editor.e2e.mjs. Resets the demo home page and removes the templates and parts it
// creates (and puts the default template back).
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import {
	BASE,
	db,
	get,
	homePageId,
	login,
	openEditor,
	resetToDemo,
	SHOTS,
	saveAndWait,
	step,
	summary,
	working,
} from './helpers.mjs';

const pageId = await homePageId();
const SECTION = `${BASE}/dashboard/plugins/@nascencestudio/tapestry?section=templates`;
const SETTINGS_ROW = '@nascencestudio/tapestry-templates';
const HEADER_TEXT = 'E2E site header';

const originalDefault = (
	await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [SETTINGS_ROW] })
).rows[0]?.data;
const before = { templates: new Set(), parts: new Set() };

const visitorHtml = async (path = '/') => (await fetch(`${BASE}${path}`)).text();
const canvasReady = (page) =>
	page.waitFor(
		() =>
			document.querySelector('.tp-canvas__status')?.dataset.state === 'ready' &&
			!document.querySelector('[data-tapestry-canvas]')?.hasAttribute('data-tapestry-pending'),
		[],
		{ timeout: 30_000, message: 'canvas ready' },
	);

async function submitForm(page, selector) {
	await page.eval(() => document.querySelector('[data-tapestry-templates-saved]')?.remove());
	await page.click(`${selector} button[type="submit"]`);
	await page.waitFor(
		() =>
			document.readyState === 'complete' &&
			Boolean(document.querySelector('[data-tapestry-templates-saved], [data-tapestry-templates-error]')),
		[],
		{ timeout: 20_000, message: 'form saved' },
	);
	return page.eval(() => document.querySelector('[data-tapestry-templates-error]')?.textContent ?? null);
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
const api = () => ({ Origin: BASE, Cookie: `auth_session=${cookie}` });
const list = async () => (await fetch(`${BASE}/_tapestry/templates`, { headers: api() })).json();
let header;
let standard;
let bare;

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	const existing = await list();
	for (const t of existing.templates) before.templates.add(t.id);
	for (const p of existing.parts) before.parts.add(p.id);

	await step('visitors can’t use the templates endpoints', async () => {
		assert.equal((await get('/_tapestry/templates')).status, 403);
		assert.equal((await get('/_tapestry/parts?id=tp_aaaaaaaaaaaaaaaa')).status, 403);
		const forged = await fetch(`${BASE}/_tapestry/templates`, {
			method: 'POST',
			redirect: 'manual',
			headers: { ...api(), Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'action=create-part&region=header&name=x',
		});
		assert.equal(forged.status, 403, 'cross-origin refused');
	});

	await step('Templates section: create a header and two templates (the first becomes the default)', async () => {
		await resetToDemo(page, pageId);
		await page.goto(SECTION);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tapestry-templates-settings]')),
			[],
			{
				timeout: 20_000,
			},
		);
		await page.fill('[data-tapestry-part-create] input[name="name"]', 'E2E header');
		assert.equal(await submitForm(page, '[data-tapestry-part-create]'), null);
		header = (await list()).parts.find((p) => p.name === 'E2E header' && !before.parts.has(p.id));
		assert.ok(header, 'header created');
		await page.fill('[data-tapestry-template-create] input[name="name"]', 'E2E standard');
		await page.eval((id) => {
			document.querySelector('[data-tapestry-template-create] select[name="header"]').value = id;
		}, header.id);
		assert.equal(await submitForm(page, '[data-tapestry-template-create]'), null);
		await page.fill('[data-tapestry-template-create] input[name="name"]', 'E2E bare');
		assert.equal(await submitForm(page, '[data-tapestry-template-create]'), null);
		const state = await list();
		standard = state.templates.find((t) => t.name === 'E2E standard');
		bare = state.templates.find((t) => t.name === 'E2E bare');
		assert.equal(standard.header, header.id);
		assert.equal(bare.header, null);
		// Make "E2E standard" the default (another default may already exist on this site).
		await page
			.click(`[data-tapestry-template-row="${standard.id}"] [data-tapestry-template-make-default]`)
			.catch(() => {});
		await page.waitFor(() => document.readyState === 'complete');
		assert.equal((await list()).defaultTemplate, standard.id);
		if (SHOTS) await page.screenshot(`${SHOTS}/templates-settings.png`);
	});

	await step('a part in use can’t be deleted', async () => {
		assert.equal(
			await page.eval(
				(id) => document.querySelector(`[data-tapestry-part="${id}"] [data-tapestry-part-delete]`)?.disabled,
				header.id,
			),
			true,
		);
		const response = await fetch(`${BASE}/_tapestry/templates`, {
			method: 'POST',
			redirect: 'manual',
			headers: { ...api(), 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ action: 'delete-part', id: header.id, return: '/x' }),
		});
		assert.match(response.headers.get('location') ?? '', /error=part-in-use/);
	});

	await step('part editor: the part in place on a real page, the page content as a placeholder', async () => {
		await page.click(`[data-tapestry-part="${header.id}"] [data-tapestry-part-edit]`);
		await canvasReady(page);
		const state = await page.eval(() => {
			const d = document.querySelector('[data-tapestry-canvas]').contentDocument;
			return {
				body: Boolean(d.querySelector('tapestry-canvas-body')),
				empty: d.querySelector('[data-tapestry-editing-part] tapestry-canvas-empty')?.textContent ?? null,
			};
		});
		assert.deepEqual(state, { body: true, empty: 'This header is empty. Drag components here.' });
		await page.click('.tp-library__item[title^="Add Heading "]');
		await page.waitFor(
			() => Boolean(document.querySelector('.tp-props input[id$="-text"], [data-tp-field$=".text"] input')),
			[],
			{
				message: 'heading settings',
			},
		);
		const input = await page.eval(() => document.querySelector('[data-tp-field$=".text"] input')?.id);
		await page.fill(`#${input}`, HEADER_TEXT);
		await page.waitFor(
			(text) =>
				document
					.querySelector('[data-tapestry-canvas]')
					?.contentDocument?.querySelector('[data-tapestry-editing-part]')
					?.textContent.includes(text),
			[HEADER_TEXT],
			{ timeout: 15_000, message: 'canvas shows the new header text' },
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/templates-part-editor.png`);
	});

	await step('a saved draft stays private; Publish puts the header on every page using the template', async () => {
		await page.click('[data-tapestry-save]');
		await page.waitFor(() => document.querySelector('[data-tapestry-save-status]')?.dataset.kind === 'done', [], {
			message: 'draft saved',
		});
		assert.doesNotMatch(await visitorHtml(), new RegExp(HEADER_TEXT), 'draft not public');
		await page.click('[data-tapestry-publish]');
		await page.waitFor(
			() => /^Published/.test(document.querySelector('[data-tapestry-save-status]')?.textContent ?? ''),
			[],
			{
				message: 'published',
			},
		);
		assert.match(await visitorHtml(), new RegExp(HEADER_TEXT));
		assert.match(await visitorHtml('/nope-404'), /Page not found/);
	});

	await step('page editor: the template’s header shows on the canvas, faded and not selectable', async () => {
		await openEditor(page, pageId);
		await canvasReady(page);
		assert.equal(
			await page.eval(() => document.querySelector('[data-tapestry-current-template]')?.textContent),
			'E2E standard',
		);
		const region = await page.eval(() => {
			const d = document.querySelector('[data-tapestry-canvas]').contentDocument;
			const r = d.querySelector('[data-tapestry-region="header"]');
			const el = r?.querySelector('[data-tapestry-node] > *');
			return {
				text: r?.textContent ?? '',
				pointer: el ? getComputedStyle(el).pointerEvents : null,
				opacity: el ? getComputedStyle(el).opacity : null,
			};
		});
		assert.ok(region.text.includes(HEADER_TEXT));
		assert.equal(region.pointer, 'none');
		assert.equal(region.opacity, '0.5');
		if (SHOTS) await page.screenshot(`${SHOTS}/templates-page-canvas.png`);
	});

	await step(
		'changing the template is a draft: the canvas follows, visitors keep the live one until Publish',
		async () => {
			await page.click('[data-tp-info="tp-template"]');
			await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-templates]')));
			await page.click(`[data-tapestry-template="${bare.id}"]`);
			assert.equal((await working(page)).template, bare.id);
			await page.waitFor(
				(text) =>
					document.querySelector('.tp-canvas__status')?.dataset.state === 'ready' &&
					!document.querySelector('[data-tapestry-canvas]')?.contentDocument?.body?.textContent.includes(text),
				[HEADER_TEXT],
				{ timeout: 30_000, message: 'canvas without the header' },
			);
			await saveAndWait(page, pageId);
			assert.match(await visitorHtml(), new RegExp(HEADER_TEXT), 'live page keeps its template');
			await saveAndWait(page, pageId, '[data-tapestry-publish]');
			assert.doesNotMatch(await visitorHtml(), new RegExp(HEADER_TEXT), 'published: the bare template');
		},
	);

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Templates suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/templates-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	// The demo page back as it was, then this suite's templates and parts out.
	if (page) await resetToDemo(page, pageId).catch((e) => console.error('Cleanup failed:', e));
	const form = (fields) =>
		fetch(`${BASE}/_tapestry/templates`, {
			method: 'POST',
			redirect: 'manual',
			headers: { ...api(), 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ return: '/', ...fields }),
		});
	try {
		const now = await list();
		for (const t of now.templates) if (!before.templates.has(t.id)) await form({ action: 'delete-template', id: t.id });
		for (const p of now.parts) if (!before.parts.has(p.id)) await form({ action: 'delete-part', id: p.id });
		await (originalDefault
			? db.execute({
					sql: 'update StudioCMSPluginData set data = ? where id = ?',
					args: [originalDefault, SETTINGS_ROW],
				})
			: db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [SETTINGS_ROW] }));
	} catch (cause) {
		console.error('Removing test templates failed:', cause);
	}
	cdp.close();
	await chrome.close();
	db.close();
}
