import { useEffect, useRef, useState } from 'react';
import { XLSX_LIMITS } from '@investorkit/shared';
import type { XtbPreview, XtbPreviewInput } from '@investorkit/shared';
import { FileUp } from 'lucide-react';
import { previewXtbFile } from '../lib/api';
import { fileBase64 } from '../lib/file-base64';
import { formatDate } from '../lib/format';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';

const PAGE_SIZE = 50;
const sheetLabel = { 'Cash Operations': 'Operacje gotówkowe', 'Closed Positions': 'Zamknięte partie', 'Open Positions': 'Otwarte partie' };
const kindLabel: Record<string, string> = { Deposit: 'Wpłata', Withdrawal: 'Wypłata', 'Stock purchase': 'Zakup akcji', 'Stock sell': 'Sprzedaż akcji' };
export function XtbImport({ portfolioId }: { portfolioId: string }) {
  const [upload, setUpload] = useState<{ fileName: string; contentBase64: string } | null>(null);
  const [currency, setCurrency] = useState<XtbPreviewInput['accountCurrency']>('PLN');
  const [confirmed, setConfirmed] = useState(false);
  const [result, setResult] = useState<XtbPreview | null>(null), [error, setError] = useState('');
  const [pending, setPending] = useState(false), [page, setPage] = useState(1);
  const [sheetName, setSheetName] = useState<XtbPreview['sheets'][number]['name']>('Cash Operations');
  const input = useRef<HTMLInputElement>(null), revision = useRef(0), request = useRef<AbortController | null>(null);
  useEffect(() => () => { revision.current++; request.current?.abort(); }, []);
  function invalidate() { revision.current++; request.current?.abort(); setResult(null); setError(''); setPending(false); setPage(1); }
  async function choose(file: File | undefined) {
    invalidate(); setUpload(null); setConfirmed(false);
    if (!file) return;
    if (!/\.xlsx$/i.test(file.name) || !file.size || file.size > XLSX_LIMITS.bytes) { setError('Wybierz niepusty plik .xlsx o wielkości do 5 MiB.'); return; }
    const current = revision.current;
    try { const bytes = new Uint8Array(await file.arrayBuffer()); if (current === revision.current) setUpload({ fileName: file.name, contentBase64: fileBase64(bytes) }); }
    catch { if (current === revision.current) setError('Nie udało się odczytać pliku. Wybierz go ponownie.'); }
  }
  async function preview() {
    if (!upload || !confirmed) return;
    invalidate(); const current = revision.current, controller = new AbortController(); request.current = controller; setPending(true);
    try {
      const data = await previewXtbFile(portfolioId, { ...upload, accountCurrency: currency, confirmCashTimesUtc: true }, controller.signal);
      if (current !== revision.current) return;
      setResult(data); setSheetName('Cash Operations');
    } catch (cause) { if (current === revision.current) setError(cause instanceof Error ? cause.message : 'Nie udało się sprawdzić pliku.'); }
    finally { if (current === revision.current) setPending(false); }
  }
  const sheet = result?.sheets.find(item => item.name === sheetName);
  const rows = sheet?.rows.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE) ?? [];
  const pages = Math.max(1, Math.ceil((sheet?.rows.length ?? 0) / PAGE_SIZE));
  return <section className="csv-import xtb-import" aria-labelledby="xtb-title">
    <div className="investment-heading"><div><span className="eyebrow">SPRAWDŹ RAPORT XTB</span><h2 id="xtb-title"><FileUp size={22} />Podgląd XTB XLSX</h2></div></div>
    <p className="cash-help"><strong>Podgląd nie zapisuje transakcji i nie zmienia portfela.</strong> Obsługujemy jeden udokumentowany układ angielski z trzema arkuszami. Inne wersje raportu wymagają osobnej weryfikacji.</p>
    <section className="panel csv-settings" aria-label="Plik i ustawienia XTB"><h3>Wybierz raport</h3>
      <form onSubmit={event => { event.preventDefault(); void preview(); }}>
        <label>Plik XLSX<input ref={input} type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={event => void choose(event.target.files?.[0])} /></label>
        <p className="cash-help">Do 5 MiB. Wymagane arkusze: Closed Positions, Cash Operations, Open Positions. <a href="/examples/xtb-demo.xlsx" download>Pobierz fikcyjny przykład XTB XLSX</a>. To przykład struktury, nie eksport rzeczywistego konta.</p>
        <FormSelect label="Waluta rachunku z raportu" value={currency} onValueChange={value => { invalidate(); setConfirmed(false); setCurrency(value as XtbPreviewInput['accountCurrency']); }} options={['PLN','EUR','USD'].map(value => ({value,label:value}))} />
        <label className="xtb-confirm"><input type="checkbox" checked={confirmed} onChange={event => { invalidate(); setConfirmed(event.target.checked); }} />Potwierdzam walutę rachunku {currency} i daty operacji gotówkowych w UTC.</label>
        <p className="cash-help">Nie odgadujemy waluty ani strefy z nazwy pliku. Jeśli daty „Time” są w innej strefie lub jej nie znasz, nie potwierdzaj. Ten wariant nie obsługuje ich przeliczania.</p>
        <div className="csv-actions"><Button disabled={!upload || !confirmed || pending} type="submit">{pending ? 'Odczytuję XLSX…' : 'Odczytaj raport XTB'}</Button>
          <Button type="button" variant="outline" onClick={() => { invalidate(); setUpload(null); setConfirmed(false); if (input.current) input.current.value = ''; }}>Wyczyść podgląd</Button></div>
        {error && <p role="alert" className="form-error">{error}</p>}
      </form>
    </section>
    {result && <section className="panel csv-result" aria-labelledby="xtb-result-title">
      <h3 id="xtb-result-title">Podgląd: {result.fileName}</h3>
      <p role="status" className="csv-summary">Odczytano {result.counts.cashOperations} operacji gotówkowych, {result.counts.openLots} otwarte partie i {result.counts.closedLots} zamknięte partie. Wiersze z uwagami: {result.counts.rowsWithIssues}.</p>
      <div className="xtb-warnings">{result.warnings.map(warning => <p key={warning} className="cash-help">{warning}</p>)}</div>
      <p className="cash-help">Wiersze grupujące i podsumowania są oznaczone osobno. Pozycji i przepływów z różnych arkuszy nie sumujemy jako osobnych transakcji.</p>
      <FormSelect label="Arkusz raportu" value={sheetName} onValueChange={value => { setSheetName(value as typeof sheetName); setPage(1); }} options={result.sheets.map(item => ({value:item.name,label:`${sheetLabel[item.name]} (${item.rows.length} wierszy)`}))} />
      {sheet && <div className="csv-table-scroll" role="region" aria-label={`Tabela: ${sheetLabel[sheet.name]}`} tabIndex={0}>
        <table><caption>Dane źródłowe · {sheet.name} · daty UTC. Kwoty i ceny bez zmiany precyzji.</caption><thead><tr><th scope="col">Wiersz</th><th scope="col">Rodzaj i uwagi</th>{sheet.columns.map(label => <th key={label} scope="col">{label}</th>)}</tr></thead>
          <tbody>{rows.map(row => <tr key={row.rowNumber}><th scope="row">{row.rowNumber}</th><td><div className="csv-row-status">
            {row.role === 'group' ? 'Grupa — nie dodatkowa pozycja' : row.role === 'summary' ? 'Podsumowanie — nie transakcja' : 'Rekord źródłowy — bez zapisu'}
            {row.issues.length > 0 && <ul>{row.issues.map(issue => <li key={issue}>{issue}</li>)}</ul>}
          </div></td>{row.cells.map((value, i) => <td key={i}><div className="csv-cell">{row.dates[String(i)] ? row.dates[String(i)]!.replace('T', ' ').replace('.000Z', ' UTC') : sheet.columns[i] === 'Type' ? ((kindLabel[value] ?? value) || '—') : value || '—'}</div></td>)}</tr>)}</tbody>
        </table>
      </div>}
      <div className="csv-pagination"><Button variant="outline" disabled={page <= 1} onClick={() => setPage(value => value - 1)}>Poprzednia strona</Button><span>Strona {page} z {pages}</span><Button variant="outline" disabled={page >= pages} onClick={() => setPage(value => value + 1)}>Następna strona</Button></div>
      <details className="csv-provenance"><summary>Źródło i szczegóły odczytu</summary><dl>
        <dt>Konto z raportu</dt><dd>{result.accountId} · waluta potwierdzona: {result.accountCurrency}</dd>
        <dt>Okres raportu (UTC)</dt><dd>{result.from} → {result.to}</dd>
        <dt>SHA-256 oryginalnego pliku</dt><dd>{result.fileSha256}</dd>
        <dt>Adapter i czas odczytu</dt><dd>{result.adapterId} / {result.adapterVersion} · {formatDate(result.checkedAt)}</dd>
        <dt>Ograniczenia</dt><dd>To odczyt struktury i diagnostyka, bez zatwierdzania importu, wyceny, deduplikacji między plikami lub automatycznego dodawania instrumentów. Plik i wynik tylko w pamięci widoku, bez retencji na serwerze.</dd>
      </dl></details>
    </section>}
  </section>;
}
