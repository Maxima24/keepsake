import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  Account,
  AuditLog,
  CreateTransactionInput,
  ExportDocument,
  ReconcileReport,
  Transaction,
  VerifyResult,
} from '../models/ledger.models';
import { API_BASE } from './api-base';

/** TanStack Query keys — shared so mutations can invalidate the right queries. */
export const QueryKeys = {
  accounts: ['accounts'] as const,
  transactions: ['transactions'] as const,
  audit: ['audit'] as const,
  auditVerify: ['audit', 'verify'] as const,
  auditArchive: ['audit', 'archive'] as const,
  reconcile: ['reconcile'] as const,
};

@Injectable({ providedIn: 'root' })
export class LedgerApi {
  private readonly http = inject(HttpClient);

  getAccounts(): Observable<Account[]> {
    return this.http.get<Account[]>(`${API_BASE}/accounts`);
  }
  getTransactions(): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${API_BASE}/transactions`);
  }
  getAudit(): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${API_BASE}/audit`);
  }
  getAuditVerify(): Observable<VerifyResult> {
    return this.http.get<VerifyResult>(`${API_BASE}/audit/verify`);
  }
  getAuditArchive(): Observable<AuditLog[]> {
    return this.http.get<AuditLog[]>(`${API_BASE}/audit/archive`);
  }
  getReconcile(): Observable<ReconcileReport> {
    return this.http.get<ReconcileReport>(`${API_BASE}/reconcile`);
  }
  postTransaction(input: CreateTransactionInput): Observable<Transaction> {
    return this.http.post<Transaction>(`${API_BASE}/transactions`, input);
  }

  // Point-in-time recovery & export.
  getAccountsAsOf(at: string): Observable<Account[]> {
    return this.http.get<Account[]>(`${API_BASE}/accounts/as-of`, {
      params: { at },
    });
  }
  getTransactionsAsOf(at: string): Observable<Transaction[]> {
    return this.http.get<Transaction[]>(`${API_BASE}/transactions/as-of`, {
      params: { at },
    });
  }
  getExport(at: string): Observable<ExportDocument> {
    return this.http.get<ExportDocument>(`${API_BASE}/export`, {
      params: { at },
    });
  }
}
