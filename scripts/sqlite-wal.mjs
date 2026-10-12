// Switch the site's SQLite database to write-ahead logging (WAL). Safe to repeat; the setting is
// stored in the database file. Run after migrations (`pnpm migrate`, the Docker entrypoint, CI).
//
// Why (Tapestry known issue #23): with SQLite's default rollback journal, any open read blocks every
// write. StudioCMS's session check can fail mid-transaction when two writes collide and keep its read
// lock; from then on every save answers 400 until the server restarts (seen in CI). In WAL mode
// readers never block writers, so a leftover read can't freeze the site.
//
// Only for local `file:` databases; a remote libSQL/Turso URL is left alone.
import { createClient } from '@libsql/client';

const url = process.env.CMS_LIBSQL_URL ?? '';
if (!url.startsWith('file:')) {
	console.log('sqlite-wal: not a local SQLite file; nothing to do.');
	process.exit(0);
}
const db = createClient({ url });
try {
	const result = await db.execute('PRAGMA journal_mode = WAL');
	const mode = String(Object.values(result.rows[0] ?? {})[0] ?? '');
	if (mode.toLowerCase() !== 'wal') throw new Error(`journal mode is "${mode}", not WAL`);
	console.log('sqlite-wal: journal mode is WAL.');
} finally {
	db.close();
}
