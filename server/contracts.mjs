import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';
import { HttpError } from './errors.mjs';

export async function createValidator() {
  const root = new URL('../docs/contracts/', import.meta.url);
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of await readdir(root)) {
    if (!name.endsWith('.schema.json')) continue;
    const schema = JSON.parse(await readFile(new URL(name, root), 'utf8'));
    ajv.addSchema({ ...schema, $id: 'https://wasit.local/contracts/' + name });
  }
  return (selector, data) => {
    const check = ajv.getSchema('https://wasit.local/contracts/' + selector);
    if (!check) throw new Error('Unknown local contract: ' + selector);
    if (!check(data)) throw new HttpError(400, 'invalid_payload', 'Check the request fields and try again.');
    return data;
  };
}
