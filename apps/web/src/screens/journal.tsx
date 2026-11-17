import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, RefreshCw } from 'lucide-react';
import { journalInputSchema } from '@investorkit/shared';
import type { JournalEntry, JournalInput } from '@investorkit/shared';
import { Button } from '../components/ui/button';
import { FormSelect } from '../components/ui/form-select';
import { ApiRequestError, deleteJournal, listInstruments, loadJournal, saveJournal } from '../lib/api';
import { formatDate, localNow } from '../lib/format';
const fields = [
  { name: 'reason', label: 'Powód decyzji', max: 500, required: true, hint: 'Co skłoniło Cię do tej decyzji?' },
  { name: 'horizon', label: 'Horyzont inwestycji (opcjonalnie)', max: 500, required: false, hint: 'Na jaki czas planujesz inwestycję?' },
  { name: 'thesis', label: 'Teza inwestycyjna', max: 5000, required: true, hint: 'Jakie założenia stoją za decyzją?' },
  { name: 'risks', label: 'Ryzyka (opcjonalnie)', max: 3000, required: false, hint: 'Co może podważyć Twoje założenia?' },
  { name: 'reviewConditions', label: 'Warunki przeglądu decyzji (opcjonalnie)', max: 3000, required: false, hint: 'Kiedy i w jakich okolicznościach wrócisz do tej decyzji?' },
  { name: 'notes', label: 'Notatki (opcjonalnie)', max: 10000, required: false, hint: '' },
] as const;
function localDate(iso: string) {
  const date = new Date(iso);
  return new Date(date.getTime() - date.getTimezoneOffset() * 60000).toISOString().slice(0, 16);
}
export function JournalOverview({ portfolioId }: { portfolioId: string }) {
  const client = useQueryClient();
  const query = useQuery({ queryKey: ['journal', portfolioId], queryFn: () => loadJournal(portfolioId) });
  const instruments = useQuery({ queryKey: ['instruments'], queryFn: listInstruments });
  const [editing, setEditing] = useState<JournalEntry | null>(null);
  const [formVersion, setFormVersion] = useState(0);
  const [message, setMessage] = useState('');
  const [confirmDelete, setConfirmDelete] = useState<JournalEntry | null>(null);
  const editor = useRef<HTMLHeadingElement>(null);
  const refresh = () => client.invalidateQueries({ queryKey: ['journal', portfolioId] });
  const remove = useMutation({ mutationFn: (row: JournalEntry) => deleteJournal(row.id, row.revision), onSuccess: async (_, row) => {
    setConfirmDelete(null); if (editing?.id === row.id) { setEditing(null); setFormVersion(v => v + 1); }
    setMessage('Wpis usunięty.'); await refresh();
  } });
  function select(row: JournalEntry | null) { setEditing(row); setFormVersion(v => v + 1); setMessage(''); editor.current?.focus(); }
  async function reloadEditing() {
    const data = await client.fetchQuery({ queryKey: ['journal', portfolioId], queryFn: () => loadJournal(portfolioId), staleTime: 0 });
    const current = data.items.find(row => row.id === editing?.id);
    if (!current) throw new Error('Wpis został usunięty w innym oknie. Twój tekst pozostaje w formularzu.');
    select(current);
  }
  return <section id="journal" className="journal" aria-labelledby="journal-title">
    <div className="investment-heading"><div><span className="eyebrow">ZAPISZ SWÓJ TOK MYŚLENIA</span><h2 id="journal-title"><BookOpen size={22} />Dziennik decyzji</h2></div><Button variant="ghost" onClick={() => void query.refetch()} disabled={query.isFetching}><RefreshCw size={16} />Odśwież wpisy</Button></div>
    <p className="cash-help">Prywatne uzasadnienia Twoich decyzji. Zapis wpisu nie wykonuje transakcji i nie zmienia portfela.</p>
    <p role="status" className="cash-success">{message}</p>
    <div className="journal-grid"><section className="panel journal-editor" aria-labelledby="journal-editor-title">
      <h3 id="journal-editor-title" ref={editor} tabIndex={-1}>{editing ? 'Edytuj wpis' : 'Nowy wpis'}</h3>
      <JournalEditor key={formVersion} portfolioId={portfolioId} entry={editing} instruments={instruments.data ?? []} instrumentError={instruments.error?.message} loadingInstruments={instruments.isPending} onReload={reloadEditing} onCancel={() => select(null)} onSaved={async () => {
        setMessage(editing ? 'Zmiany zapisane.' : 'Wpis zapisany.'); setEditing(null); setFormVersion(v => v + 1); await refresh();
      }} />
    </section><section className="panel journal-history" aria-labelledby="journal-history-title"><h3 id="journal-history-title">Twoje wpisy</h3>
      {query.isPending ? <p role="status">Pobieranie dziennika…</p> : query.isError ? <p role="alert" className="error">{query.error.message} <Button variant="ghost" onClick={() => void query.refetch()}>Spróbuj ponownie</Button></p> : query.data.items.length === 0 ? <p className="cash-help">Nie masz jeszcze wpisów. Zapisz powód swojej pierwszej decyzji.</p> : <>
        <p className="cash-help">{query.data.items.length} ze 100 wpisów · od najnowszej decyzji</p>
        <ul className="journal-list">{query.data.items.map(row => <li key={row.id}><article aria-label={row.reason}>
          <p className="cash-help">{formatDate(row.decidedAt)} · {row.instrumentId ? instruments.data?.find(item => item.id === row.instrumentId)?.symbol ?? 'Instrument' : 'Cały portfel'}</p><h4>{row.reason}</h4>
          <p className="journal-text">{row.thesis}</p>
          <details><summary>Pełny wpis</summary><dl>{fields.filter(field => !['reason', 'thesis'].includes(field.name)).map(field => row[field.name] && <div key={field.name}><dt>{field.label.replace(' (opcjonalnie)', '')}</dt><dd className="journal-text">{row[field.name]}</dd></div>)}</dl><p className="cash-help">Zapisano {formatDate(row.createdAt)} · zmieniono {formatDate(row.updatedAt)}</p></details>
          <div className="journal-actions"><Button variant="outline" onClick={() => select(row)}>Edytuj wpis</Button><Button variant="ghost" onClick={() => { remove.reset(); setConfirmDelete(row); }}>Usuń wpis</Button></div>
          {confirmDelete?.id === row.id && <div className="journal-delete" role="group" aria-label="Potwierdzenie usunięcia"><p>Usunąć ten wpis? Tej operacji nie można cofnąć.</p><div className="journal-actions"><Button variant="outline" disabled={remove.isPending} onClick={() => remove.mutate(confirmDelete)}>Tak, usuń wpis</Button><Button variant="ghost" disabled={remove.isPending} onClick={() => { setConfirmDelete(null); remove.reset(); }}>Zachowaj wpis</Button></div>{remove.error && <p role="alert" className="error">{remove.error.message} Odśwież listę i ponownie wybierz wpis.</p>}</div>}
        </article></li>)}</ul>
      </>}
    </section></div>
  </section>;
}
function JournalEditor({ portfolioId, entry, instruments, instrumentError, loadingInstruments, onReload, onCancel, onSaved }: {
  portfolioId: string; entry: JournalEntry | null; instruments: Awaited<ReturnType<typeof listInstruments>>; instrumentError: string | undefined; loadingInstruments: boolean;
  onReload: () => Promise<void>; onCancel: () => void; onSaved: () => Promise<void>;
}) {
  const [instrumentId, setInstrumentId] = useState(entry?.instrumentId ?? 'portfolio');
  const [error, setError] = useState(''); const [reloadPending, setReloadPending] = useState(false);
  const save = useMutation({ mutationFn: (input: JournalInput) => saveJournal(portfolioId, input, entry ?? undefined), onSuccess: onSaved });
  const conflict = save.error instanceof ApiRequestError && save.error.code === 'REVISION_CONFLICT';
  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); save.reset();
    const data = new FormData(event.currentTarget);
    try {
      const parsed = journalInputSchema.safeParse({ instrumentId: instrumentId === 'portfolio' ? null : instrumentId, decidedAt: new Date(String(data.get('decidedAt'))).toISOString(), ...Object.fromEntries(fields.map(field => [field.name, String(data.get(field.name) ?? '')])) });
      if (!parsed.success) { setError('Uzupełnij powód i tezę. Sprawdź datę i długości pól.'); return; }
      save.mutate(parsed.data);
    } catch { setError('Podaj poprawną datę decyzji.'); }
  }
  return <form onSubmit={submit} aria-busy={save.isPending}><fieldset disabled={save.isPending || reloadPending}>
    {instrumentError && <p role="alert" className="error">Nie udało się pobrać instrumentów: {instrumentError}</p>}
    <FormSelect label="Decyzja dotyczy" value={instrumentId} onValueChange={setInstrumentId} disabled={loadingInstruments} options={[{ value: 'portfolio', label: 'Cały portfel' }, ...instruments.map(row => ({ value: row.id, label: `${row.symbol} · ${row.name}` })), ...(entry?.instrumentId && !instruments.some(row => row.id === entry.instrumentId) ? [{ value: entry.instrumentId, label: 'Instrument przypisany do wpisu' }] : [])]} />
    <label>Data i godzina decyzji<input name="decidedAt" type="datetime-local" required defaultValue={entry ? localDate(entry.decidedAt) : localNow()} aria-describedby="journal-error" /></label>
    {fields.map(field => <div className="journal-field" key={field.name}><label htmlFor={`journal-${field.name}`}>{field.label}</label><textarea id={`journal-${field.name}`} name={field.name} rows={field.name === 'horizon' ? 2 : 3} required={field.required} maxLength={field.max} defaultValue={entry?.[field.name] ?? ''} placeholder={field.hint} aria-describedby={`journal-error journal-${field.name}-limit`} /><small id={`journal-${field.name}-limit`}>Do {field.max.toLocaleString('pl-PL')} znaków</small></div>)}
    <p id="journal-error" className="error" role="alert">{error || save.error?.message}</p>
    {conflict && <div className="journal-conflict"><p role="status">Twój tekst pozostaje w formularzu. Możesz go skopiować przed wczytaniem zmian z drugiego okna.</p><Button type="button" variant="outline" onClick={() => { setReloadPending(true); void onReload().catch(cause => setError(cause instanceof Error ? cause.message : 'Nie udało się wczytać wpisu.')).finally(() => setReloadPending(false)); }}>Wczytaj aktualną wersję (zastąpi formularz)</Button></div>}
    <div className="journal-actions"><Button type="submit" disabled={save.isPending}>{save.isPending ? 'Zapisywanie…' : entry ? 'Zapisz zmiany' : 'Zapisz wpis'}</Button>{entry && <Button type="button" variant="ghost" onClick={onCancel}>Anuluj edycję</Button>}</div>
  </fieldset></form>;
}
