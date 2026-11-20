import { useEffect, useRef, useState } from 'react';
import { CSV_FIELDS, CSV_FIELD_LABELS, CSV_LIMITS } from '@investorkit/shared';
import type { CsvMapping, CsvPreview, CsvPreviewInput } from '@investorkit/shared';
import { FileUp } from 'lucide-react';
import { previewCsvFile } from '../lib/api';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
const PAGE_SIZE = 50;
function base64(bytes: Uint8Array) {
  const chunks: string[] = [];
  for (let index = 0; index < bytes.length; index += 8192) chunks.push(String.fromCharCode(...bytes.subarray(index, index + 8192)));
  return btoa(chunks.join(''));
}
export function CsvImport({ portfolioId }: { portfolioId: string }) {
  const [upload, setUpload] = useState<{ fileName: string; contentBase64: string } | null>(null);
  const [encoding, setEncoding] = useState<CsvPreviewInput['encoding']>('utf-8');
  const [delimiter, setDelimiter] = useState<CsvPreviewInput['delimiter']>(';');
  const [decimalSeparator, setDecimalSeparator] = useState<CsvPreviewInput['decimalSeparator']>(',');
  const [mapping, setMapping] = useState<CsvMapping>({});
  const [columns, setColumns] = useState<CsvPreview['columns']>([]);
  const [result, setResult] = useState<CsvPreview | null>(null);
  const [error, setError] = useState(''); const [pending, setPending] = useState(false); const [page, setPage] = useState(1);
  const input = useRef<HTMLInputElement>(null); const revision = useRef(0); const request = useRef<AbortController | null>(null);
  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);
  function invalidate(structure = false) {
    revision.current++; request.current?.abort(); setResult(null); setError(''); setPending(false); setPage(1);
    if (structure) { setColumns([]); setMapping({}); }
  }
  async function choose(file: File | undefined) {
    invalidate(true); setUpload(null);
    if (!file) return;
    if (file.size === 0 || file.size > CSV_LIMITS.bytes) { setError('Wybierz niepusty plik CSV o wielkości do 5 MiB.'); return; }
    const current = revision.current;
    try {
      const bytes = new Uint8Array(await file.arrayBuffer());
      if (current === revision.current) setUpload({ fileName: file.name, contentBase64: base64(bytes) });
    } catch { if (current === revision.current) setError('Nie udało się odczytać pliku. Wybierz go ponownie.'); }
  }
  async function preview() {
    if (!upload) return;
    invalidate(); const current = revision.current; const controller = new AbortController(); request.current = controller; setPending(true);
    try {
      const data = await previewCsvFile(portfolioId, { ...upload, adapterId: 'generic-csv', encoding, delimiter, decimalSeparator, mapping }, controller.signal);
      if (current !== revision.current) return;
      setResult(data); setColumns(data.columns);
    } catch (cause) {
      if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Nie udało się sprawdzić pliku.');
    } finally { if (current === revision.current) setPending(false); }
  }
  function matchHeaders() {
    invalidate();
    const next: CsvMapping = {};
    for (const field of CSV_FIELDS) {
      const column = columns.find(item => item.name.toLowerCase() === field.toLowerCase());
      if (column) next[field] = column.index;
    }
    setMapping(next);
  }
  const rows = result?.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];
  const displayedColumnCount = Math.max(result?.columns.length ?? 0, ...rows.map(row => row.cells.length));
  const pages = result ? Math.max(1, Math.ceil(result.rows.length / PAGE_SIZE)) : 1;
  return <section id="imports" className="csv-import" aria-labelledby="csv-title">
    <div className="investment-heading"><div><span className="eyebrow">SPRAWDŹ PLIK PRZED IMPORTEM</span><h2 id="csv-title"><FileUp size={22} />Podgląd CSV</h2></div></div>
    <p className="cash-help"><strong>Podgląd nie zapisuje transakcji i nie zmienia portfela.</strong> Format i podgląd możesz sprawdzić już teraz. Zapis oraz rozpoznawanie eksportu XTB wymagają osobnego etapu.</p>
    <section className="panel csv-settings" aria-label="Plik i ustawienia CSV"><h3>Wybierz plik</h3>
      <form onSubmit={event => { event.preventDefault(); void preview(); }}>
        <FormSelect label="Format pliku" value="generic-csv" options={[{ value: 'generic-csv', label: 'Ogólny CSV — podgląd i mapowanie' }, { value: 'xtb-verified', label: 'XTB — wymagana próbka eksportu', disabled: true }]} />
        <label>Plik CSV<input ref={input} type="file" accept=".csv,.txt,text/csv,text/plain" onChange={event => void choose(event.target.files?.[0])} /></label>
        <p className="cash-help">Do 5 MiB i 10 000 wierszy danych. Pierwszy niepusty wiersz to nagłówki. XLS/XLSX nie są obsługiwane. <a href="/examples/import-preview.csv" download>Pobierz przykładowy CSV</a> — to przykład ogólny, nie eksport XTB.</p>
        <div className="csv-options"><FormSelect label="Separator kolumn" value={delimiter} onValueChange={value => { invalidate(true); setDelimiter(value as CsvPreviewInput['delimiter']); }} options={[{ value: ';', label: 'Średnik (;)' }, { value: ',', label: 'Przecinek (,)' }, { value: '\t', label: 'Tabulator' }]} />
          <FormSelect label="Kodowanie pliku" value={encoding} onValueChange={value => { invalidate(true); setEncoding(value as CsvPreviewInput['encoding']); }} options={[{ value: 'utf-8', label: 'UTF-8' }, { value: 'windows-1250', label: 'Windows-1250' }]} />
          <FormSelect label="Separator dziesiętny" value={decimalSeparator} onValueChange={value => { invalidate(); setDecimalSeparator(value as CsvPreviewInput['decimalSeparator']); }} options={[{ value: ',', label: 'Przecinek: 123,45' }, { value: '.', label: 'Kropka: 123.45' }]} /></div>
        {columns.length > 0 && <section className="csv-mapping" aria-labelledby="csv-mapping-title"><h3 id="csv-mapping-title">Przypisz kolumny</h3>
          <p className="cash-help">Zacznij od rodzaju operacji, daty i waluty. Dla wpłat/wypłat potrzebna jest kwota; dla BUY/SELL także instrument, ilość, cena i prowizja. Symbole łączymy wyłącznie z istniejącym instrumentem o zgodnym MIC i walucie.</p>
          <Button type="button" variant="outline" onClick={matchHeaders}>Dopasuj standardowe nazwy kolumn</Button>
          <div className="csv-mapping-grid">{CSV_FIELDS.map(field => <FormSelect key={field} label={CSV_FIELD_LABELS[field]} value={mapping[field] === undefined ? 'none' : String(mapping[field])}
            onValueChange={value => { invalidate(); setMapping(current => { const next = { ...current }; if (value === 'none') delete next[field]; else next[field] = Number(value); return next; }); }}
            options={[{ value: 'none', label: 'Nieprzypisana' }, ...columns.map(column => ({ value: String(column.index), label: `${column.index + 1}. ${column.name}` }))]} />)}</div>
          <details><summary>Wymagany format wartości</summary><ul className="cash-help"><li>Rodzaj: BUY, SELL, DEPOSIT lub WITHDRAWAL. Waluta: PLN, EUR lub USD.</li><li>Daty z godziną i strefą, np. 2026-01-15T12:30:00+01:00. Nie zgadujemy strefy dla dat bez offsetu.</li><li>Kwoty bez separatorów tysięcy; ilości i kwoty do 10 miejsc, kurs FX do 12. Prowizja musi być jawna, również gdy wynosi zero.</li><li>Dla EUR/USD wymagane historyczny FX oraz jego data. Tylko PLN = 1 jest tożsamością. Waluta prowizji musi być walutą transakcji.</li></ul></details>
        </section>}
        <div className="csv-actions"><Button type="submit" disabled={!upload || pending}>{pending ? 'Sprawdzanie…' : columns.length ? 'Sprawdź mapowanie' : 'Odczytaj CSV'}</Button><Button type="button" variant="ghost" disabled={!upload && !error} onClick={() => { invalidate(true); setUpload(null); if (input.current) input.current.value = ''; }}>Wyczyść podgląd</Button></div>
      </form>
      {error && <p className="error" role="alert">{error}</p>}
      {pending && <p role="status">Odczytywanie i sprawdzanie pliku…</p>}
      {columns.length > 0 && !result && !pending && <p className="cash-help" role="status">Ustawienia lub mapowanie zmieniły się. Ponów sprawdzenie, aby zobaczyć aktualny podgląd.</p>}
    </section>
    {result && <section className="panel csv-result" aria-labelledby="csv-result-title"><h3 id="csv-result-title">Podgląd: {result.fileName}</h3>
      <div role="status" className="csv-summary"><p>Wiersze danych: <strong>{result.counts.total}</strong> · pominięte puste rekordy: {result.counts.blank}</p>{result.detection === 'needs_mapping' ? <p>Przypisz rodzaj operacji, datę i walutę, a następnie sprawdź mapowanie. Wiersze nie zostały jeszcze zweryfikowane.</p> : <p>Poprawny format: <strong>{result.counts.valid}</strong> · z błędami: <strong>{result.counts.invalid}</strong>.</p>}</div>
      <p className="cash-help">Sprawdzamy format i identyfikację instrumentów. Salda portfela i duplikaty względem historii nie są jeszcze sprawdzane. Identyczne wiersze pozostają oddzielne. Nic nie zapisano.</p>
      {result.rows.length === 0 ? <p>Plik zawiera tylko nagłówki. Brak wierszy danych do podglądu.</p> : <>
        <div className="csv-table-scroll" tabIndex={0} role="region" aria-label="Wiersze CSV, tabela przewijana poziomo"><table><caption>Surowe wartości pliku; daty i kwoty nie są zaokrąglane.</caption><thead><tr><th scope="col">Wiersz / linia</th><th scope="col">Sprawdzenie</th>{Array.from({ length: displayedColumnCount }, (_, index) => <th scope="col" key={index}>{result.columns[index]?.name ?? `Pole ${index + 1} bez nagłówka`}</th>)}</tr></thead><tbody>{rows.map(row => <tr key={row.rowNumber}>
          <th scope="row">{row.rowNumber} / {row.lineNumber}</th><td><div className="csv-row-status"><span className={row.issues.length ? 'data-issue' : row.operation ? 'data-ok' : ''}>{row.issues.length ? 'Wymaga poprawy' : row.operation ? 'Poprawny format' : 'Nie sprawdzono'}</span>
            {row.issues[0] && <p>{row.issues[0].message}</p>}
            {(row.issues.length > 0 || row.operation) && <details><summary>Szczegóły wiersza {row.rowNumber}</summary>{row.issues.length > 0 && <ul>{row.issues.map((issue, index) => <li key={index}>{issue.message}</li>)}</ul>}
              {row.operation && <dl>{Object.entries(row.operation).map(([key, value]) => <div key={key}><dt>{key in CSV_FIELD_LABELS ? CSV_FIELD_LABELS[key as keyof typeof CSV_FIELD_LABELS] : key === 'instrumentId' ? 'Identyfikator instrumentu' : 'Źródło historycznego FX'}</dt><dd>{String(value)}</dd></div>)}</dl>}{row.sourceId && <p>ID źródłowe: {row.sourceId}</p>}</details>}
          </div></td>{Array.from({ length: displayedColumnCount }, (_, index) => <td key={index}><div className="csv-cell" tabIndex={(row.cells[index]?.length ?? 0) > 180 ? 0 : undefined}>{row.cells[index] ?? '—'}</div></td>)}</tr>)}</tbody></table></div>
        <div className="csv-pagination" aria-label="Strony podglądu"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(current => current - 1)}>Poprzednia strona</Button><span>Strona {page} z {pages} · do {PAGE_SIZE} wierszy na stronie</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(current => current + 1)}>Następna strona</Button></div>
      </>}
      <details className="csv-provenance"><summary>Dane odczytu pliku</summary><dl><dt>Sprawdzono</dt><dd>{result.checkedAt}</dd><dt>SHA-256 pliku (nie jest deduplikacją transakcji)</dt><dd>{result.fileSha256}</dd><dt>Wielkość</dt><dd>{result.byteLength} bajtów</dd><dt>Parser</dt><dd>Ogólny CSV, wersja {result.adapterVersion}</dd></dl></details>
    </section>}
  </section>;
}
