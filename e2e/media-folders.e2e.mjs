// End-to-end tests for media library folders (medialibrary ADR 0100): creating,
// renaming, moving and deleting folders on the Media page, uploading into a folder,
// moving items (details panel, multiple selection, drag and drop), and that the disk
// mirrors the folders while file URLs never change.
//
// Prereqs: same as editor.e2e.mjs; the dev server's media directory must be this
// site's `data/media` (or MEDIA_DIR). Deletes every item and folder it creates.
import assert from 'node:assert/strict';
import { access } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, get, login, SHOTS, step, summary } from './helpers.mjs';

const FIXTURES = resolve(import.meta.dirname, 'fixtures');
const MEDIA_DIR = process.env.MEDIA_DIR ?? resolve(import.meta.dirname, '../data/media');
const MEDIA_PAGE = '/dashboard/nascencestudio_medialibrary/media';
const RUN = Math.random().toString(36).slice(2, 7);
const PARENT = `E2E Folders ${RUN}`;
const PARENT_DIR = `e2e-folders-${RUN}`;

const onDisk = (path) =>
	access(join(MEDIA_DIR, path)).then(
		() => true,
		() => false,
	);
const items = async () =>
	(await db.execute('select id, name, storageKey, folderId from NascenceMediaItems')).rows.map((r) => ({ ...r }));
const folders = async () =>
	(await db.execute('select id, parentId, name, slug from NascenceMediaFolders')).rows.map((r) => ({ ...r }));

async function setFiles(page, selector, files) {
	const { root } = await page.send('DOM.getDocument', { depth: 1 });
	const { nodeId } = await page.send('DOM.querySelector', { nodeId: root.nodeId, selector });
	await page.send('DOM.setFileInputFiles', { nodeId, files });
}

/** Choose an option of a select by value (fires change, like a person picking it). */
const choose = (page, selector, value) =>
	page.eval(
		(sel, val) => {
			const el = document.querySelector(sel);
			el.value = val;
			el.dispatchEvent(new Event('change', { bubbles: true }));
		},
		selector,
		value,
	);

/** Open a folder's ⋮ menu and choose an action. */
async function folderMenu(page, folderId, action) {
	await page.click(`[data-media-folder-menu="${folderId}"]`);
	await page.waitFor(() => Boolean(document.querySelector('[role="menu"]')));
	await page.click(`[role="menu"] [data-media-folder-action="${action}"]`);
}

const status = (page) => page.eval(() => document.querySelector('.ml-status')?.textContent ?? '');

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
const beforeItems = new Set();
const beforeFolders = new Set();

try {
	cookie = await login();
	for (const row of await items().catch(() => [])) beforeItems.add(row.id);
	for (const row of await folders().catch(() => [])) beforeFolders.add(row.id);
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	await page.goto(`${BASE}${MEDIA_PAGE}`);
	await page.waitFor(() => Boolean(document.querySelector('[data-media-folders="ready"]')), [], {
		timeout: 20_000,
	});

	await step('a new folder appears in the list and as a directory on disk', async () => {
		await page.click('[data-media-folder-action="create"]');
		await page.fill('[data-media-folder-name="create"]', PARENT);
		await page.click('[data-media-folder-save="create"]');
		await page.waitFor(
			(name) => document.querySelector('.ml-status')?.textContent === `Created folder "${name}".`,
			[PARENT],
		);
		const parent = (await folders()).find((f) => f.name === PARENT);
		assert.equal(parent.slug, PARENT_DIR);
		assert.ok(await onDisk(PARENT_DIR), 'directory created');
		// Same name again (any case) is refused.
		await page.waitFor(() => Boolean(document.querySelector('[data-media-folder-action="create"]')));
		await page.click('[data-media-folder-action="create"]');
		await page.fill('[data-media-folder-name="create"]', PARENT.toUpperCase());
		await page.click('[data-media-folder-save="create"]');
		await page.waitFor(() => /already a folder/.test(document.querySelector('.ml-status')?.textContent ?? ''));
		await page.click('[data-media-folder-cancel="create"]');
		await page.waitFor(() => !document.querySelector('[data-media-folder-name="create"]'));
	});

	await step('subfolders nest on disk, with safe directory names', async () => {
		const parent = (await folders()).find((f) => f.name === PARENT);
		await folderMenu(page, parent.id, 'subfolder');
		await page.fill('[data-media-folder-name="subfolder"]', '../Café Photos');
		await page.click('[data-media-folder-save="subfolder"]');
		await page.waitFor(() => /Created folder/.test(document.querySelector('.ml-status')?.textContent ?? ''));
		const child = (await folders()).find((f) => f.parentId === parent.id);
		assert.equal(child.name, '../Café Photos', 'the display name is kept');
		assert.equal(child.slug, 'cafe-photos', 'the directory name is safe');
		assert.ok(await onDisk(`${PARENT_DIR}/cafe-photos`));
	});

	let png;
	let pngUrl;
	await step('uploads go into the folder being viewed, and are served by file name', async () => {
		const child = (await folders()).find((f) => f.slug === 'cafe-photos' && !beforeFolders.has(f.id));
		await page.click(`[data-media-folder="${child.id}"]`);
		await page.waitFor(() => /This folder is empty/.test(document.querySelector('.ml-empty')?.textContent ?? ''));
		await setFiles(page, '[data-media-file-input]', [`${FIXTURES}/sample.png`, `${FIXTURES}/sample.pdf`]);
		await page.waitFor(() => document.querySelectorAll('[data-media-item]').length === 2, [], { timeout: 20_000 });
		const added = (await items()).filter((r) => !beforeItems.has(r.id));
		assert.equal(added.length, 2);
		assert.ok(added.every((r) => r.folderId === child.id));
		png = added.find((r) => r.name === 'sample.png');
		assert.equal(png.storageKey, `${png.id}.png`, 'stored as a plain file name');
		assert.ok(await onDisk(`${PARENT_DIR}/cafe-photos/${png.id}.png`), 'file in the folder directory');
		pngUrl = `/files/${png.id}.png`;
		assert.equal((await get(pngUrl)).status, 200);
		assert.equal((await get(`/files/${png.id}-nope.png`)).status, 404, 'unknown file names are not served');
		assert.equal((await get(`/files/${PARENT_DIR}/cafe-photos/${png.id}.png`)).status, 404, 'no folder paths in URLs');
		if (SHOTS) await page.screenshot(`${SHOTS}/media-folders.png`);
	});

	await step('renaming a folder renames its directory; URLs stay the same', async () => {
		const parent = (await folders()).find((f) => f.name === PARENT);
		// The menu works with the keyboard: arrows move, Escape closes and returns focus.
		await page.click(`[data-media-folder-menu="${parent.id}"]`);
		await page.waitFor(() => document.activeElement?.getAttribute('data-media-folder-action') === 'subfolder');
		await page.press('ArrowDown');
		assert.equal(await page.eval(() => document.activeElement?.getAttribute('data-media-folder-action')), 'rename');
		await page.press('Escape');
		await page.waitFor(() => !document.querySelector('[role="menu"]'));
		assert.equal(
			await page.eval(() => document.activeElement?.getAttribute('data-media-folder-menu')),
			parent.id,
			'focus back on the ⋮ button',
		);
		if (SHOTS) {
			await page.click(`[data-media-folder-menu="${parent.id}"]`);
			await page.screenshot(`${SHOTS}/media-folder-menu.png`);
			await page.press('Escape');
		}
		await folderMenu(page, parent.id, 'rename');
		await page.fill('[data-media-folder-name="rename"]', `${PARENT} Renamed`);
		await page.click('[data-media-folder-save="rename"]');
		await page.waitFor(() => /Renamed the folder/.test(document.querySelector('.ml-status')?.textContent ?? ''));
		assert.equal((await folders()).find((f) => f.id === parent.id).slug, `${PARENT_DIR}-renamed`);
		assert.ok(await onDisk(`${PARENT_DIR}-renamed/cafe-photos/${png.id}.png`), 'moved with its folder');
		assert.equal(await onDisk(PARENT_DIR), false, 'old directory gone');
		assert.equal((await get(pngUrl)).status, 200, 'same URL');
	});

	await step('the details panel moves an item; its file follows', async () => {
		const child = (await folders()).find((f) => f.slug === 'cafe-photos' && !beforeFolders.has(f.id));
		await page.click(`[data-media-folder="${child.id}"]`);
		await page.waitFor((id) => Boolean(document.querySelector(`[data-media-item="${id}"]`)), [png.id]);
		await page.click(`[data-media-item="${png.id}"]`);
		await page.waitFor((id) => Boolean(document.querySelector(`[data-media-details="${id}"]`)), [png.id]);
		await choose(page, '[data-media-folder-select="item"]', 'top');
		await page.waitFor((id) => !document.querySelector(`[data-media-item="${id}"]`), [png.id], {
			message: 'left the folder view',
		});
		assert.match(await status(page), /to the top level/);
		assert.equal((await items()).find((r) => r.id === png.id).folderId, null);
		assert.ok(await onDisk(`${png.id}.png`), 'file at the top level');
		assert.equal((await get(pngUrl)).status, 200, 'same URL');
	});

	await step('dragging selected items onto a folder moves them all', async () => {
		const parent = (await folders()).find((f) => f.name === `${PARENT} Renamed`);
		const pdf = (await items()).find((r) => r.name === 'sample.pdf' && !beforeItems.has(r.id));
		await page.click('[data-media-folder="all"]');
		await page.waitFor(
			(ids) => ids.every((id) => document.querySelector(`[data-media-item="${id}"]`)),
			[[png.id, pdf.id]],
		);
		await page.click(`[data-media-item="${png.id}"]`);
		// Ctrl-click adds to the selection.
		await page.eval((id) => {
			document
				.querySelector(`[data-media-item="${id}"]`)
				.dispatchEvent(new MouseEvent('click', { bubbles: true, ctrlKey: true }));
		}, pdf.id);
		await page.waitFor(() => document.querySelector('[data-media-multi]')?.getAttribute('data-media-multi') === '2');
		// Measure both points first: measuring scrolls, which would move an already-pressed drag.
		const to = await page.center(`[data-media-folder="${parent.id}"]`);
		const from = await page.center(`[data-media-item="${png.id}"]`);
		await page.realDrag(
			async () => from,
			async () => to,
		);
		await page.waitFor(() => /Moved 2 items/.test(document.querySelector('.ml-status')?.textContent ?? ''), [], {
			message: 'two items moved',
		});
		const moved = (await items()).filter((r) => r.id === png.id || r.id === pdf.id);
		// A dragged card must never count as a file drop (it once uploaded a copy of the thumbnail).
		assert.equal((await items()).filter((r) => !beforeItems.has(r.id)).length, 2, 'nothing uploaded by the drag');
		assert.ok(moved.every((r) => r.folderId === parent.id));
		assert.ok(await onDisk(`${PARENT_DIR}-renamed/${png.id}.png`));
		assert.ok(await onDisk(`${PARENT_DIR}-renamed/${pdf.id}.pdf`));
		assert.equal((await get(pngUrl)).status, 200, 'same URL');
	});

	await step('moving a folder moves its directory; a folder cannot go inside itself', async () => {
		const parent = (await folders()).find((f) => f.name === `${PARENT} Renamed`);
		const child = (await folders()).find((f) => f.parentId === parent.id);
		await folderMenu(page, parent.id, 'move');
		await page.waitFor(() => document.querySelector('[data-media-move-folder]')?.open === true);
		const disabled = await page.eval(
			(id) =>
				document.querySelector(
					`[data-media-move-folder] [data-media-folder-select="folder-move"] option[value="${id}"]`,
				).disabled,
			child.id,
		);
		assert.ok(disabled, 'its own subfolder is not offered');
		const refused = await fetch(`${BASE}/_media/api/folders/${parent.id}`, {
			method: 'PATCH',
			headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ parentId: child.id }),
		});
		assert.equal(refused.status, 400, 'the server refuses it too');
		await page.click('[data-media-move-folder-cancel]');
		await page.waitFor(() => !document.querySelector('[data-media-move-folder]'));
		// Move the subfolder to the top level.
		await folderMenu(page, child.id, 'move');
		await page.waitFor(() => document.querySelector('[data-media-move-folder]')?.open === true);
		await choose(page, '[data-media-move-folder] [data-media-folder-select="folder-move"]', 'top');
		await page.click('[data-media-move-folder-confirm]');
		await page.waitFor(() => /to the top level/.test(document.querySelector('.ml-status')?.textContent ?? ''));
		assert.equal((await folders()).find((f) => f.id === child.id).parentId, null);
		assert.ok(await onDisk('cafe-photos'), 'directory moved to the top level');
		assert.equal(await onDisk(`${PARENT_DIR}-renamed/cafe-photos`), false);
	});

	await step('deleting a folder asks for its name, then deletes everything in it', async () => {
		const parent = (await folders()).find((f) => f.name === `${PARENT} Renamed`);
		const inside = (await items()).filter((r) => r.folderId === parent.id);
		assert.equal(inside.length, 2);
		const del = (body) =>
			fetch(`${BASE}/_media/api/folders/${parent.id}`, {
				method: 'DELETE',
				headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/json' },
				body: body && JSON.stringify(body),
			});
		assert.equal((await del()).status, 409, 'the server wants the name too');
		assert.equal((await del({ confirm: 'something else' })).status, 409);

		await folderMenu(page, parent.id, 'delete');
		await page.waitFor(() => document.querySelector('[data-media-delete-folder]')?.open === true);
		assert.match(
			await page.eval(() => document.querySelector('[data-media-delete-folder]').textContent),
			/2 media items/,
		);
		const disabled = () => page.eval(() => document.querySelector('[data-media-delete-folder-confirm]').disabled);
		assert.equal(await disabled(), true, 'Delete starts disabled');
		await page.fill('[data-media-delete-folder-name]', 'nope');
		assert.equal(await disabled(), true);
		if (SHOTS) await page.screenshot(`${SHOTS}/media-delete-folder.png`);
		await page.click('[data-media-delete-folder-cancel]');
		await page.waitFor(() => !document.querySelector('[data-media-delete-folder]'));
		assert.ok(
			(await folders()).some((f) => f.id === parent.id),
			'Cancel keeps everything',
		);

		await folderMenu(page, parent.id, 'delete');
		await page.waitFor(() => document.querySelector('[data-media-delete-folder]')?.open === true);
		await page.fill('[data-media-delete-folder-name]', `  ${PARENT.toUpperCase()} renamed `); // any case
		await page.waitFor(() => !document.querySelector('[data-media-delete-folder-confirm]').disabled);
		await page.click('[data-media-delete-folder-confirm]');
		await page.waitFor(() =>
			/Deleted folder .* with 2 items/.test(document.querySelector('.ml-status')?.textContent ?? ''),
		);
		assert.equal(
			(await folders()).some((f) => f.id === parent.id),
			false,
		);
		const left = await items();
		assert.ok(
			inside.every((r) => !left.some((l) => l.id === r.id)),
			'its items are deleted',
		);
		assert.equal(await onDisk(`${PARENT_DIR}-renamed`), false, 'its directory and files are gone');
		assert.equal((await get(pngUrl)).status, 404);

		// An empty folder: the same dialog, which says so.
		const child = (await folders()).find((f) => f.slug === 'cafe-photos' && !beforeFolders.has(f.id));
		await folderMenu(page, child.id, 'delete');
		await page.waitFor(() =>
			/The folder is empty/.test(document.querySelector('[data-media-delete-folder]')?.textContent ?? ''),
		);
		await page.fill('[data-media-delete-folder-name]', child.name);
		await page.click('[data-media-delete-folder-confirm]');
		await page.waitFor(() => !document.querySelector('[data-media-delete-folder]'));
		assert.equal(await onDisk('cafe-photos'), false);
	});

	await step('folder names from the API are cleaned and checked', async () => {
		const post = (body) =>
			fetch(`${BASE}/_media/api/folders`, {
				method: 'POST',
				headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/json' },
				body: JSON.stringify(body),
			});
		assert.equal((await post({ name: '   ' })).status, 400);
		assert.equal((await post({ name: 'x', parentId: 'f_doesnotexist0000' })).status, 404);
		assert.equal((await post({ name: 'x', parentId: '../../etc' })).status, 404);
		const odd = await post({ name: '.tmp' });
		assert.equal(odd.status, 201);
		const { folder } = await odd.json();
		assert.equal(folder.slug, 'tmp', 'never a hidden directory');
		await fetch(`${BASE}/_media/api/folders/${folder.id}`, {
			method: 'DELETE',
			headers: { Origin: BASE, Cookie: `auth_session=${cookie}` },
		});
		const crossSite = await fetch(`${BASE}/_media/api/folders`, {
			method: 'POST',
			headers: { Origin: 'https://evil.example', Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/json' },
			body: JSON.stringify({ name: 'x' }),
		});
		assert.equal(crossSite.status, 403);
		assert.equal((await get('/_media/api/folders')).status, 403, 'editors only');
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Media folders suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/media-folders-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	if (cookie) {
		const headers = { Origin: BASE, Cookie: `auth_session=${cookie}` };
		for (const row of await items().catch(() => [])) {
			if (beforeItems.has(row.id)) continue;
			await fetch(`${BASE}/_media/api/items/${row.id}?force=1`, { method: 'DELETE', headers }).catch(() => {});
		}
		// Children before parents.
		const created = (await folders().catch(() => [])).filter((f) => !beforeFolders.has(f.id));
		for (let pass = 0; pass < 3 && created.length; pass++) {
			for (const folder of [...created]) {
				const response = await fetch(`${BASE}/_media/api/folders/${folder.id}`, {
					method: 'DELETE',
					headers: { ...headers, 'Content-Type': 'application/json' },
					body: JSON.stringify({ confirm: folder.name }),
				}).catch(() => null);
				if (response?.ok) created.splice(created.indexOf(folder), 1);
			}
		}
	}
	cdp.close();
	await chrome.close();
	db.close();
}
