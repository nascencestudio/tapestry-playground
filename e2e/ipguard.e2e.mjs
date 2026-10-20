// End-to-end tests for IP Guard (@nascencestudio/ipguard ADR 0001): the admin pages and their guards
// (your own address, whitelisted addresses, too-broad ranges), a site-wide ban, the rate limit flagging an
// address (blocked until reviewed), the review actions (dismiss, blacklist, then ban), rejected attempts
// counting too, IPv6 /64 grouping, "Check an address" and settings.
//
// Visitors are simulated with X-Forwarded-For (the dev server trusts the loopback proxy) through the
// dev-only /e2e/ipguard-check endpoint. Prereqs: same as editor.e2e.mjs. Removes the entries it adds and
// restores the settings (other entries are left alone).
import assert from 'node:assert/strict';
import { CDP, launchChrome } from './cdp.mjs';
import { BASE, db, login, SHOTS, step, summary } from './helpers.mjs';

const PAGE = `${BASE}/dashboard/nascencestudio_ipguard/ipguard`;
const SETTINGS_ROW = '@nascencestudio/ipguard-settings';
const ENTRY_PREFIX = '@nascencestudio/ipguard-entry:';
const ATTEMPTS_PREFIX = '@nascencestudio/ipguard-attempts:';
const TEST_SUBJECTS = ['203.0.113.50', '203.0.113.60', '203.0.113.70', '2001:db8:1:2::/64'];

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
const beforeEntries = new Set();
let beforeSettings = null;

const rows = async (prefix) =>
	(
		await db.execute({
			sql: 'select id, data from StudioCMSPluginData where id >= ? and id < ?',
			args: [prefix, `${prefix}￿`],
		})
	).rows;
const entries = async () => (await rows(ENTRY_PREFIX)).map((r) => JSON.parse(r.data));
const entriesFor = async (range) => (await entries()).filter((e) => e.range === range);

/** A protected action from `address` (as a visitor behind the proxy). */
async function act(address, { rejected = false } = {}) {
	const response = await fetch(`${BASE}/e2e/ipguard-check${rejected ? '?rejected' : ''}`, {
		method: 'POST',
		headers: { Origin: BASE, 'X-Forwarded-For': address },
	});
	assert.equal(response.status, 200, await response.clone().text());
	return response.json();
}

/** An admin form post; returns the redirect's query. */
async function admin(fields) {
	const response = await fetch(`${BASE}/_ipguard/admin`, {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ return: '/dashboard/nascencestudio_ipguard/ipguard', ...fields }),
	});
	assert.equal(response.status, 303);
	return new URL(response.headers.get('location'), BASE).searchParams;
}

const open = async (view = '') => {
	await page.goto(view ? `${PAGE}?view=${view}` : PAGE);
	await page.waitFor(
		() => document.readyState === 'complete' && Boolean(document.querySelector('[data-ipguard]')),
		[],
		{
			timeout: 20_000,
			message: 'IP Guard page',
		},
	);
};

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	for (const row of await rows(ENTRY_PREFIX)) beforeEntries.add(row.id);
	beforeSettings =
		(await db.execute({ sql: 'select data from StudioCMSPluginData where id = ?', args: [SETTINGS_ROW] })).rows[0]
			?.data ?? null;
	// Clean counters for the test addresses (a previous failed run could have left some).
	await db.execute({
		sql: `delete from StudioCMSPluginData where id in (${TEST_SUBJECTS.map(() => '?').join(',')})`,
		args: TEST_SUBJECTS.map((s) => `${ATTEMPTS_PREFIX}${s}`),
	});

	await step('visitors and other sites can’t use the admin endpoint', async () => {
		const anonymous = await fetch(`${BASE}/_ipguard/admin`, {
			method: 'POST',
			headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'action=add&list=banned&range=203.0.113.1',
		});
		assert.equal(anonymous.status, 403);
		const forged = await fetch(`${BASE}/_ipguard/admin`, {
			method: 'POST',
			headers: {
				Origin: 'https://evil.example',
				Cookie: `auth_session=${cookie}`,
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'action=add&list=banned&range=203.0.113.1',
		});
		assert.equal(forged.status, 403);
	});

	await step('IP Guard is in the Admin section; your own address and whitelisted ones can’t be blocked', async () => {
		await open();
		const lines = await page.eval(() =>
			document.body.innerText
				.split('\n')
				.map((l) => l.trim())
				.filter(Boolean),
		);
		assert.ok(lines.indexOf('IP Guard') > lines.indexOf('Admin'), 'listed under Admin');
		const yours = await page.eval(() => document.querySelector('[data-ipguard-yours]')?.textContent);
		assert.ok(yours, 'your address is shown');

		await open('whitelist');
		await page.fill('[data-ipguard-add="whitelist"] input[name="range"]', '198.51.100.10');
		await page.fill('[data-ipguard-add="whitelist"] input[name="reason"]', 'E2E office');
		await page.click('[data-ipguard-add="whitelist"] button[type="submit"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-ipguard-saved]')), [], { message: 'whitelisted' });
		assert.ok(await page.eval(() => Boolean(document.querySelector('[data-ipguard-range="198.51.100.10"]'))));

		assert.equal((await admin({ action: 'add', list: 'banned', range: yours })).get('error'), 'own-address');
		assert.equal(
			(await admin({ action: 'add', list: 'banned', range: '198.51.100.0/24' })).get('error'),
			'whitelisted',
		);
		assert.equal((await admin({ action: 'add', list: 'banned', range: '10.0.0.0/7' })).get('error'), 'too-broad');
		assert.equal((await admin({ action: 'add', list: 'banned', range: 'nonsense' })).get('error'), 'bad-range');
		// The page explains the error.
		await page.goto(`${PAGE}?view=banned&error=own-address`);
		await page.waitFor(() => Boolean(document.querySelector('[data-ipguard-error="own-address"]')));
	});

	await step('a banned address gets “Access denied” for every page; others don’t', async () => {
		await open('banned');
		await page.fill('[data-ipguard-add="banned"] input[name="range"]', '203.0.113.50');
		await page.fill('[data-ipguard-add="banned"] input[name="reason"]', 'E2E ban');
		await page.click('[data-ipguard-add="banned"] button[type="submit"]');
		await page.waitFor(() => Boolean(document.querySelector('[data-ipguard-saved]')), [], { message: 'banned' });
		const banned = await fetch(`${BASE}/`, { headers: { 'X-Forwarded-For': '203.0.113.50' } });
		assert.equal(banned.status, 403);
		assert.equal(await banned.text(), 'Access denied.');
		assert.equal((await fetch(`${BASE}/`, { headers: { 'X-Forwarded-For': '203.0.113.51' } })).status, 200);
		// A forged header from outside isn't believed: only the loopback proxy is trusted (unit tests);
		// here the test runner is that proxy.
	});

	await step('over the rate limit: flagged and blocked until reviewed; dismiss lets it submit again', async () => {
		assert.equal(
			(
				await admin({
					action: 'settings',
					enabled: 'on',
					maxAttempts: '3',
					windowSeconds: '300',
					minScore: '75',
					blockMessage: 'Not today.',
				})
			).has('saved'),
			true,
		);
		for (let i = 0; i < 3; i++) assert.equal((await act('203.0.113.60')).outcome, 'allow', `attempt ${i + 1}`);
		assert.deepEqual(await act('203.0.113.60'), { outcome: 'refuse', decision: { action: 'flag' } });
		assert.deepEqual(await act('203.0.113.60'), {
			outcome: 'refuse',
			decision: { action: 'refuse', because: 'flagged' },
		});

		await open();
		const row = '[data-ipguard-range="203.0.113.60"]';
		assert.match(
			await page.eval((r) => document.querySelector(r)?.textContent ?? '', row),
			/Over the rate limit \(3 attempts\)/,
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/ipguard-flagged.png`);
		await page.click(`${row} [data-ipguard-op="dismiss"]`);
		await page.waitFor(
			(r) =>
				document.readyState === 'complete' &&
				!document.querySelector(r) &&
				Boolean(document.querySelector('[data-ipguard-saved]')),
			[row],
			{
				message: 'dismissed',
			},
		);
		assert.equal((await act('203.0.113.60')).outcome, 'allow', 'dismissed: allowed again');
	});

	await step('flagged again, then blacklisted, then banned from the blacklist', async () => {
		for (let i = 0; i < 2; i++) await act('203.0.113.60');
		assert.equal((await act('203.0.113.60')).decision.action, 'flag');
		await open();
		const row = '[data-ipguard-range="203.0.113.60"]';
		await page.click(`${row} [data-ipguard-op="blacklist"]`);
		await page.waitFor((r) => document.readyState === 'complete' && !document.querySelector(r), [row], {
			message: 'blacklisted',
		});
		assert.deepEqual((await act('203.0.113.60')).decision, { action: 'refuse', because: 'blacklist' });
		assert.equal(
			(await fetch(`${BASE}/`, { headers: { 'X-Forwarded-For': '203.0.113.60' } })).status,
			200,
			'the site stays reachable',
		);

		await open('blacklist');
		assert.match(
			await page.eval((r) => document.querySelector(r)?.textContent ?? '', row),
			/Flagged: Over the rate limit/,
		);
		await page.click(`${row} [data-ipguard-op="ban"]`);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-ipguard-saved]')),
			[],
			{ message: 'banned' },
		);
		assert.equal((await fetch(`${BASE}/`, { headers: { 'X-Forwarded-For': '203.0.113.60' } })).status, 403);
	});

	await step('rejected attempts count too; an IPv6 visitor is grouped by its /64', async () => {
		for (let i = 0; i < 3; i++) await act('203.0.113.70', { rejected: true });
		assert.equal((await act('203.0.113.70')).decision.action, 'flag');
		for (let i = 0; i < 3; i++) await act(`2001:db8:1:2::${i + 1}`);
		assert.equal((await act('2001:db8:1:2:ffff::9')).decision.action, 'flag');
		assert.deepEqual(
			(await entriesFor('2001:db8:1:2::/64')).map((e) => e.list),
			['flagged'],
		);
		// Whitelisted addresses are never counted or flagged.
		for (let i = 0; i < 5; i++) assert.equal((await act('198.51.100.10')).outcome, 'allow');
	});

	await step('“Check an address” explains the outcome', async () => {
		await page.goto(`${PAGE}?view=check&ip=203.0.113.60`);
		await page.waitFor(() => Boolean(document.querySelector('[data-ipguard-report]')));
		assert.equal(
			await page.eval(() => document.querySelector('[data-ipguard-outcome]')?.dataset.ipguardOutcome),
			'refuse',
		);
		await page.goto(`${PAGE}?view=check&ip=8.8.8.8`);
		await page.waitFor(() => Boolean(document.querySelector('[data-ipguard-report]')));
		assert.equal(
			await page.eval(() => document.querySelector('[data-ipguard-outcome]')?.dataset.ipguardOutcome),
			'allow',
		);
		if (SHOTS) await page.screenshot(`${SHOTS}/ipguard-check.png`);
	});

	await step('settings: invalid values are refused, nothing saved', async () => {
		await open('settings');
		await page.eval(() => {
			document.querySelector('[data-ipguard-settings] input[name="minScore"]').value = '101';
			document.querySelector('[data-ipguard-settings]').noValidate = true;
		});
		await page.click('[data-ipguard-settings] button[type="submit"]');
		await page.waitFor(
			() =>
				document.readyState === 'complete' && Boolean(document.querySelector('[data-ipguard-error="bad-settings"]')),
			[],
			{
				message: 'refused',
			},
		);
		assert.equal(
			await page.eval(() => document.querySelector('[data-ipguard-settings] input[name="maxAttempts"]').value),
			'3',
		);
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('IP Guard suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/ipguard-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	try {
		// Remove only the entries this suite added (through the endpoint, which also drops IP Guard's cache).
		const added = (await rows(ENTRY_PREFIX)).filter((r) => !beforeEntries.has(r.id)).map((r) => JSON.parse(r.data).id);
		const ids = new URLSearchParams({ action: 'remove', return: '/' });
		for (const id of added) ids.append('ids', id);
		if (added.length) {
			await fetch(`${BASE}/_ipguard/admin`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					Origin: BASE,
					Cookie: `auth_session=${cookie}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: ids,
			});
		}
		await db.execute({
			sql: `delete from StudioCMSPluginData where id in (${TEST_SUBJECTS.map(() => '?').join(',')})`,
			args: TEST_SUBJECTS.map((s) => `${ATTEMPTS_PREFIX}${s}`),
		});
		// Settings back as they were (through the endpoint, for the cache).
		const old = beforeSettings ? JSON.parse(beforeSettings) : {};
		await fetch(`${BASE}/_ipguard/admin`, {
			method: 'POST',
			redirect: 'manual',
			headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: new URLSearchParams({
				action: 'settings',
				return: '/',
				...(old.enabled === false ? {} : { enabled: 'on' }),
				maxAttempts: String(old.maxAttempts ?? 5),
				windowSeconds: String(old.windowSeconds ?? 3600),
				minScore: String(old.minScore ?? 75),
				blockMessage:
					old.blockMessage ??
					'Your submission could not be processed. Please contact us directly if you believe this is an error.',
			}),
		});
		if (!beforeSettings)
			await db.execute({ sql: 'delete from StudioCMSPluginData where id = ?', args: [SETTINGS_ROW] });
	} catch (cause) {
		console.error('IP Guard cleanup failed:', cause);
	}
	cdp.close();
	await chrome.close();
	db.close();
}
