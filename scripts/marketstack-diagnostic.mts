import { mkdir, writeFile, chmod } from 'node:fs/promises';
import { diagnose, MarketstackDiagnostic } from './lib/marketstack-diagnostic.mjs';

try {
  // Prepare private storage before consuming quota; fresh clones do not have this directory.
  const directory = new URL('../.local-backups/', import.meta.url);
  await mkdir(directory, { recursive: true, mode: 0o700 });
  const budget = Number(process.env.MARKETSTACK_DIAGNOSTIC_BUDGET ?? '10');
  const result = await diagnose(new MarketstackDiagnostic(process.env.MARKETSTACK_API_KEY, budget));
  // Output contains only validated, selected fields. No key, URLs or raw provider errors.
  const output = new URL('../.local-backups/marketstack-diagnostic.json', import.meta.url);
  await writeFile(output, `${JSON.stringify(result, null, 2)}\n`, { mode: 0o600 });
  await chmod(output, 0o600);
  console.log(`Marketstack: ${result.used}/${result.budget} jednostek. GPW: ${result.gpwVerified ? 'potwierdzone' : 'niepotwierdzone'}. Raport lokalny: .local-backups/marketstack-diagnostic.json`);
} catch {
  console.error('Diagnostyka nieukończona: sprawdź budżet (1–10) i możliwość zapisu raportu. Sekrety oraz szczegóły sieciowe zostały pominięte.');
  process.exitCode = 1;
}
