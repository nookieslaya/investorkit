import { useState } from 'react';
import { Button } from '../components/ui/button';
import { CsvImport } from './csv-import';
import { XtbImport } from './xtb-import';

export function FileImport({ portfolioId }: { portfolioId: string }) {
  const [format, setFormat] = useState<'csv' | 'xtb'>('xtb');
  return <section id="imports" aria-label="Import pliku">
    <div className="csv-actions" role="group" aria-label="Wybierz format importu">
      <Button variant={format === 'csv' ? 'default' : 'outline'} aria-pressed={format === 'csv'} onClick={() => setFormat('csv')}>Ogólny CSV</Button>
      <Button variant={format === 'xtb' ? 'default' : 'outline'} aria-pressed={format === 'xtb'} onClick={() => setFormat('xtb')}>XTB XLSX — podgląd</Button>
    </div>
    {format === 'csv' ? <CsvImport portfolioId={portfolioId} /> : <XtbImport portfolioId={portfolioId} />}
  </section>;
}
