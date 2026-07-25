import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  ApiKey,
  IngestFileResult,
  IngestSource,
  Match,
  MintedApiKey,
  NeedsMappingRecord,
  ReconciliationRun,
  ReconciliationRunSummary,
} from '../models/reconciliation.models';
import { API_BASE } from './api-base';

export interface RunReconciliationInput {
  sourceA: string;
  sourceB: string;
  windowFrom: string;
  windowTo: string;
}

@Injectable({ providedIn: 'root' })
export class ReconciliationApi {
  private readonly http = inject(HttpClient);

  // Sources & mapping
  listSources(): Observable<IngestSource[]> {
    return this.http.get<IngestSource[]>(`${API_BASE}/sources`);
  }
  createSource(name: string, kind: 'ledger' | 'counterparty'): Observable<IngestSource> {
    return this.http.post<IngestSource>(`${API_BASE}/sources`, { name, kind });
  }
  setMapping(id: string, mapping: unknown): Observable<IngestSource> {
    return this.http.post<IngestSource>(`${API_BASE}/sources/${id}/mapping`, {
      mapping,
    });
  }

  // Counterparty file upload
  uploadFile(sourceName: string, file: File): Observable<IngestFileResult> {
    const form = new FormData();
    form.append('file', file);
    form.append('sourceName', sourceName);
    return this.http.post<IngestFileResult>(`${API_BASE}/ingest/files`, form);
  }
  getFile(id: string): Observable<IngestFileResult> {
    return this.http.get<IngestFileResult>(`${API_BASE}/ingest/files/${id}`);
  }

  // Records the ingest could not map to an account (never dropped, never posted)
  listNeedsMapping(): Observable<NeedsMappingRecord[]> {
    return this.http.get<NeedsMappingRecord[]>(`${API_BASE}/ingest/needs-mapping`);
  }

  // API keys
  listApiKeys(): Observable<ApiKey[]> {
    return this.http.get<ApiKey[]>(`${API_BASE}/api-keys`);
  }
  mintKey(label: string): Observable<MintedApiKey> {
    return this.http.post<MintedApiKey>(`${API_BASE}/api-keys`, { label });
  }
  revokeKey(id: string): Observable<ApiKey> {
    return this.http.delete<ApiKey>(`${API_BASE}/api-keys/${id}`);
  }

  // Reconciliation
  runReconciliation(input: RunReconciliationInput): Observable<ReconciliationRun> {
    return this.http.post<ReconciliationRun>(
      `${API_BASE}/reconciliation/runs`,
      input,
    );
  }
  getRun(runId: string): Observable<ReconciliationRun> {
    return this.http.get<ReconciliationRun>(
      `${API_BASE}/reconciliation/${runId}`,
    );
  }
  listRuns(): Observable<ReconciliationRunSummary[]> {
    return this.http.get<ReconciliationRunSummary[]>(
      `${API_BASE}/reconciliation/runs`,
    );
  }
  confirmMatch(id: string): Observable<Match> {
    return this.http.post<Match>(`${API_BASE}/matches/${id}/confirm`, {});
  }
}
