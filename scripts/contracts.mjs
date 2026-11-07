import { readFile, readdir } from 'node:fs/promises';
import Ajv2020 from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const contracts = new URL('../docs/contracts/', import.meta.url);
const fixtures = new URL('../tests/fixtures/', import.meta.url);
const base = 'https://wasit.local/contracts/';
export const readFixture = async (name) => JSON.parse(await readFile(new URL(name, fixtures), 'utf8'));

export async function createContractValidator() {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  for (const name of await readdir(contracts)) {
    if (!name.endsWith('.schema.json')) continue;
    const schema = JSON.parse(await readFile(new URL(name, contracts), 'utf8'));
    ajv.addSchema({ ...schema, $id: base + name });
  }
  const models = JSON.parse(await readFile(new URL('agent-schemas.json', contracts), 'utf8'));
  for (const [name, entry] of Object.entries(models)) {
    if (entry?.schema) ajv.addSchema({ ...entry.schema, $id: base + name + '.model.schema.json' });
  }
  return (selector, data) => {
    const validate = ajv.getSchema(base + selector);
    if (!validate) throw new Error('Unknown contract: ' + selector);
    if (!validate(data)) throw new Error(selector + ': ' + ajv.errorsText(validate.errors, { separator: '\n' }));
    return true;
  };
}
