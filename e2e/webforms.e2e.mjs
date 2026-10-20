// End-to-end tests for Webforms (@nascencestudio/webforms ADR 0001): building a form in the dashboard,
// placing it with Tapestry's Webform block, a visitor sending it (proof of work in the browser, errors by
// field, the thank-you message), every spam check rejecting what it should (honeypot, no or reused proof,
// too fast) while answering like a success, IP Guard refusing a blacklisted visitor, the Submissions page
// (filters, marking, a submission, CSV export with formulas neutralised) and deleting a form.
//
// Email: with E2E_MAIL_SINK=1 (a scratch or CI site only: it sets the site's SMTP Configuration), the
// suite runs a tiny SMTP server and checks the email; otherwise it checks that submissions are kept with
// "Email is off". Prereqs: same as editor.e2e.mjs. Resets the home page; deletes the forms, submissions
// and IP Guard entries it creates.
import assert from 'node:assert/strict';
import { createHash, randomBytes } from 'node:crypto';
import { createServer } from 'node:net';
import { CDP, launchChrome } from './cdp.mjs';
import {
	BASE,
	db,
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
const DASH = `${BASE}/dashboard/nascencestudio_webforms/webforms`;
const NAME = `E2E quote ${randomBytes(2).toString('hex')}`;
const FORM_PREFIX = '@nascencestudio/webforms-form:';
const SUB_PREFIX = '@nascencestudio/webforms-sub:';
const MAIL_SINK = process.env.E2E_MAIL_SINK === '1';

const chrome = await launchChrome({ headless: !process.env.HEADED });
const cdp = await CDP.connect(chrome.wsUrl);
let page;
let cookie;
let formId;
const beforeForms = new Set();
const beforeIpguard = new Set();
const mails = [];
let sink;
let restoreMail;

const rows = async (prefix) =>
	(
		await db.execute({
			sql: 'select id, data from StudioCMSPluginData where id >= ? and id < ?',
			args: [prefix, `${prefix}￿`],
		})
	).rows;
const submissionsOf = async (id) => (await rows(`${SUB_PREFIX}${id}:`)).map((r) => JSON.parse(r.data));
const formOf = async (id) => JSON.parse((await rows(`${FORM_PREFIX}${id}`))[0].data);

const admin = async (fields) => {
	const response = await fetch(`${BASE}/_webforms/admin`, {
		method: 'POST',
		redirect: 'manual',
		headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/x-www-form-urlencoded' },
		body: new URLSearchParams({ return: '/dashboard/nascencestudio_webforms/webforms', ...fields }),
	});
	return new URL(response.headers.get('location') ?? '/', BASE).searchParams;
};

/** A proof of work solved here (what the browser's worker does). */
async function solve(id) {
	const challenge = await (await fetch(`${BASE}/_webforms/challenge?form=${id}`)).json();
	for (let nonce = 0; ; nonce++) {
		const hash = createHash('sha256').update(`${challenge.salt}:${nonce}`).digest();
		let bits = 0;
		for (const byte of hash) {
			if (byte === 0) {
				bits += 8;
				continue;
			}
			bits += Math.clz32(byte) - 24;
			break;
		}
		if (bits >= challenge.difficulty) return { token: challenge.token, nonce: String(nonce) };
	}
}

/** A solved proof, as the form fields the browser sends. */
const proofFields = async (id = formId) => {
	const solved = await solve(id);
	return { _pow: solved.token, _nonce: solved.nonce };
};

/** A submission sent directly (as a bot would), with the form token from the rendered page. */
async function submitRaw(fields, { headers = {} } = {}) {
	const response = await fetch(`${BASE}/_webforms/submit`, {
		method: 'POST',
		headers: {
			Origin: BASE,
			Accept: 'application/json',
			'Content-Type': 'application/x-www-form-urlencoded',
			...headers,
		},
		body: new URLSearchParams(fields),
	});
	return { status: response.status, body: await response.json() };
}

/** The form token as rendered on the home page now (`backdate` ms older, so it isn't "too fast"). */
async function tokenFromPage() {
	const html = await (await fetch(`${BASE}/`)).text();
	return /name="_token" value="([^"]+)"/.exec(html)?.[1];
}

/** A minimal SMTP server that records messages (E2E_MAIL_SINK only). */
function startSink() {
	return new Promise((resolve) => {
		const server = createServer((socket) => {
			let data = '';
			let inData = false;
			socket.write('220 sink ESMTP\r\n');
			socket.on('data', (chunk) => {
				data += chunk.toString('utf8');
				for (let index = data.indexOf('\r\n'); !inData && index >= 0; index = data.indexOf('\r\n')) {
					const line = data.slice(0, index);
					data = data.slice(index + 2);
					const verb = line.slice(0, 4).toUpperCase();
					if (verb === 'EHLO' || verb === 'HELO') socket.write('250-sink\r\n250 OK\r\n');
					else if (verb === 'DATA') {
						inData = true;
						socket.write('354 go\r\n');
					} else if (verb === 'QUIT') socket.end('221 bye\r\n');
					else socket.write('250 OK\r\n');
				}
				const end = data.indexOf('\r\n.\r\n');
				if (inData && end >= 0) {
					mails.push(data.slice(0, end));
					data = data.slice(end + 5);
					inData = false;
					socket.write('250 queued\r\n');
				}
			});
		});
		server.listen(0, '127.0.0.1', () => resolve(server));
	});
}

try {
	cookie = await login();
	page = await cdp.page();
	await page.send('Network.setCookie', { name: 'auth_session', value: cookie, url: BASE });
	for (const row of await rows(FORM_PREFIX)) beforeForms.add(row.id);
	for (const row of await rows('@nascencestudio/ipguard-entry:')) beforeIpguard.add(row.id);

	await step('visitors can’t use the dashboard endpoints; other sites can’t submit', async () => {
		assert.equal((await fetch(`${BASE}/_webforms/options`)).status, 403);
		assert.equal((await fetch(`${BASE}/_webforms/export?form=wf_aaaaaaaaaaaaaaaa`)).status, 403);
		const adminAnon = await fetch(`${BASE}/_webforms/admin`, {
			method: 'POST',
			headers: { Origin: BASE, 'Content-Type': 'application/x-www-form-urlencoded' },
			body: 'action=create&name=x',
		});
		assert.equal(adminAnon.status, 403);
		const forged = await fetch(`${BASE}/_webforms/submit`, {
			method: 'POST',
			headers: {
				Origin: 'https://evil.example',
				Accept: 'application/json',
				'Content-Type': 'application/x-www-form-urlencoded',
			},
			body: 'x=1',
		});
		assert.equal(forged.status, 403);
	});

	await step('Webforms has a Contact form; a new form is built from fields', async () => {
		await page.goto(DASH);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-webforms-create]')),
			[],
			{
				timeout: 20_000,
				message: 'Webforms page',
			},
		);
		const names = await page.eval(() =>
			[...document.querySelectorAll('[data-webforms-card] .webforms__card-name')].map((n) => n.textContent),
		);
		assert.ok(names.includes('Contact'), 'the Contact form exists');
		await page.fill('[data-webforms-create] input[name="name"]', NAME);
		await page.click('[data-webforms-create] button[type="submit"]');
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-webforms-add-field]')),
			[],
			{
				timeout: 20_000,
				message: 'the new form',
			},
		);
		formId = new URL(await page.eval(() => location.href)).searchParams.get('form');
		assert.match(formId, /^wf_[a-z0-9]{16}$/);

		const addField = async (fields) => {
			const query = await admin({ action: 'add-field', form: formId, ...fields });
			assert.ok(query.has('saved'), `added ${fields.label ?? fields.type}: ${query.get('error')}`);
		};
		// One through the page (the type switch hides what doesn't apply), the rest directly.
		await page.eval(() => {
			const select = document.querySelector('[data-webforms-type]');
			select.value = 'text';
			select.dispatchEvent(new Event('change'));
		});
		assert.equal(
			await page.eval(
				() => document.querySelector('[data-webforms-add-field] textarea[name="options"]').closest('label').hidden,
			),
			true,
		);
		await page.fill('[data-webforms-add-field] input[name="label"]', 'Name');
		await page.click('[data-webforms-add-field] input[name="required"]');
		await page.click('[data-webforms-add-field] button[type="submit"]');
		await page.waitFor(
			() => document.readyState === 'complete' && document.querySelectorAll('[data-webforms-field]').length === 1,
			[],
			{ message: 'the Name field added' },
		);
		await addField({ type: 'email', label: 'Email', required: 'on' });
		await addField({ type: 'select', label: 'Topic', options: 'Sales\nSupport' });
		await addField({ type: 'textarea', label: 'Message', maxLength: '500' });
		await addField({ type: 'checkbox', label: 'I agree to be contacted', required: 'on' });
		await addField({ type: 'markup', help: 'We reply within a day.' });
		const form = await formOf(formId);
		assert.deepEqual(
			form.fields.map((f) => [f.type, f.label, f.required]),
			[
				['text', 'Name', true],
				['email', 'Email', true],
				['select', 'Topic', false],
				['textarea', 'Message', false],
				['checkbox', 'I agree to be contacted', true],
				['markup', '', false],
			],
		);
		// Move the text block to the top.
		const markup = form.fields[5].id;
		for (let i = 0; i < 5; i++) await admin({ action: 'move-up', form: formId, field: markup });
		assert.equal((await formOf(formId)).fields[0].type, 'markup');
		const settings = await admin({
			action: 'settings',
			form: formId,
			recipients: 'owner@example.com',
			subject: 'Quote: {form}',
			thankYou: 'Thanks, we’ll be in touch.',
			keep: 'on',
			retentionDays: '30',
		});
		assert.ok(settings.has('saved'), String(settings.get('error')));
		assert.equal(
			(await admin({ action: 'settings', form: formId, recipients: 'not-an-email', retentionDays: '30' })).get('error'),
			'bad-recipient',
		);
		if (SHOTS) {
			await page.goto(`${DASH}?form=${formId}`);
			await page.waitFor(() => Boolean(document.querySelector('[data-webforms-fields]')));
			await page.screenshot(`${SHOTS}/webforms-builder.png`);
		}
	});

	await step('the Webform block puts the form on a page', async () => {
		await openEditor(page, pageId);
		await page.eval(() => document.activeElement?.blur());
		const before = await page.eval(() => document.querySelectorAll('.tp-tree [data-tp-row]').length);
		await page.click('.tp-library__item[title^="Add Webform"]');
		await page.waitFor((n) => document.querySelectorAll('.tp-tree [data-tp-row]').length > n, [before]);
		const node = await page.eval(() => document.querySelector('.tp-row[aria-selected="true"]')?.dataset.tpRow);
		await page.waitFor(
			(sel, id) => Boolean(document.querySelector(`${sel} option[value="${id}"]`)),
			[`#tp-field-${node}-form`, formId],
			{ message: 'form choices loaded' },
		);
		await page.eval(
			(sel, id) => {
				const select = document.querySelector(sel);
				select.value = id;
				select.dispatchEvent(new Event('change', { bubbles: true }));
			},
			`#tp-field-${node}-form`,
			formId,
		);
		assert.ok((await working(page)).root.some((n) => n.type === 'tapestry-webform' && n.props.form === formId));
		await saveAndWait(page, pageId, '[data-tapestry-publish]');
	});

	if (MAIL_SINK) {
		await step('(E2E_MAIL_SINK) email goes through SMTP Configuration', async () => {
			sink = await startSink();
			const port = sink.address().port;
			const api = (path, body) =>
				fetch(`${BASE}/studiocms_api/dashboard${path}`, {
					method: 'POST',
					headers: { Origin: BASE, Cookie: `auth_session=${cookie}`, 'Content-Type': 'application/json' },
					body: JSON.stringify(body),
				});
			const smtp = {
				host: '127.0.0.1',
				port,
				secure: false,
				proxy: null,
				auth_user: null,
				auth_pass: null,
				tls_rejectUnauthorized: false,
				tls_servername: null,
				default_sender: 'site@example.com',
			};
			// StudioCMS can't update an existing SMTP configuration (its update inserts again: Tapestry known
			// issue #39), so this scratch-only step removes the old one first.
			await db.execute({
				sql: 'delete from StudioCMSDynamicConfigSettings where id = ?',
				args: ['SCMS_MAILER_CONFIG_1'],
			});
			const setup = await api('/mailer/config', smtp);

			assert.ok(setup.ok, await setup.text());
			// StudioCMS's config update takes the whole site configuration: the current one, mail turned on.
			const current = JSON.parse(
				(
					await db.execute({
						sql: 'select data from StudioCMSDynamicConfigSettings where id = ?',
						args: ['SCMS_SITE_CONFIG_1'],
					})
				).rows[0].data,
			);
			const config = await api('/config', { ...current, enableMailer: true });
			assert.ok(config.ok, await config.text());
			// With mail on, StudioCMS emails admins about saves and refuses the save when that fails, so the
			// mailer is turned back off before the sink closes (finally).
			restoreMail = () => api('/config', { ...current, enableMailer: false });
		});
	}

	await step('a visitor sends the form: errors by field, then the thank-you message', async () => {
		const visitor = await cdp.page({ isolated: true });
		await visitor.goto(`${BASE}/`);
		await visitor.waitFor((id) => Boolean(document.querySelector(`form[data-webform="${id}"]`)), [formId], {
			timeout: 20_000,
		});
		const sel = `form[data-webform="${formId}"]`;
		// A person takes more than 3 s (quicker submissions are treated as automated, quietly).
		await new Promise((r) => setTimeout(r, 3200));
		// Submitting the empty form: the required fields say so, focus on the first.
		await visitor.click(`${sel} [data-webform-submit]`);
		await visitor.waitFor((s) => Boolean(document.querySelector(`${s} [aria-invalid="true"]`)), [sel], {
			timeout: 30_000,
			message: 'errors shown',
		});
		const shown = await visitor.eval((s) => {
			const form = document.querySelector(s);
			return {
				errors: [...form.querySelectorAll('[data-webform-error]:not([hidden])')].map((e) => e.textContent),
				focused: document.activeElement?.getAttribute('aria-invalid'),
			};
		}, sel);
		assert.deepEqual(shown.errors, [
			'Please fill in this field.',
			'Please fill in this field.',
			'Please tick this box.',
		]);
		assert.equal(shown.focused, 'true');
		if (SHOTS) await visitor.screenshot(`${SHOTS}/webforms-errors.png`);

		const form = await formOf(formId);
		const id = (label) => form.fields.find((f) => f.label === label).id;
		await visitor.fill(`#webform-${formId}-${id('Name')}`, 'Ada Lovelace');
		await visitor.fill(`#webform-${formId}-${id('Email')}`, 'ada@example.com');
		await visitor.fill(`#webform-${formId}-${id('Message')}`, '=HYPERLINK("http://evil.example","x")\nSecond line');
		await visitor.eval((s) => {
			const select = document.querySelector(`${s} select`);
			select.value = 'Support';
		}, sel);
		await visitor.click(`#webform-${formId}-${id('I agree to be contacted')}`);
		await visitor.click(`${sel} [data-webform-submit]`);
		await visitor.waitFor(() => Boolean(document.querySelector('[data-webform-thanks]')), [], {
			timeout: 30_000,
			message: 'thank-you',
		});
		assert.equal(
			await visitor.eval(() => document.querySelector('[data-webform-thanks]').textContent),
			'Thanks, we’ll be in touch.',
		);
		assert.deepEqual(visitor.errors, []);
		await cdp
			.send('Target.closeTarget', { targetId: (await visitor.send('Target.getTargetInfo')).targetInfo.targetId })
			.catch(() => {});

		const subs = await submissionsOf(formId);
		assert.equal(subs.length, 1);
		assert.deepEqual(subs[0].spam, []);
		assert.equal(subs[0].replyTo, 'ada@example.com');
		assert.equal(subs[0].values[id('Topic')], 'Support');
		assert.equal(subs[0].mail, MAIL_SINK ? 'sent' : 'off');
		if (MAIL_SINK) {
			await new Promise((r) => setTimeout(r, 300));
			const mail = mails.at(-1) ?? '';
			assert.match(mail, /^Subject: Quote: E2E quote/m);
			assert.match(mail, /^To: owner@example\.com/m);
			assert.match(mail, /^Content-Transfer-Encoding: quoted-printable/m);
			// The body is quoted-printable: soft line breaks, then =XX bytes.
			const body = Buffer.from(
				mail
					.slice(mail.indexOf('\r\n\r\n') + 4)
					.replace(/=\r\n/g, '')
					.replace(/=([0-9A-F]{2})/g, (_, hex) => String.fromCharCode(Number.parseInt(hex, 16))),
				'latin1',
			).toString('utf8');
			assert.match(body, /^Reply to: ada@example\.com$/m);
			assert.match(body, /^Message:\r\n=HYPERLINK\("http:\/\/evil\.example","x"\)\r\nSecond line$/m);
			assert.match(body, /^—$/m);
		}
	});

	await step(
		'spam is kept and marked, and answered like a success; IP Guard refuses a blacklisted visitor',
		async () => {
			const form = await formOf(formId);
			const id = (label) => form.fields.find((f) => f.label === label).id;
			const valid = {
				_form: formId,
				_page: '/',
				[id('Name')]: 'Bot',
				[id('Email')]: 'bot@example.com',
				[id('I agree to be contacted')]: 'yes',
			};
			const token = await tokenFromPage();
			await new Promise((r) => setTimeout(r, 3100)); // the token must be at least 3 s old
			const answer = { ok: true, message: 'Thanks, we’ll be in touch.', redirect: '' };
			const headers = { 'X-Forwarded-For': '203.0.113.150' };

			const honeypot = await submitRaw(
				{ ...valid, _token: token, ...(await proofFields()), website: 'http://spam.example' },
				{ headers },
			);
			assert.deepEqual(honeypot, { status: 200, body: answer });
			const noProof = await submitRaw({ ...valid, _token: token }, { headers });
			assert.deepEqual(noProof.body, answer);
			const proof = await solve(formId);
			const first = await submitRaw({ ...valid, _token: token, _pow: proof.token, _nonce: proof.nonce }, { headers });
			assert.deepEqual(first.body, answer);
			const replay = await submitRaw({ ...valid, _token: token, _pow: proof.token, _nonce: proof.nonce }, { headers });
			assert.deepEqual(replay.body, answer);
			const fast = await submitRaw({ ...valid, _token: await tokenFromPage(), ...(await proofFields()) }, { headers });
			assert.deepEqual(fast.body, answer);
			const p2 = await solve(formId);
			const invalid = await submitRaw(
				{ ...valid, _token: token, _pow: p2.token, _nonce: p2.nonce, [id('Email')]: 'nope' },
				{ headers: { 'X-Forwarded-For': '203.0.113.152' } },
			);
			assert.equal(invalid.status, 400);
			assert.deepEqual(Object.keys(invalid.body.errors), [id('Email')]);

			// The four spam attempts and the real one from .150 reached IP Guard's limit (5): it's flagged now.
			const flagged = await fetch(`${BASE}/_webforms/submit`, {
				method: 'POST',
				headers: {
					Origin: BASE,
					Accept: 'application/json',
					'Content-Type': 'application/x-www-form-urlencoded',
					...headers,
				},
				body: new URLSearchParams({ ...valid, _token: token, ...(await proofFields()) }),
			});
			assert.equal(flagged.status, 403, 'flagged by IP Guard after 5 attempts');
			const spam = (await submissionsOf(formId))
				.filter((s) => s.spam.length)
				.map((s) => s.spam[0])
				.sort();
			assert.deepEqual(spam, ['honeypot', 'no-proof', 'proof-reused', 'too-fast']);

			// IP Guard: a blacklisted visitor is refused with the block message; nothing is stored.
			const blacklisted = await fetch(`${BASE}/_ipguard/admin`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					Origin: BASE,
					Cookie: `auth_session=${cookie}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body: new URLSearchParams({
					action: 'add',
					list: 'blacklist',
					range: '203.0.113.151',
					reason: 'E2E webforms',
					return: '/',
				}),
			});
			assert.equal(blacklisted.status, 303);
			const count = (await submissionsOf(formId)).length;
			const p3 = await solve(formId);
			const refused = await submitRaw(
				{ ...valid, _token: token, _pow: p3.token, _nonce: p3.nonce },
				{ headers: { 'X-Forwarded-For': '203.0.113.151' } },
			);
			assert.equal(refused.status, 403);
			assert.equal(refused.body.ok, false);
			assert.equal((await submissionsOf(formId)).length, count);
		},
	);

	await step('the Submissions page: messages and spam, one submission, marking, CSV export', async () => {
		await page.goto(`${DASH}?form=${formId}&tab=submissions`);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-webforms-bulk]')),
		);
		assert.equal(
			await page.eval(() => document.querySelectorAll('[data-webforms-submission]').length),
			2,
			'two real messages',
		);
		await page.goto(`${DASH}?form=${formId}&tab=submissions&show=spam`);
		await page.waitFor(
			() => document.readyState === 'complete' && Boolean(document.querySelector('[data-webforms-bulk]')),
		);
		assert.equal(await page.eval(() => document.querySelectorAll('[data-webforms-submission]').length), 4);
		if (SHOTS) await page.screenshot(`${SHOTS}/webforms-submissions.png`);
		// Open Ada's message.
		const ada = (await submissionsOf(formId)).find((s) => s.replyTo === 'ada@example.com');
		await page.goto(`${DASH}?form=${formId}&tab=submissions&submission=${encodeURIComponent(ada.id)}`);
		await page.waitFor(() => Boolean(document.querySelector('[data-webforms-detail]')));
		assert.match(
			await page.eval(() => document.querySelector('[data-webforms-detail]').textContent),
			/Ada Lovelace[\s\S]*Support/,
		);
		// Mark it as spam, then back.
		assert.ok((await admin({ action: 'mark-spam', ids: ada.id })).has('saved'));
		assert.deepEqual((await submissionsOf(formId)).find((s) => s.id === ada.id).spam, ['marked']);
		assert.ok((await admin({ action: 'mark-ok', ids: ada.id })).has('saved'));
		assert.deepEqual((await submissionsOf(formId)).find((s) => s.id === ada.id).spam, []);
		// CSV: messages only by default; the formula is neutralised.
		const csv = await (
			await fetch(`${BASE}/_webforms/export?form=${formId}`, { headers: { Cookie: `auth_session=${cookie}` } })
		).text();
		assert.match(csv, /Submitted \(UTC\),Status,Name,Email,Topic,Message,I agree to be contacted/);
		assert.match(csv, /"'=HYPERLINK\(""http:\/\/evil\.example"",""x""\)\nSecond line"/);
		assert.equal(csv.trim().split('\r\n').length, 3, 'header + two messages');
	});

	await step('deleting a form needs its name', async () => {
		assert.equal((await admin({ action: 'delete-form', form: formId, confirm: 'wrong' })).get('error'), 'confirm-name');
		assert.ok((await formOf(formId)).id);
	});

	await step('no uncaught errors in the browser', async () => {
		assert.deepEqual(page.errors, []);
	});

	summary('Webforms suite');
} catch (error) {
	if (page && SHOTS) await page.screenshot(`${SHOTS}/webforms-failure.png`).catch(() => {});
	if (page?.errors.length) console.error('Browser errors:', page.errors);
	console.error(error);
	process.exitCode = 1;
} finally {
	if (page) await resetToDemo(page, pageId).catch((e) => console.error('Cleanup failed:', e));
	try {
		for (const row of await rows(FORM_PREFIX)) {
			if (beforeForms.has(row.id)) continue;
			const form = JSON.parse(row.data);
			// The Contact form is the site's own (created on first use); only remove this suite's forms.
			if (!form.name.startsWith('E2E quote')) continue;
			await admin({ action: 'delete-form', form: form.id, confirm: form.name });
		}
		const added = (await rows('@nascencestudio/ipguard-entry:'))
			.filter((r) => !beforeIpguard.has(r.id))
			.map((r) => JSON.parse(r.data).id);
		if (added.length) {
			const body = new URLSearchParams({ action: 'remove', return: '/' });
			for (const id of added) body.append('ids', id);
			await fetch(`${BASE}/_ipguard/admin`, {
				method: 'POST',
				redirect: 'manual',
				headers: {
					Origin: BASE,
					Cookie: `auth_session=${cookie}`,
					'Content-Type': 'application/x-www-form-urlencoded',
				},
				body,
			});
		}
		await db.execute({
			sql: "delete from StudioCMSPluginData where id like '@nascencestudio/ipguard-attempts:203.0.113.15%'",
			args: [],
		});
	} catch (cause) {
		console.error('Webforms cleanup failed:', cause);
	}
	if (restoreMail) await restoreMail().catch((e) => console.error('Turning mail off failed:', e));
	sink?.close();
	cdp.close();
	await chrome.close();
	db.close();
}
