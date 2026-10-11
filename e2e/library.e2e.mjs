// End-to-end tests for the component library's pictures (docs/decisions/0029-library-previews.md):
// developer thumbnails in the library and, enlarged, on hover and focus. Every playground component
// has one, so live previews (the fallback for components without a thumbnail) aren't shown here.
//
// Prereqs: same as editor.e2e.mjs. Doesn't change any page.
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, homePageId, login, openEditor, step, summary } from './helpers.mjs';

const pageId = await homePageId();
const item = (label) => `.tp-library__item[title^="Add ${label} "]`;

/** The enlarged thumbnail shown for a component on hover/focus, once loaded (else null). */
const shownThumbnail = (page, type) =>
	page.eval((t) => {
		const box = document.querySelector(`[data-tapestry-preview="${t}"]`);
		const img = box?.querySelector('img.tp-preview__thumbnail');
		return img?.complete && img.naturalWidth > 0
			? {
					// Thumbnails come as data URIs (base64 or URL-encoded): identify them by the SVG's <title>.
					title: (img.src.includes(';base64,')
						? atob(img.src.split(',')[1])
						: decodeURIComponent(img.src.slice(img.src.indexOf(',') + 1))
					).match(/<title>(.*?)<\/title>/)?.[1],
					hidden: box.getAttribute('aria-hidden'),
					frames: box.querySelectorAll('iframe').length,
				}
			: null;
	}, type);

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;

try {
	const cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });

	await step('a component with a thumbnail shows it in the library', async () => {
		await openEditor(page, pageId);
		const thumb = await page.waitFor(
			(sel) => {
				const img = document.querySelector(`${sel} img.tp-library__thumb`);
				return img?.complete && img.naturalWidth > 0 ? { src: img.getAttribute('src'), alt: img.alt } : false;
			},
			[item('Two columns')],
			{ message: 'thumbnail loaded' },
		);
		assert.equal(thumb.alt, '');
		const response = await fetch(new URL(thumb.src, BASE), { headers: { Cookie: `auth_session=${cookie}` } });
		assert.equal(response.status, 200);
		assert.match(response.headers.get('content-type') ?? '', /image\/svg\+xml/);
		// Every playground component has one (components without a thumbnail just show their name; Tapestry's
		// unit tests cover that).
		const missing = await page.eval(() =>
			[...document.querySelectorAll('.tp-library__item')]
				.filter((el) => !el.querySelector('img'))
				.map((el) => el.textContent.trim()),
		);
		assert.deepEqual(missing, []);
	});

	await step('hovering a component shows its thumbnail, enlarged', async () => {
		const { x, y } = await page.center(item('Heading'));
		await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x, y });
		await page.waitFor((t) => document.querySelector(`[data-tapestry-preview="${t}"] img`)?.complete, ['heading'], {
			message: 'thumbnail shown',
		});
		const shown = await shownThumbnail(page, 'heading');
		assert.equal(shown?.title, 'Heading');
		assert.equal(shown?.hidden, 'true', 'decorative: the button already names the component');
		assert.equal(shown?.frames, 0, 'no live preview when there is a thumbnail');
	});

	await step('moving away hides it; keyboard focus shows it too', async () => {
		await page.send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: 5, y: 5 });
		await page.waitFor(() => !document.querySelector('[data-tapestry-preview]'), [], { message: 'preview hidden' });
		await page.eval((sel) => document.querySelector(sel).focus(), item('FAQ'));
		await page.waitFor((t) => document.querySelector(`[data-tapestry-preview="${t}"] img`)?.complete, ['faq'], {
			message: 'FAQ thumbnail shown',
		});
		assert.equal((await shownThumbnail(page, 'faq'))?.title, 'FAQ');
		await page.eval(() => document.activeElement.blur());
		await page.waitFor(() => !document.querySelector('[data-tapestry-preview]'), [], {
			message: 'preview hidden on blur',
		});
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Library suite');
} catch (error) {
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	cdp.close();
	await chrome.close();
}
