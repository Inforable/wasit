import { createContractValidator, readFixture } from './contracts.mjs';
const validate = await createContractValidator();
for (const { file, schema } of await readFixture('manifest.json')) {
  validate(schema, await readFixture(file));
  console.log('PASS ' + file + ' → ' + schema);
}
