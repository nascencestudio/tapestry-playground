// End-to-end tests for menus (tapestry-menus ADR 0001, Tapestry ADR 0042): Dashboard → Menus (create a
// menu, build its tree with the item form, the keyboard buttons and drag and drop, save), saves from an
// outdated copy refused, the Menu and Breadcrumbs components on a page (links, current page, new tab,
// visibility by login), the page editor's Menu settings panel, and editors' read-only view.
//
// Prereqs: same as editor.e2e.mjs. Resets the demo home page; removes the menus and the editor account
// it creates (menus that existed before are left alone).
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
const MENUS = `${BASE}/dashboard/nascencestudio_tapestry_menus/menus`;
const NAME = `E2E main ${randomBytes(2).toString('hex')}`;
const EDITOR = `e2e-mn-${randomBytes(3).toString('hex')}`;
const EDITOR_PASSWORD = `Ed-${randomBytes(18).toString('base64url')}`;

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
let editorId;
const before = new Set();
const api = () => ({ Origin: BASE, Cookie: `auth_session=${cookie}` });
const menusApi = async (query = '') => (await fetch(`${BASE}/_menus/menus${query}`, { headers: api() })).json();
let menuId;

const ids = (page) => page.eval(() => [...document.querySelectorAll('[data-tm-item]')].map((li) => li.dataset.tmItem));
const labels = (page) =>
	page.eval(() =>
		[...document.querySelectorAll('[data-tm-item]')].map(
			(li) => `${li.dataset.tmLevel}:${li.querySelector('.tm-row__label')?.textContent}`,
		),
	);
/** Page HTML without the dev server's source annotations (`data-astro-source-*`). */
const clean = (html) => html.replace(/ data-astro-source-(?:file|loc)="[^"]*"/g, '');
const status = (page) => page.eval(() => document.querySelector('[data-tm-status]')?.textContent ?? '');

/** Add an item (at the top level, or under the selected one with `child`) and give it a label. */
async function addItem(page, label, { child = false } = {}) {
	const count = (await ids(page)).length;
	await page.click(child ? '[data-tm-tool="add-child"]' : '[data-tm-add-top]');
	await page.waitFor((n) => document.querySelectorAll('[data-tm-item]').length > n, [count], { message: 'item added' });
	await page.fill('[data-tm-field="label"]', label);
	return page.eval(() => document.querySelector('[data-tm-item-form]')?.dataset.tmItemForm);
}

async function setSelect(page, selector, value) {
	await page.eval(
		(sel, v) => {
			const select = document.querySelector(sel);
			select.value = v;
			select.dispatchEvent(new Event('change', { bubbles: true }));
		},
		selector,
		value,
	);
}

async function saveMenu(page) {
	await page.click('[data-tm-save]');
	await page.waitFor(() => /^(Saved|Not saved)/.test(document.querySelector('[data-tm-status]')?.textContent ?? ''), [], {
		timeout: 15_000,
		message: 'menu saved',
	});
	return status(page);
}

/** Add a component from the library (nothing selected: at the end) and return its id. */
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

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	// The menu editor asks before leaving with unsaved changes (beforeunload): accept, so a failed step
	// can't block the cleanup's navigation.
	await page.send('Page.enable');
	cdp.on((message) => {
		if (message.sessionId === page.sessionId && message.method === 'Page.javascriptDialogOpening') {
			page.send('Page.handleJavaScriptDialog', { accept: true }).catch(() => {});
		}
	});
	for (const { menu } of (await menusApi()).menus) before.add(menu.id);

	await step('visitors can’t use the menus endpoints; other sites can’t post', async () => {
		assert.equal((await get('/_menus/menus')).status, 403);
		assert.equal((await get('/_menus/options')).status, 403);
		assert.equal((await get(`/_menus/page?id=${pageId}`)).status, 403);
		const forged = await fetch(`${BASE}/_menus/menus`, {
			method: 'POST',
			headers: { ...api(), Origin: 'https://evil.example', 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'create', name: 'x' }),
		});
		assert.equal(forged.status, 403);
	});

	await step('Menus sits after Template Management; a new menu opens in the editor', async () => {
		await page.goto(MENUS);
		await page.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tm-create]')), [], {
			timeout: 20_000,
			message: 'Menus page',
		});
		const lines = await page.eval(() =>
			document.body.innerText
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
		);
		assert.equal(lines[lines.indexOf('Template Management') + 1], 'Menus', 'right after Template Management');
		await page.fill('#tm-new-name', NAME);
		await page.click('[data-tm-create] button[type="submit"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tm-menu-editor] [data-tm-add-top]')), [], {
			timeout: 20_000,
			message: 'menu editor',
		});
		menuId = await page.eval(() => document.querySelector('[data-tm-menu-editor]')?.dataset.tmMenuEditor);
		assert.match(menuId, /^mn_[a-z0-9]{16}$/);
		assert.equal(
			await page.eval(() => document.querySelector('[data-tm-nav-link][aria-current="page"]')?.textContent.trim()),
			NAME,
			'the menu is the active sidebar link',
		);
	});

	await step('items get labels, links and options; the keyboard buttons move them', async () => {
		const home = await addItem(page, 'Home');
		await page.click('[data-tm-link-kind="page"]');
		await page.waitFor((id) => Boolean(document.querySelector(`[data-tm-field="page"] option[value="${id}"]`)), [pageId], {
			message: 'pages loaded',
		});
		await setSelect(page, '[data-tm-field="page"]', pageId);
		const docs = await addItem(page, 'Docs');
		await page.click('[data-tm-link-kind="url"]');
		await page.fill('[data-tm-field="url"]', 'javascript:alert(1)');
		assert.ok(await page.eval(() => Boolean(document.querySelector('[data-tm-problem]'))), 'unsafe address flagged');
		await page.fill('[data-tm-field="url"]', 'https://example.com/docs');
		await page.click('[data-tm-field="newTab"]');
		await page.fill('[data-tm-field="className"]', 'external "><b>');
		const members = await addItem(page, 'Members');
		await setSelect(page, '[data-tm-field="visibility"]', 'logged-in');
		const team = await addItem(page, 'Team', { child: true });
		await page.click('[data-tm-link-kind="url"]');
		await page.fill('[data-tm-field="url"]', '/team');
		assert.deepEqual(await labels(page), ['1:Home', '1:Docs', '1:Members', '2:Team']);

		// Keyboard: Docs up (first), then Team out of Members and back in.
		await page.click(`[data-tm-item="${docs}"] [data-tm-select]`);
		await page.click('[data-tm-move="up"]');
		assert.deepEqual(await labels(page), ['1:Docs', '1:Home', '1:Members', '2:Team']);
		await page.click(`[data-tm-item="${team}"] [data-tm-select]`);
		await page.click('[data-tm-move="out"]');
		assert.deepEqual(await labels(page), ['1:Docs', '1:Home', '1:Members', '1:Team']);
		await page.click('[data-tm-move="in"]');
		assert.deepEqual(await labels(page), ['1:Docs', '1:Home', '1:Members', '2:Team']);
		assert.match(await status(page), /Moved to level 2/);

		// Drag and drop: Home above Docs (the top quarter of Docs' row).
		await page.drag(`[data-tm-item="${home}"] .tm-row`, `[data-tm-item="${docs}"] .tm-row`, { yFraction: 0.1 });
		await page.waitFor(
			(id) => document.querySelector('[data-tm-item]')?.dataset.tmItem === id,
			[home],
			{ message: 'Home dragged to the top' },
		);
		assert.deepEqual(await labels(page), ['1:Home', '1:Docs', '1:Members', '2:Team']);
		if (SHOTS) await page.screenshot(`${SHOTS}/menus-editor.png`);
		assert.match(await saveMenu(page), /^Saved/);

		const { menu, rev } = await menusApi(`?id=${menuId}`);
		assert.equal(rev, 2);
		assert.deepEqual(menu.items, [
			{ id: home, label: 'Home', link: { type: 'page', page: pageId } },
			{
				id: docs,
				label: 'Docs',
				link: { type: 'url', url: 'https://example.com/docs', newTab: true },
				className: 'external',
			},
			{
				id: members,
				label: 'Members',
				link: null,
				visibility: 'logged-in',
				children: [{ id: team, label: 'Team', link: { type: 'url', url: '/team' } }],
			},
		]);
	});

	await step('a save from an outdated copy is refused; editors can’t change menus', async () => {
		const { menu } = await menusApi(`?id=${menuId}`);
		const stale = await fetch(`${BASE}/_menus/menus`, {
			method: 'POST',
			headers: { ...api(), 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'save', menu: { ...menu, name: 'Stale' }, rev: 1 }),
		});
		assert.equal(stale.status, 409);
		assert.equal((await stale.json()).current.menu.name, NAME);

		const created = await fetch(`${BASE}/studiocms_api/dashboard/create-user`, {
			method: 'POST',
			headers: { ...api(), 'Content-Type': 'application/json' },
			body: JSON.stringify({
				username: EDITOR,
				email: `${EDITOR}@example.com`,
				displayname: 'E2E Menus Editor',
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
		const asEditor = { Origin: BASE, Cookie: `auth_session=${editorCookie}` };
		const options = await (await fetch(`${BASE}/_menus/options`, { headers: asEditor })).json();
		assert.ok(options.options.some((o) => o.value === menuId && o.label === NAME), 'editors get the choices');
		const html = await (await fetch(`${MENUS}?menu=${menuId}`, { headers: asEditor })).text();
		assert.match(html, /data-tm-mount/);
		assert.match(html, /&quot;canEdit&quot;:false/);
		const post = await fetch(`${BASE}/_menus/menus`, {
			method: 'POST',
			headers: { ...asEditor, 'Content-Type': 'application/json' },
			body: JSON.stringify({ action: 'delete', id: menuId }),
		});
		assert.equal(post.status, 403);
		assert.ok((await menusApi(`?id=${menuId}`)).menu, 'still there');
	});

	await step('Menu and Breadcrumbs on a page: links, current page, new tab, login-only items', async () => {
		await openEditor(page, pageId);
		const menuNode = await addFromLibrary(page, 'Menu');
		await page.waitFor(
			(sel, id) => Boolean(document.querySelector(`${sel} option[value="${id}"]`)),
			[`#tp-field-${menuNode}-menu`, menuId],
			{ message: 'menu choices loaded' },
		);
		await setSelect(page, `#tp-field-${menuNode}-menu`, menuId);
		const crumbs = await addFromLibrary(page, 'Breadcrumbs');
		await page.waitFor(
			(sel, id) => Boolean(document.querySelector(`${sel} option[value="${id}"]`)),
			[`#tp-field-${crumbs}-menu`, menuId],
		);
		await setSelect(page, `#tp-field-${crumbs}-menu`, menuId);
		const doc = await working(page);
		assert.deepEqual(
			doc.root.filter((n) => n.type.startsWith('tapestry-')).map((n) => [n.type, n.props.menu]),
			[
				['tapestry-menu', menuId],
				['tapestry-breadcrumbs', menuId],
			],
		);
		await page.waitFor(
			(name) =>
				Boolean(
					document
						.querySelector('[data-tapestry-canvas]')
						?.contentDocument?.querySelector(`nav[aria-label="${name}"]`),
				),
			[NAME],
			{ timeout: 30_000, message: 'the menu on the canvas' },
		);
		await saveAndWait(page, pageId, '[data-tapestry-publish]');

		const visitor = clean(await (await fetch(`${BASE}/`)).text());
		const nav = /<nav class="menu menu--e2e-main-[0-9a-f]{4}"[^>]*>[\s\S]*?<\/nav>/.exec(visitor)?.[0];
		assert.ok(nav, 'the menu with its class from the name');
		assert.match(nav, /<li class="menu__item menu__item--home menu__item--current"><a class="menu__link" href="\/" aria-current="page">Home<\/a>/);
		assert.match(nav, /menu__item--docs external"><a class="menu__link" href="https:\/\/example.com\/docs" target="_blank" rel="noopener noreferrer">Docs/);
		assert.doesNotMatch(nav, /Members|Team/, 'login-only items are hidden from visitors');
		assert.match(visitor, /<nav class="breadcrumbs" aria-label="Breadcrumb">[\s\S]*?<span class="breadcrumbs__current" aria-current="page">Home<\/span>/);
		assert.doesNotMatch(visitor, /breadcrumbs__item--home/, 'no second home link when the menu starts with it');

		const member = clean(await (await fetch(`${BASE}/`, { headers: { Cookie: `auth_session=${cookie}` } })).text());
		assert.match(member, /<span class="menu__label">Members<\/span><ul class="menu__list menu__list--level-2">/);
		assert.match(member, /href="\/team">Team</);
	});

	await step('Menu settings under the settings panel show the page’s link; admins rename it there', async () => {
		await openEditor(page, pageId);
		assert.equal(
			await page.eval(() => Boolean(document.querySelector('[data-tapestry-extension="menu"]'))),
			false,
			'no Menu button in the editor bar',
		);
		const panel = '[data-tapestry-panel="menu"]';
		await page.click(`${panel} > summary`);
		await page.waitFor((sel) => Boolean(document.querySelector(`${sel} [data-tm-provide]`)), [panel], {
			timeout: 15_000,
			message: 'Menu settings loaded',
		});
		const state = await page.eval((sel) => {
			const root = document.querySelector(sel);
			const parent = root.querySelector('[data-tm-link-parent]');
			return {
				provide: root.querySelector('[data-tm-provide]').checked,
				title: root.querySelector('[data-tm-link-title]').value,
				parent: parent.selectedOptions[0]?.textContent,
			};
		}, panel);
		assert.deepEqual(state, { provide: true, title: 'Home', parent: `<${NAME}>` });
		if (SHOTS) await page.screenshot(`${SHOTS}/menus-settings.png`);
		await page.fill(`${panel} [data-tm-link-title]`, 'Start');
		await page.click(`${panel} [data-tm-save-link]`);
		await page.waitFor(
			(sel) => /^Saved/.test(document.querySelector(`${sel} [data-tm-settings-status]`)?.textContent ?? ''),
			[panel],
			{ timeout: 15_000, message: 'saved from the panel' },
		);
		assert.equal((await menusApi(`?id=${menuId}`)).menu.items[0].label, 'Start');
		assert.match(clean(await (await fetch(`${BASE}/`)).text()), /aria-current="page">Start<\/a>/, 'live at once');
		// Nothing of this reached the page's own form (it isn't part of the page's draft).
		assert.doesNotMatch(await page.eval(() => document.querySelector('textarea[data-tapestry-field]').value), /Start/);
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Menus suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/menus-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	if (page) await resetToDemo(page, pageId).catch((e) => console.error('Cleanup failed:', e));
	try {
		for (const { menu } of (await menusApi()).menus) {
			if (before.has(menu.id)) continue;
			await fetch(`${BASE}/_menus/menus`, {
				method: 'POST',
				headers: { ...api(), 'Content-Type': 'application/json' },
				body: JSON.stringify({ action: 'delete', id: menu.id }),
			});
		}
	} catch (cause) {
		console.error('Removing test menus failed:', cause);
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
