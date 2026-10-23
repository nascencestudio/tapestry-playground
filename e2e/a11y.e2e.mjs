// Accessibility checks with axe-core (docs/decisions/0034-accessibility-and-performance.md):
// WCAG 2.2 A/AA plus axe's best practices, on the public page (as a visitor) and on Tapestry's
// own UI in the editor in many states (settings, link and list fields, rich text, popovers,
// translations, history, compare, schedule, JSON view, save as pattern) and on the media
// library's page (incl. a folder's menu, its new-subfolder field and the delete dialog), the
// Tapestry SEO settings page (every crawler list open), templates (the Templates section, the part
// editor, the Template menu), menus (the Menus page, the tree editor, the page's Navigation settings),
// Fabric (the Display Modes page, "Shown in", the Page list's settings),
// IP Guard (every view) and Webforms (the dashboard's views; the public form empty, with errors and
// sent), in the dashboard's dark and light themes. StudioCMS's own dashboard chrome is out of scope
// (it's StudioCMS's).
//
// Prereqs: same as editor.e2e.mjs. Resets the demo home page before and after, and switches the
// dashboard theme back to dark at the end (StudioCMS saves it per user).
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, homePageId, login, openEditor, resetToDemo, saveAndWait, step, summary } from './helpers.mjs';

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
		// The page uses the template in its draft (the suite resets the page afterwards): the list of
		// pages using it and the delete confirmation in Template Management.
		await page.click(`[data-tapestry-template="${template.id}"]`);
		await saveAndWait(page, pageId);
		await page.goto(`${tm}?view=templates`);
		await loaded();
		const row = `[data-tapestry-template-row="${template.id}"]`;
		await page.click(`${row} [data-tapestry-template-usage]`);
		await page.waitFor((r) => document.querySelector(`${r} [data-tapestry-usage-dialog]`)?.open === true, [row]);
		await audit(page, `${row} [data-tapestry-usage-dialog]`, `${theme}: pages using a template`);
		await page.press('Escape');
		await page.click(`${row} [data-tapestry-template-delete]`);
		await page.waitFor((r) => document.querySelector(`${r} [data-tapestry-delete-dialog]`)?.open === true, [row]);
		await audit(page, `${row} [data-tapestry-delete-dialog]`, `${theme}: delete a template in use`);
		await page.press('Escape');
	} finally {
		// The page back to the demo (no template) first, so the next theme starts clean; then the template
		// (the name is passed as Template Management's confirmation would be, in case it's still in use).
		await resetToDemo(page, pageId);
		await post({ action: 'delete-template', id: template.id, confirm: name });
		await post({ action: 'delete-part', id: part.id });
	}
}

/** IP Guard (@nascencestudio/ipguard ADR 0001): every view, with an entry on each list. */
async function ipguardStates(page, theme) {
	const ipguard = `${BASE}/dashboard/nascencestudio_ipguard/ipguard`;
	const ENTRY = '@nascencestudio/ipguard-entry:';
	const entryIds = async () =>
		(
			await db.execute({
				sql: 'select id from StudioCMSPluginData where id >= ? and id < ?',
				args: [ENTRY, `${ENTRY}\uffff`],
			})
		).rows.map((r) => r.id);
	const before = new Set(await entryIds());
	const post = (fields) =>
		page.eval(
			(f) =>
				fetch('/_ipguard/admin', { method: 'POST', body: new URLSearchParams({ return: '/', ...f }) }).then(() => {}),
			fields,
		);
	await page.goto(ipguard);
	await page.waitFor(() => Boolean(document.querySelector('[data-ipguard]')));
	await post({ action: 'add', list: 'whitelist', range: '198.51.100.20', reason: 'A11y office' });
	await post({ action: 'add', list: 'blacklist', range: '203.0.113.80', reason: 'A11y', expires: '2099-01-01' });
	await post({ action: 'add', list: 'banned', range: '203.0.113.81', reason: 'A11y' });
	// A flagged address: over the default rate limit (5 an hour) through the dev-only check endpoint.
	for (let i = 0; i < 6; i++) {
		await fetch(`${BASE}/e2e/ipguard-check`, {
			method: 'POST',
			headers: { Origin: BASE, 'X-Forwarded-For': '203.0.113.82' },
		});
	}
	try {
		for (const view of ['', 'blacklist', 'banned', 'whitelist', 'settings', 'check&ip=203.0.113.80']) {
			await page.goto(view ? `${ipguard}?view=${view}` : ipguard);
			await page.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('[data-ipguard]')));
			await audit(page, '[data-ipguard]', `${theme}: IP Guard ${view.split('&')[0] || 'flagged'}`);
		}
	} finally {
		const added = (await entryIds()).filter((id) => !before.has(id)).map((id) => id.slice(ENTRY.length));
		const body = new URLSearchParams({ action: 'remove', return: '/' });
		for (const id of added) body.append('ids', id);
		if (added.length)
			await page.eval(
				(b) => fetch('/_ipguard/admin', { method: 'POST', body: new URLSearchParams(b) }).then(() => {}),
				body.toString(),
			);
		await db.execute({
			sql: 'delete from StudioCMSPluginData where id = ?',
			args: ['@nascencestudio/ipguard-attempts:203.0.113.82'],
		});
	}
}

/**
 * Webforms (@nascencestudio/webforms ADR 0001): the forms list, a form with every field type (its fields,
 * every edit form open, settings), its submissions and one submission; the public form empty, with
 * errors and sent (on the dev-only e2e/webform page).
 */
async function webformStates(page, theme) {
	const dash = `${BASE}/dashboard/nascencestudio_webforms/webforms`;
	const loaded = () =>
		page.waitFor(() => document.readyState === 'complete' && Boolean(document.querySelector('[data-webforms]')));
	const post = (fields) =>
		page.eval(
			(f) =>
				fetch('/_webforms/admin', { method: 'POST', body: new URLSearchParams({ return: '/', ...f }) }).then(
					(r) => r.url,
				),
			fields,
		);
	await page.goto(dash);
	await loaded();
	const name = `A11y ${Date.now()}`;
	const created = await post({ action: 'create', name });
	const formId = new URL(created).searchParams.get('form');
	try {
		for (const field of [
			{ type: 'markup', help: 'We reply within a day.' },
			{ type: 'text', label: 'Name', required: 'on' },
			{ type: 'email', label: 'Email', required: 'on' },
			{ type: 'phone', label: 'Phone', help: 'Optional' },
			{ type: 'textarea', label: 'Message' },
			{ type: 'select', label: 'Topic', options: 'Sales\nSupport' },
			{ type: 'radio', label: 'Contact by', options: 'Email\nPhone' },
			{ type: 'checkboxes', label: 'Interests', options: 'Design\nHosting' },
			{ type: 'checkbox', label: 'I agree to be contacted', required: 'on' },
		])
			await post({ action: 'add-field', form: formId, ...field });
		await post({ action: 'settings', form: formId, recipients: 'owner@example.com', keep: 'on', retentionDays: '30' });
		// A submission without a proof of work: kept, as spam.
		await fetch(`${BASE}/_webforms/submit`, {
			method: 'POST',
			headers: { Origin: BASE, Accept: 'application/json', 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({ _form: formId, _page: '/' }),
		});
		await page.goto(dash);
		await loaded();
		await audit(page, '[data-webforms]', `${theme}: webforms`);
		await page.goto(`${dash}?form=${formId}`);
		await loaded();
		await page.eval(() => {
			for (const details of document.querySelectorAll('[data-webforms] details')) details.open = true;
		});
		await audit(page, '[data-webforms]', `${theme}: webform fields`);
		await page.goto(`${dash}?form=${formId}&tab=settings`);
		await loaded();
		await audit(page, '[data-webforms]', `${theme}: webform settings`);
		await page.goto(`${dash}?form=${formId}&tab=submissions&show=all`);
		await loaded();
		await audit(page, '[data-webforms]', `${theme}: webform submissions`);
		const submission = await page.eval(
			() => document.querySelector('[data-webforms-submission]')?.dataset.webformsSubmission,
		);
		assert.ok(submission, 'a submission is listed');
		await page.goto(`${dash}?form=${formId}&tab=submissions&submission=${encodeURIComponent(submission)}`);
		await loaded();
		await audit(page, '[data-webforms]', `${theme}: webform submission`);

		const visitor = await cdp.page({ isolated: true });
		try {
			const sel = `form[data-webform="${formId}"]`;
			await visitor.goto(`${BASE}/e2e/webform?form=${formId}`);
			await visitor.waitFor((s) => Boolean(document.querySelector(s)), [sel]);
			await audit(visitor, 'html', `${theme}: public webform`);
			// Errors come from the server, which treats submissions sent within 3 s as automated.
			await new Promise((r) => setTimeout(r, 3200));
			await visitor.click(`${sel} [data-webform-submit]`);
			await visitor.waitFor((s) => Boolean(document.querySelector(`${s} [aria-invalid="true"]`)), [sel], {
				timeout: 30_000,
			});
			await audit(visitor, 'html', `${theme}: public webform with errors`);
			await visitor.goto(`${BASE}/e2e/webform?form=${formId}&webform=${formId}&webform-status=sent`);
			await visitor.waitFor(() => Boolean(document.querySelector('[data-webform-thanks]')));
			await audit(visitor, 'html', `${theme}: public webform sent`);
		} finally {
			await cdp
				.send('Target.closeTarget', { targetId: (await visitor.send('Target.getTargetInfo')).targetInfo.targetId })
				.catch(() => {});
		}
	} finally {
		await post({ action: 'delete-form', form: formId, confirm: name });
	}
}

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
	const name = `A11y ${Date.now()}`;
	const created = await post({ action: 'create', name });
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

/**
 * Tapestry Fabric (Fabric ADR 0001, Tapestry ADR 0046): the Display Modes page (with an added mode, its delete
 * button), "Shown in" on a template component, and the Page list's settings (multiple-choice chips), in a
 * throwaway template's editor (the home page isn't touched).
 */
async function fabricStates(page, theme) {
	const dm = `${BASE}/dashboard/nascencestudio_tapestry_fabric/display_modes`;
	const tm = `${BASE}/dashboard/nascencestudio_tapestry/templates`;
	const row = '@nascencestudio/tapestry-display-modes';
	const before =
		(await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [row] })).rows[0]?.data ?? null;
	const post = (url, fields) =>
		page.eval(
			(u, f) => fetch(u, { method: 'POST', body: new URLSearchParams({ return: '/', ...f }) }).then(() => {}),
			url,
			fields,
		);
	const name = `A11y ${Date.now()}`;
	await page.goto(dm);
	await page.waitFor(
		() => document.readyState === 'complete' && Boolean(document.querySelector('[data-fabric-modes]')),
	);
	await post('/_fabric/modes', { action: 'add', name: `${name} card` });
	await post('/_tapestry/templates', { action: 'create-template', name, header: '', footer: '' });
	const template = (await page.eval(() => fetch('/_tapestry/templates').then((r) => r.json()))).templates.find(
		(t) => t.name === name,
	);
	const canvasReady = () =>
		page.waitFor(() => document.querySelector('.tp-canvas__status')?.dataset.state === 'ready', [], {
			timeout: 30_000,
		});
	const add = async (label) => {
		await page.click(`.tp-library__item[title^="Add ${label}"]`);
		await page.waitFor(() => Boolean(document.querySelector('.tp-row[aria-selected="true"]')));
		return page.eval(() => document.querySelector('.tp-row[aria-selected="true"]')?.dataset.tpRow);
	};
	try {
		await page.goto(dm);
		await page.waitFor(
			() => document.readyState === 'complete' && document.querySelectorAll('[data-fabric-mode]').length >= 3,
		);
		await audit(page, '[data-fabric-modes]', `${theme}: display modes`);
		await page.goto(`${tm}?edit=${template.id}`);
		await canvasReady();
		const area = await add('Content area');
		await page.waitFor((id) => Boolean(document.getElementById(`tp-node-modes-${id}`)), [area]);
		await audit(page, '.tp-editor', `${theme}: shown in`);
		await page.eval(() => document.activeElement?.blur());
		await page.press('Escape');
		const list = await add('Page list');
		await page.waitFor((id) => Boolean(document.getElementById(`tp-field-${id}-categories`)), [list], {
			timeout: 15_000,
		});
		await audit(page, '.tp-editor', `${theme}: page list settings`);
	} finally {
		await post('/_tapestry/templates', { action: 'delete-template', id: template.id, confirm: name });
		if (before === null) await db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [row] });
		else await db.execute({ sql: 'update StudioCMSPluginData set data = ? where id = ?', args: [before, row] });
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
	await fabricStates(page, theme);
	await ipguardStates(page, theme);
	await webformStates(page, theme);
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
	db.close();
}
