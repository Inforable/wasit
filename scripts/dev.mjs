import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const children = [];
let stopping = false;
function stop(code = 0) {
  if (stopping) return;
  stopping = true;
  process.exitCode = code;
  for (const child of children) if (child.exitCode === null) child.kill();
}
for (const args of [
  ['--disable-warning=ExperimentalWarning', '--env-file-if-exists=.env', 'server/index.mjs'],
  ['node_modules/vite/bin/vite.js'],
]) {
  const child = spawn(process.execPath, args, { cwd: root, stdio: 'inherit', env: process.env });
  children.push(child);
  child.once('error', (error) => { console.error(error.message); stop(1); });
  child.once('exit', (code, signal) => { if (!stopping) stop(code ?? (signal ? 1 : 0)); });
}
process.once('SIGINT', () => stop());
process.once('SIGTERM', () => stop());
