import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import { RetentionPolicy, Role, User } from '../models/auth.models';
import { API_BASE } from './api-base';

export const AdminKeys = {
  users: ['users'] as const,
  retention: ['retention'] as const,
};

@Injectable({ providedIn: 'root' })
export class AdminApi {
  private readonly http = inject(HttpClient);

  listUsers(): Observable<User[]> {
    return this.http.get<User[]>(`${API_BASE}/users`);
  }
  changeRole(id: string, role: Role): Observable<User> {
    return this.http.patch<User>(`${API_BASE}/users/${id}/role`, { role });
  }
  setDisabled(id: string, disabled: boolean): Observable<User> {
    return this.http.patch<User>(`${API_BASE}/users/${id}/disable`, {
      disabled,
    });
  }

  getRetention(): Observable<RetentionPolicy> {
    return this.http.get<RetentionPolicy>(`${API_BASE}/retention`);
  }
  updateRetention(auditRetentionDays: number | null): Observable<RetentionPolicy> {
    return this.http.put<RetentionPolicy>(`${API_BASE}/retention`, {
      auditRetentionDays,
    });
  }
  runArchival(before?: string): Observable<{ archived: number; checkpointHash: string | null }> {
    return this.http.post<{ archived: number; checkpointHash: string | null }>(
      `${API_BASE}/retention/archive`,
      {},
      { params: before ? { before } : {} },
    );
  }
}
