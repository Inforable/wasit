import { readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';
import { buildReferenceBook } from '../server/reference-prices.mjs';

export async function buildPriceBookFile(inputPath, outputPath) {
  if (typeof inputPath !== 'string' || !inputPath || typeof outputPath !== 'string' || !outputPath) throw new TypeError('Provide input and output JSON paths.');
  const input = resolve(inputPath), output = resolve(outputPath);
  if (input === output) throw new Error('The output must be a new file, separate from the survey snapshot.');
  const survey = JSON.parse(await readFile(input, 'utf8'));
  const book = buildReferenceBook(survey);
  await writeFile(output, JSON.stringify(book, null, 2) + '\n', { encoding: 'utf8', flag: 'wx' });
  return book;
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  const args = process.argv.slice(2);
  if (args.length !== 2) {
    process.stderr.write('Usage: node scripts/build-price-book.mjs <survey.json> <new-output.json>\n');
    process.exitCode = 1;
  } else {
    try {
      const book = await buildPriceBookFile(args[0], args[1]);
      process.stdout.write('Built advisory reference book: ' + book.quality.accepted_count + ' collected observations, ' + book.groups.length + ' comparable groups (' + book.status + ').\n');
    } catch (error) {
      process.stderr.write('Reference book build failed: ' + error.message + '\n');
      process.exitCode = 1;
    }
  }
}
