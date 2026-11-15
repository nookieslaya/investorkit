/** Contracts only. No provider calls or costs in foundation. */
export type ReportVisibility = 'PRIVATE' | 'PUBLIC';
export interface Citation { page: number; quote: string }
export interface ReportFact { id: string; claim: string; citations: Citation[] }
export interface ReportInterpretation { text: string; basedOnFactIds: string[]; uncertainties: string[] }
export interface ReportAnalysis {
  facts: ReportFact[];
  interpretations: ReportInterpretation[];
  costUsd: string | null;
  costStatus: 'CALCULATED' | 'UNKNOWN';
}
