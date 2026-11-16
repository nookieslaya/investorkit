import { useRef, useState } from 'react';
import type { FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ArrowDownLeft, ArrowUpRight, Wallet, History } from 'lucide-react';
import { cashOperationInputSchema } from '@investorkit/shared';
import type { Currency } from '@investorkit/shared';
import { FormSelect } from '../components/ui/form-select';
import { Button } from '../components/ui/button';
import { loadCash, loadCashHistory, saveCash } from '../lib/api';

import { formatAmount, localNow } from '../lib/format';
export function CashOverview({ portfolioId }: { portfolioId: string }) {
  const client = useQueryClient();
  const cash = useQuery({ queryKey: ['cash', portfolioId], queryFn: () => loadCash(portfolioId) });
  const history = useQuery({ queryKey: ['cash-history', portfolioId], queryFn: () => loadCashHistory(portfolioId) });
  const [kind, setKind] = useState<'DEPOSIT' | 'WITHDRAWAL'>('DEPOSIT');
  const [currency, setCurrency] = useState<Currency>('PLN');
  const [amount, setAmount] = useState(''); const [rate, setRate] = useState('');
  const [occurredAt, setOccurredAt] = useState(localNow); const [fxDate, setFxDate] = useState(localNow);
  const [note, setNote] = useState(''); const [error, setError] = useState(''); const [success, setSuccess] = useState('');
  // Keep the same key+body after a network failure. Generate a new key only for changed data/success.
  const pending = useRef<{ body: string; key: string } | null>(null);
  const save = useMutation({ mutationFn: saveCash, onSuccess: async () => {
    pending.current = null; setAmount(''); setNote(''); setSuccess('Operacja zapisana. Saldo zostało zaktualizowane.');
    await Promise.all([client.invalidateQueries({ queryKey: ['cash', portfolioId] }), client.invalidateQueries({ queryKey: ['cash-history', portfolioId] }), client.invalidateQueries({ queryKey: ['valuation', portfolioId] }), client.invalidateQueries({ queryKey: ['risk', portfolioId] }), client.invalidateQueries({ queryKey: ['operations', portfolioId] })]);
  } });
  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault(); setError(''); setSuccess('');
    try {
      const time = new Date(occurredAt).toISOString();
      const parsed = cashOperationInputSchema.safeParse({ kind, currency, amount: amount.trim().replace(',', '.'),
        fxToBase: currency === 'PLN' ? '1' : rate.trim().replace(',', '.'),
        occurredAt: time, fxAsOf: currency === 'PLN' ? time : new Date(fxDate).toISOString(), fxSource: 'manual', note });
      if (!parsed.success) { setError('Sprawdź kwotę, kurs i daty. Kwota: do 10 miejsc po przecinku; kurs: do 12.'); return; }
      const body = JSON.stringify(parsed.data);
      if (pending.current?.body !== body) pending.current = { body, key: crypto.randomUUID() };
      await save.mutateAsync({ portfolioId, operation: parsed.data, key: pending.current.key });
    } catch (cause) { setError(cause instanceof Error ? cause.message : 'Nie udało się zapisać operacji.'); }
  }
  return <>
    <section className="metrics" aria-label="Gotówka i wpłaty netto">
      {(['PLN', 'EUR', 'USD'] as const).map(code => <article className="panel metric cash-metric" key={code}>
        <span>Gotówka {code}<Wallet size={15} /></span><strong>{cash.data ? formatAmount(cash.data.balances.find(b => b.currency === code)?.amount ?? '0') : '—'}</strong><small>{code} · środki na subkoncie</small>
      </article>)}
      <article className="panel metric cash-metric"><span>Wpłaty netto<ArrowDownLeft size={15} /></span><strong>{cash.data ? formatAmount(cash.data.netContributionsBase) : '—'}</strong><small>PLN · według historycznych kursów wpłat/wypłat</small></article>
    </section>
    {cash.isPending && <p role="status">Pobieranie sald…</p>}
    {cash.isError && <p role="alert" className="error">{cash.error.message} <button onClick={() => void cash.refetch()}>Ponów pobieranie</button></p>}
    <div className="cash-grid" id="cash-operations">
      <section className="panel cash-form" aria-labelledby="cash-title"><span className="eyebrow">ZASILAJ I PORZĄDKUJ</span><h2 id="cash-title">Dodaj operację gotówkową</h2><p>Każda waluta ma osobne saldo. Wpłata zapisuje środki w wybranej walucie.</p>
        <form onSubmit={event => void submit(event)} aria-busy={save.isPending}><fieldset disabled={save.isPending}>
          <div className="cash-fields"><FormSelect label="Rodzaj operacji" value={kind} onValueChange={value => setKind(value as 'DEPOSIT' | 'WITHDRAWAL')} options={[{ value: 'DEPOSIT', label: 'Wpłata' }, { value: 'WITHDRAWAL', label: 'Wypłata' }]} />
          <FormSelect label="Waluta" value={currency} onValueChange={value => setCurrency(value as Currency)} options={['PLN', 'EUR', 'USD'].map(value => ({ value, label: value }))} /></div>
          <label>Kwota<input inputMode="decimal" value={amount} onChange={e => setAmount(e.target.value)} placeholder="np. 1 000 → wpisz 1000" required maxLength={30} aria-describedby="cash-error" /></label>
          <label>Data i godzina operacji<input type="datetime-local" value={occurredAt} onChange={e => setOccurredAt(e.target.value)} required /></label>
          {currency !== 'PLN' && <><label>Kurs historyczny (PLN za 1 {currency})<input inputMode="decimal" value={rate} onChange={e => setRate(e.target.value)} placeholder="np. 4,20" required maxLength={29} /></label><label>Data i godzina kursu<input type="datetime-local" value={fxDate} onChange={e => setFxDate(e.target.value)} required /></label><p className="cash-help">Wpisz kurs z dnia operacji lub wcześniejszy. Źródło: wpis ręczny. Kurs nie wymienia gotówki między subkontami.</p></>}
          <label>Notatka (opcjonalnie)<input value={note} onChange={e => setNote(e.target.value)} maxLength={300} placeholder="np. zasilenie rachunku" /></label>
          <p id="cash-error" className="error" role="alert">{error}</p><p className="cash-success" role="status">{success}</p>
          <Button type="submit" disabled={save.isPending}>{kind === 'DEPOSIT' ? <ArrowDownLeft size={17} /> : <ArrowUpRight size={17} />}{save.isPending ? 'Zapisywanie…' : kind === 'DEPOSIT' ? 'Zapisz wpłatę' : 'Zapisz wypłatę'}</Button>
        </fieldset></form>
      </section>
      <section className="panel cash-history" aria-labelledby="history-title"><div className="cash-section-heading"><div><span className="eyebrow">TWOJE PRZEPŁYWY</span><h2 id="history-title">Historia gotówki</h2></div><History size={22} /></div>
        {history.isPending ? <p role="status">Pobieranie historii…</p> : history.isError ? <p role="alert" className="error">{history.error.message} <button onClick={() => void history.refetch()}>Spróbuj ponownie</button></p> : history.data.items.length === 0 ? <div className="cash-empty"><Wallet size={35} /><h3>Zacznij od pierwszej wpłaty</h3><p>Zapisane operacje pojawią się tutaj. Salda wynikają z Twojej historii.</p></div> : <ul className="cash-list" tabIndex={0} aria-label="Operacje gotówkowe — przewijana historia">{history.data.items.map(item => <li key={item.id}>
          <span className={`cash-direction ${item.kind === 'DEPOSIT' ? 'deposit' : ''}`}>{item.kind === 'DEPOSIT' ? <ArrowDownLeft size={19} /> : <ArrowUpRight size={19} />}</span>
          <div><strong>{item.kind === 'DEPOSIT' ? 'Wpłata' : 'Wypłata'} {item.currency}</strong><small>{new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(item.occurredAt))}</small>{item.note && <p>{item.note}</p>}<small>Kurs: {formatAmount(item.fxToBase)} PLN · wpis ręczny</small>{item.currency !== 'PLN' && <small>Kurs z {new Intl.DateTimeFormat('pl-PL', { dateStyle: 'medium', timeStyle: 'short', timeZone: 'Europe/Warsaw' }).format(new Date(item.fxAsOf))}</small>}</div>
          <strong className="cash-row-amount">{item.kind === 'DEPOSIT' ? '+' : '−'}{formatAmount(item.amount)} <small>{item.currency}</small></strong>
        </li>)}</ul>}
        <div className="cash-help cash-disclosure">Wpłaty netto pokazują przepływy według kursów historycznych. Wartość inwestycji i wynik całego portfela znajdziesz w sekcji Inwestycje.</div>
      </section>
    </div>
  </>;
}
