import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from './schema';

type Database = ReturnType<typeof connect>;

function connect() {
	const connectionString = process.env.DATABASE_URL;
	if (!connectionString) throw new Error('DATABASE_URL is not set');

	return drizzle(postgres(connectionString), { schema });
}

let instance: Database | undefined;

// Importing this module has to stay side-effect free: SvelteKit's postbuild
// analyse pass imports every server module, so connecting (or throwing on a
// missing DATABASE_URL) at the top level fails `vite build`. The proxy defers
// both until the first query, keeping `db.select(...)` call sites unchanged.
export const db: Database = new Proxy({} as Database, {
	get(_target, prop) {
		instance ??= connect();
		const value = Reflect.get(instance, prop);
		return typeof value === 'function' ? value.bind(instance) : value;
	}
});
