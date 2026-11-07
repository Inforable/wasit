import { resolve } from 'node:path';
import { createAppHandler } from '../server/http.mjs';

// The initial deployment serves health and rejects unimplemented APIs.
// Persistent business routes must use an external store, never a local SQLite file.
export default createAppHandler({ distDir: resolve(process.cwd(), 'dist') });
