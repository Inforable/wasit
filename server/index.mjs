import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { openDb } from './db.mjs';
import { createAppServer } from './http.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const db = openDb(resolve(root, process.env.WASIT_DB ?? 'data/wasit.sqlite'));
const server = createAppServer({ distDir: resolve(root, 'dist') });
let stopping = false;
function stop() {
  if (stopping) return;
  stopping = true;
  server.close(() => { db.close(); });
}
server.on('error', (error) => {
  console.error(error.message);
  db.close();
  process.exitCode = 1;
});
server.listen(Number(process.env.PORT ?? 3301), process.env.HOST ?? '127.0.0.1', () => {
  console.log(`Wasit is available at http://${process.env.HOST ?? '127.0.0.1'}:${server.address().port}`);
});
process.once('SIGINT', stop);
process.once('SIGTERM', stop);
