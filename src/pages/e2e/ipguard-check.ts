/**
 * Dev only (404 in production builds): runs IP Guard's check for a protected action, so the `ipguard`
 * e2e suite can exercise the rate limit and flagging before a real form uses it. The suite sets the
 * visitor's address with X-Forwarded-For (the dev server trusts the loopback proxy).
 */
import { checkAction, recordAttempt } from '@nascencestudio/ipguard/guard';
import type { APIRoute } from 'astro';

export const prerender = false;

export const POST: APIRoute = async (context) => {
	if (!import.meta.env.DEV) return new Response('Not found', { status: 404 });
	if (context.url.searchParams.has('rejected')) {
		await recordAttempt(context);
		return Response.json({ recorded: true });
	}
	const result = await checkAction(context, { key: 'e2e' });
	return Response.json({ outcome: result.outcome, decision: result.decision });
};
