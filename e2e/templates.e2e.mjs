// End-to-end tests for templates (Tapestry ADR 0041): Template Management (Headers and Footers,
// Templates), the template editor (a layout with content areas), pages inheriting a template (content
// in its areas, template content locked, draft vs publish), one-off pages with their own header, and
// editors' read-only view.
//
// Prereqs: same as editor.e2e.mjs. Resets the demo home page; removes the templates, parts and the
// editor account it creates.
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
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
const TM = `${BASE}/dashboard/nascencestudio_tapestry/templates`;
const HEADER_TEXT = 'E2E site header';
const FIXED_TEXT = 'E2E fixed template heading';
const EDITOR = `e2e-tm-${randomBytes(3).toString('hex')}`;
const EDITOR_PASSWORD = `Ed-${randomBytes(18).toString('base64url')}`;

const visitorHtml = async (path = '/') => (await fetch(`${BASE}${path}`)).text();
const canvasReady = (page) =>
	page.waitFor(
		() =>
			document.querySelector('.tp-canvas__status')?.dataset.state === 'ready' &&
			!document.querySelector('[data-tapestry-canvas]')?.hasAttribute('data-tapestry-pending'),
		[],
		{ timeout: 30_000, message: 'canvas ready' },
	);
const canvasText = (page) =>
	page.eval(() => document.querySelector('[data-tapestry-canvas]')?.contentDocument?.body?.textContent ?? '');

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

/** Add a component from the library (nothing selected: at the end) and return its id (it's selected). */
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

async function publishSubject(page) {
	await page.click('[data-tapestry-publish]');
	await page.waitFor(
		() => /^Published/.test(document.querySelector('[data-tapestry-save-status]')?.textContent ?? ''),
		[],
		{ timeout: 15_000, message: 'published' },
	);
}

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
let editorId;
const before = { templates: new Set(), parts: new Set() };
const api = () => ({ Origin: BASE, Cookie: `auth_session=${cookie}` });
const list = async () => (await fetch(`${BASE}/_tapestry/templates`, { headers: api() })).json();
let header;
let template;

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	const existing = await list();
	for (const t of existing.templates) before.templates.add(t.id);
	for (const p of existing.parts) before.parts.add(p.id);

	await step('visitors can’t use the templates endpoints; other sites can’t post', async () => {
		assert.equal((await get('/_tapestry/templates')).status, 403);
		assert.equal((await get('/_tapestry/parts?id=tp_aaaaaaaaaaaaaaaa')).status, 403);
		const forged = await fetch(`${BASE}/_tapestry/templates`, {
			method: 'POST',
			redirect: 'manual',
			headers: { ...api(), Origin: 'https://evil.example', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'action=create-part&region=header&name=x',
		});
		assert.equal(forged.status, 403);
	});

	await step('Template Management sits under Media; a header is created and published', async () => {
		await resetToDemo(page, pageId);
		await page.goto(TM);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tapestry-templates-settings]')),
			[],
			{ timeout: 20_000, message: 'Template Management' },
		);
		// The sidebar is filled in by the browser: the line after "Media" in the rendered text.
		const lines = await page.eval(() =>
			document.body.innerText
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
		);
		assert.equal(lines[lines.indexOf('Media') + 1], 'Template Management', 'right after Media');
		await page.fill('[data-tapestry-part-create] input[name="name"]', 'E2E header');
		assert.equal(await submitForm(page, '[data-tapestry-part-create]'), null);
		header = (await list()).parts.find((p) => p.name === 'E2E header' && !before.parts.has(p.id));
		await page.click(`[data-tapestry-part="${header.id}"] [data-tapestry-part-edit]`);
		await canvasReady(page);
		const heading = await addFromLibrary(page, 'Heading');
		await page.fill(`#tp-field-${heading}-text`, HEADER_TEXT);
		await publishSubject(page);
	});

	await step('the template editor builds a layout: fixed content and two content areas', async () => {
		await page.goto(`${TM}?view=templates`);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tapestry-template-create]')),
		);
		await page.fill('[data-tapestry-template-create] input[name="name"]', 'E2E article');
		await page.eval((id) => {
			document.querySelector('[data-tapestry-template-create] select[name="header"]').value = id;
		}, header.id);
		assert.equal(await submitForm(page, '[data-tapestry-template-create]'), null);
		template = (await list()).templates.find((t) => t.name === 'E2E article');
		await page.click(`[data-tapestry-template-row="${template.id}"] [data-tapestry-template-edit]`);
		await canvasReady(page);
		assert.match(await canvasText(page), new RegExp(HEADER_TEXT), 'the template’s header around the body');
		const fixed = await addFromLibrary(page, 'Heading');
		await page.fill(`#tp-field-${fixed}-text`, FIXED_TEXT);
		await addFromLibrary(page, 'Content area');
		const side = await addFromLibrary(page, 'Content area');
		await page.fill(`#tp-field-${side}-name`, 'Sidebar');
		await page.waitFor(
			() =>
				[
					...(document
						.querySelector('[data-tapestry-canvas]')
						?.contentDocument?.querySelectorAll('tapestry-area-label') ?? []),
				]
					.map((l) => l.textContent)
					.join('|')
					.includes('Content area: Sidebar'),
			[],
			{ message: 'the Sidebar area on the canvas' },
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/templates-template-editor.png`);
		await publishSubject(page);
		assert.deepEqual((await list()).templates.find((t) => t.id === template.id).areas, [
			{ key: 'main', name: 'Main' },
			{ key: 'sidebar', name: 'Sidebar' },
		]);
	});

	await step('a page using the template: its content goes into the areas, template content is locked', async () => {
		await openEditor(page, pageId);
		assert.equal(
			await page.eval(() => document.querySelector('[data-tapestry-current-template]')?.textContent),
			'No template',
		);
		await page.click('[data-tp-info="tp-template"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-templates]')));
		await page.click(`[data-tapestry-template="${template.id}"]`);
		const doc = await working(page);
		assert.equal(doc.template, template.id);
		assert.deepEqual([...new Set(doc.root.map((n) => n.slot))], ['main']);
		await page.waitFor(
			(t) => document.querySelector('[data-tapestry-canvas]')?.contentDocument?.body?.textContent.includes(t),
			[FIXED_TEXT],
			{ timeout: 30_000, message: 'canvas inside the template' },
		);
		await canvasReady(page);
		const locked = await page.eval(() => {
			const d = document.querySelector('[data-tapestry-canvas]').contentDocument;
			const el = d.querySelector('[data-tapestry-node^="tpl_"] > *');
			return el ? getComputedStyle(el).pointerEvents : null;
		});
		assert.equal(locked, 'none', 'template components are not interactive');
		assert.deepEqual(
			await page.eval(() =>
				[...document.querySelectorAll('.tp-tree > .tp-tree__area > .tp-tree__area-label')].map((e) =>
					e.textContent.trim(),
				),
			),
			['Main', 'Sidebar'],
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/templates-page-editor.png`);
	});

	await step('a component moves from Main into Sidebar (Alt+↓ on the last one in an area)', async () => {
		const doc = await working(page);
		const last = doc.root[doc.root.length - 1].id;
		await page.click(`[data-tp-row="${last}"] .tp-row__label`);
		await page.press('ArrowDown', ['Alt']);
		await page.waitFor(
			(id) => document.querySelector(`[data-tp-area=":sidebar"] [data-tp-row="${id}"]`) !== null,
			[last],
			{ message: 'row in the Sidebar group' },
		);
		assert.equal((await working(page)).root.find((n) => n.id === last).slot, 'sidebar');
	});

	await step('the template choice is a draft until published; then visitors get the layout', async () => {
		await saveAndWait(page, pageId);
		assert.doesNotMatch(await visitorHtml(), new RegExp(FIXED_TEXT), 'draft not public');
		await saveAndWait(page, pageId, '[data-tapestry-publish]');
		const html = await visitorHtml();
		assert.match(html, new RegExp(HEADER_TEXT));
		assert.match(html, new RegExp(FIXED_TEXT));
		assert.match(html, /class="tapestry-area tapestry-area--sidebar"/);
	});

	await step('a one-off page has no header until one is chosen', async () => {
		await page.click('[data-tp-info="tp-template"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-templates]')));
		await page.click('[data-tapestry-template=""]');
		const doc = await working(page);
		assert.equal(doc.template, undefined);
		assert.ok(
			doc.root.every((n) => n.slot === undefined),
			'areas dropped',
		);
		await page.click('[data-tp-info="tp-template"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-own-part="header"]')));
		await page.eval((id) => {
			const select = document.querySelector('[data-tapestry-own-part="header"]');
			select.value = id;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		}, header.id);
		assert.equal((await working(page)).header, header.id);
		await saveAndWait(page, pageId, '[data-tapestry-publish]');
		const html = await visitorHtml();
		assert.match(html, new RegExp(HEADER_TEXT), 'its own header');
		assert.doesNotMatch(html, new RegExp(FIXED_TEXT), 'no template');
	});

	await step('editors can look at Template Management but not change it', async () => {
		const created = await fetch(`${BASE}/studiocms_api/dashboard/create-user`, {
			method: 'POST',
			headers: { ...api(), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: EDITOR,
				email: `${EDITOR}@example.com`,
				displayname: 'E2E TM Editor',
				password: EDITOR_PASSWORD,
				rank: 'editor',
				originalUrl: `${BASE}/dashboard/user-management`,
			}),
		});
		assert.equal(created.status, 200, await created.text());
		editorId = (await db.execute({ sql: 'select id from StudioCMSUsersTable where username = ?', args: [EDITOR] }))
			.rows[0]?.id;
		const signIn = await fetch(`${BASE}/studiocms_api/auth/login`, {
			method: 'POST',
			headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ username: EDITOR, password: EDITOR_PASSWORD }),
			redirect: 'manual',
		});
		const editorCookie = /auth_session=([^;]+)/.exec(signIn.headers.get('set-cookie') ?? '')?.[1];
		assert.ok(editorCookie, 'editor logged in');
		const html = await (
			await fetch(`${TM}?view=templates`, { headers: { Cookie: `auth_session=${editorCookie}` } })
		).text();
		assert.match(html, /data-tapestry-templates-readonly/);
		assert.match(html, /E2E article/);
		assert.doesNotMatch(html, /data-tapestry-template-create|data-tapestry-template-edit/);
		const post = await fetch(`${BASE}/_tapestry/templates`, {
			method: 'POST',
			redirect: 'manual',
			headers: {
				Origin: BASE,
				Cookie: `auth_session=${editorCookie}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'action=create-part&region=header&name=x',
		});
		assert.equal(post.status, 403);
	});

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
	} catch (cause) {
		console.error('Removing test templates failed:', cause);
	}
	if (editorId) {
		await fetch(`${BASE}/studiocms_api/dashboard/users`, {
			method: 'DELETE',
			headers: { ...api(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ userId: editorId, username: EDITOR, usernameConfirm: EDITOR }),
		}).catch(() => {});
	}
	cdp.close();
	await chrome.close();
	db.close();
}
