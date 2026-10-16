// Accessibility checks with axe-core (docs/decisions/0034-accessibility-and-performance.md):
// WCAG 2.2 A/AA plus axe's best practices, on the public page (as a visitor) and on Tapestry's
// own UI in the editor in many states (settings, link and list fields, rich text, popovers,
// translations, history, compare, schedule, JSON view, save as pattern) and on the media
// library's page (incl. a folder's menu, its new-subfolder field and the delete dialog), the
// Tapestry SEO settings page (every crawler list open), templates (the Templates section, the part
// editor, the Template menu) and menus (the Menus page, the tree editor, the page's Navigation settings), in the dashboard's dark and light themes. StudioCMS's own dashboard chrome is
// out of scope (it's StudioCMS's).
//
// Prereqs: same as editor.e2e.mjs. Resets the demo home page before and after, and switches the
// dashboard theme back to dark at the end (StudioCMS saves it per user).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, homePageId, login, openEditor, resetToDemo, step, summary } from './helpers.mjs';

const AXE = readFileSync(createRequire(import.meta.url).resolve('axe-core/axe.min.js'), 'utf8');
const TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa', 'best-practice'];
const MEDIA_PAGE = '/dashboard/nascencestudio_medialibrary/media';
const pageId = await homePageId();

/** Run axe on `context` (a selector) and fail with a readable list of violations. */
async function audit(page, context, label) {
	await page.eval(AXE);
	const violations = await page.eval(
		`axe.run(${JSON.stringify(context)}, { runOnly: { type: 'tag', values: ${JSON.stringify(TAGS)} } })
			.then((r) => r.violations.map((v) => ({ id: v.id, impact: v.impact, help: v.help,
				nodes: v.nodes.slice(0, 5).map((n) => n.target.join(' ')) })))`,
	);
	assert.deepEqual(violations, [], `${label}: ${JSON.stringify(violations, null, 2)}`);
}

/** Templates (Tapestry ADR 0041): Template Management, the part and template editors, the Template menu. */
async function templateStates(page, theme) {
	const tm = `${BASE}/dashboard/nascencestudio_tapestry/templates`;
	const loaded = () =>
		page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tapestry-templates-settings]')),
		);
	await page.goto(tm);
	await loaded();
	const post = (fields) =>
		page.eval(
			(f) =>
				fetch('/_tapestry/templates', { method: 'POST', body: new URLSearchParams({ return: '/', ...f }) }).then(
					() => {},
				),
			fields,
		);
	const list = () => page.eval(() => fetch('/_tapestry/templates').then((r) => r.json()));
	const name = `A11y ${Date.now()}`;
	await post({ action: 'create-part', region: 'header', name });
	const part = (await list()).parts.find((p) => p.name === name);
	await post({ action: 'create-template', name, header: part.id, footer: '' });
	const template = (await list()).templates.find((t) => t.name === name);
	const canvasReady = () =>
		page.waitFor(() => document.querySelector('.tp-canvas__status')?.dataset.state === 'ready', [], {
			timeout: 30_000,
		});
	try {
		await page.goto(tm);
		await loaded();
		await audit(page, '[data-tapestry-templates-settings]', `${theme}: headers and footers`);
		await page.goto(`${tm}?view=templates`);
		await loaded();
		await audit(page, '[data-tapestry-templates-settings]', `${theme}: templates`);
		await page.goto(`${tm}?edit=${part.id}`);
		await canvasReady();
		await audit(page, '.tp-editor', `${theme}: part editor`);
		await page.goto(`${tm}?edit=${template.id}`);
		await canvasReady();
		await audit(page, '.tp-editor', `${theme}: template editor`);
		await openEditor(page, pageId);
		await page.click('[data-tp-info="tp-template"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-own-parts]')));
		await audit(page, '.tp-editor', `${theme}: template menu`);
		await page.press('Escape');
	} finally {
		await post({ action: 'delete-template', id: template.id });
		await post({ action: 'delete-part', id: part.id });
	}
}

/** Menus (tapestry-menus ADR 0001): the Menus page, the tree editor with an item selected, Navigation settings. */
async function menuStates(page, theme) {
	const menusPage = `${BASE}/dashboard/nascencestudio_tapestry_menus/menus`;
	await page.goto(menusPage);
	await page.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tm-page]')));
	const post = (body) =>
		page.eval(
			(b) =>
				fetch('/_menus/menus', {
					method: 'POST',
					headers: { 'Content-Type': 'application/json' },
					body: JSON.stringify(b),
				}).then((r) => r.json()),
			body,
		);
	const created = await post({ action: 'create', name: `A11y ${Date.now()}` });
	const items = [
		{ id: 'mi_a11yhome0001', label: 'Home', link: { type: 'page', page: pageId } },
		{
			id: 'mi_a11ydocs0001',
			label: 'Docs',
			link: { type: 'url', url: 'https://example.com', newTab: true },
			visibility: 'logged-in',
			children: [{ id: 'mi_a11yhide0001', label: 'Hidden', link: null, enabled: false }],
		},
	];
	await post({ action: 'save', rev: created.rev, menu: { ...created.menu, items } });
	try {
		await page.goto(menusPage);
		await page.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('[data-tm-list]')));
		await audit(page, '[data-tm-page]', `${theme}: menus`);
		await page.goto(`${menusPage}?menu=${created.menu.id}`);
		await page.waitFor(() => document.querySelectorAll('[data-tm-item]').length === 3);
		await page.click('[data-tm-item="mi_a11ydocs0001"] [data-tm-select]');
		await page.waitFor(() => Boolean(document.querySelector('[data-tm-tool="remove"]')));
		await audit(page, '[data-tm-page]', `${theme}: menu editor`);
		await openEditor(page, pageId);
		await page.click('[data-tapestry-panel="menu"] > summary');
		await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-panel="menu"] [data-tm-link-title]')), [], {
			timeout: 15_000,
		});
		await audit(page, '[data-tapestry-panel="menu"]', `${theme}: navigation settings`);
		// The notice that replaces StudioCMS's "Show in navigation" (Basic Information tab).
		await page.eval(() => {
			const tab = [...document.querySelectorAll('[role="tab"]')].find((t) =>
				t.textContent.includes('Basic Information'),
			);
			tab.dataset.e2e = 'basic-info-tab';
		});
		await page.click('[data-e2e="basic-info-tab"]');
		await page.waitFor(
			() => (document.querySelector('[data-tapestry-menus-notice]')?.getBoundingClientRect().height ?? 0) > 0,
		);
		await audit(page, '[data-tapestry-menus-notice]', `${theme}: navigation notice`);
	} finally {
		await post({ action: 'delete', id: created.menu.id });
	}
}

const editorStates = async (page, theme) => {
	await openEditor(page, pageId);
	await page.waitFor(() => document.querySelector('.tp-canvas__status')?.dataset.state === 'ready');
	await audit(page, '.tp-editor', `${theme}: editor`);
	await page.click('[data-tp-row="text-1"] .tp-row__label');
	await page.click('[data-tapestry-edit-here]').catch(() => {}); // the rich text field itself, not the canvas note
	await audit(page, '.tp-editor', `${theme}: rich text settings`);
	await page.click('[data-tp-row="button-1"] .tp-row__label');
	await audit(page, '.tp-editor', `${theme}: link field`);
	await page.click('[data-tapestry-save-pattern]');
	await audit(page, '.tp-editor', `${theme}: save as pattern`);
	await page.click('.tp-library__item[title^="Add FAQ "]');
	await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-list-field]')));
	await audit(page, '.tp-editor', `${theme}: list field`);
	// An error state: a required field emptied shows its problem (danger text must be readable).
	const faq = await page.eval(() => document.querySelector('.tp-row[aria-selected="true"]').dataset.tpRow);
	await page.fill(`#tp-field-${faq}-items__0__question`, '');
	await page.waitFor((id) => Boolean(document.getElementById(`tp-field-${id}-items__0__question-error`)), [faq]);
	await audit(page, '.tp-editor', `${theme}: field error`);
	await page.click('[data-tp-info="tp-problems"]');
	await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-problems]')));
	await audit(page, '.tp-editor', `${theme}: content problems`);
	await page.press('Escape');
	for (const [id, name] of [
		['tp-layers-help', 'page structure help'],
		['tp-canvas-help', 'canvas help'],
		['tp-translations', 'translations menu'],
	]) {
		await page.click(`[data-tp-info="${id}"]`);
		if (id === 'tp-translations') {
			await page.waitFor(() => Boolean(document.querySelector('[data-tapestry-translations]')));
		}
		await audit(page, '.tp-editor', `${theme}: ${name}`);
		await page.press('Escape');
	}
	// Modals: audit the dialog (the page behind it is inert and dimmed by the backdrop).
	await page.click('[data-tapestry-seo-toggle]');
	await page.waitFor(() => Boolean(document.querySelector('[data-seo-dialog] [data-seo-save]')), [], {
		timeout: 15_000,
	});
	await page.eval(() => {
		document.querySelector('#seo-title').value = '';
		document.querySelector('[data-seo-dialog] .seo-advanced').open = true;
	});
	await audit(page, '[data-seo-dialog]', `${theme}: SEO dialog`);
	await page.press('Escape');
	await page.waitFor(() => !document.querySelector('[data-seo-dialog]'));
	await page.click('[data-tapestry-history-toggle]');
	await page.waitFor(() => document.querySelector('[data-tapestry-history-modal]')?.open === true);
	await audit(page, '[data-tapestry-history-modal]', `${theme}: history`);
	if (await page.eval(() => Boolean(document.querySelector('[data-tapestry-compare="0"]')))) {
		await page.click('[data-tapestry-compare="0"]');
		await page.waitFor(() => document.querySelector('[data-tapestry-compare-modal]')?.open === true);
		await audit(page, '[data-tapestry-compare-modal]', `${theme}: compare`);
	}
	await openEditor(page, pageId);
	await page.click('[data-tapestry-schedule-toggle]');
	await audit(page, '.tp-editor', `${theme}: schedule`);
	await page.click('[data-tapestry-schedule-toggle]'); // close it
	await page.click('[data-tapestry-json-toggle]');
	await page.waitFor(() => document.querySelector('[data-tapestry-json-modal]')?.open === true);
	await audit(page, '[data-tapestry-json-modal]', `${theme}: JSON view`);
	await page.goto(`${BASE}/dashboard/plugins@nascencestudio/tapestry-seo`);
	await page.waitFor(() => Boolean(document.querySelector('[data-seo-settings]')));
	await page.eval(() => {
		for (const details of document.querySelectorAll('[data-seo-settings] details')) details.open = true;
	});
	await audit(page, '[data-seo-settings]', `${theme}: SEO settings`);
	await templateStates(page, theme);
	await menuStates(page, theme);
	await page.goto(`${BASE}${MEDIA_PAGE}`);
	await page.waitFor(() => Boolean(document.querySelector('[data-media-library]')));
	await audit(page, '[data-media-library]', `${theme}: media library`);
	// A selected folder with its "new subfolder" form open (media library folders, ADR 0100).
	const folderId = await page.eval(async () => {
		const response = await fetch('/_media/api/folders', {
			method: 'POST',
			headers: { 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: `A11y ${Date.now()}` }),
		});
		return (await response.json()).folder.id;
	});
	try {
		await page.goto(`${BASE}${MEDIA_PAGE}`);
		await page.waitFor((id) => Boolean(document.querySelector(`[data-media-folder="${id}"]`)), [folderId]);
		await page.click(`[data-media-folder="${folderId}"]`);
		await page.click(`[data-media-folder-menu="${folderId}"]`);
		await page.waitFor(() => Boolean(document.querySelector('[role="menu"]')));
		await audit(page, '[data-media-library]', `${theme}: media library folder menu`);
		await page.click('[role="menu"] [data-media-folder-action="subfolder"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-media-folder-name="subfolder"]')));
		await audit(page, '[data-media-library]', `${theme}: media library folder`);
		await page.click('[data-media-folder-cancel="subfolder"]');
		await page.click(`[data-media-folder-menu="${folderId}"]`);
		await page.click('[role="menu"] [data-media-folder-action="delete"]');
		await page.waitFor(() => document.querySelector('[data-media-delete-folder]')?.open === true);
		await audit(page, '[data-media-delete-folder]', `${theme}: delete folder dialog`);
		await page.click('[data-media-delete-folder-cancel]');
	} finally {
		await page.eval((id) => fetch(`/_media/api/folders/${id}`, { method: 'DELETE' }).then(() => {}), folderId);
	}
};

const setTheme = (page, theme) =>
	page.eval((t) => {
		document.documentElement.setAttribute('data-theme', t);
		return new Promise((r) => setTimeout(r, 800)); // StudioCMS saves the preference
	}, theme);

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;

try {
	const cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });

	await step('the public page has no violations (as a visitor)', async () => {
		await resetToDemo(page, pageId);
		const visitor = await cdp.page({ isolated: true });
		await visitor.goto(`${BASE}/`);
		await audit(visitor, 'html', 'public page');
	});

	await step('the editor has no violations in the dark theme (panels, fields, popovers, history)', async () => {
		await editorStates(page, 'dark');
	});

	await step('…nor in the light theme', async () => {
		await openEditor(page, pageId);
		await setTheme(page, 'light');
		await editorStates(page, 'light');
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Accessibility suite');
} catch (error) {
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	if (page) {
		await openEditor(page, pageId)
			.then(() => setTheme(page, 'dark'))
			.catch((e) => console.error('Theme reset failed:', e));
		await resetToDemo(page, pageId).catch((e) => console.error('Cleanup failed:', e));
	}
	cdp.close();
	await chrome.close();
}
