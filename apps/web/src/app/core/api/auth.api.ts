import { HttpClient } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { Observable } from 'rxjs';
import {
  AuthResponse,
  Credentials,
  User,
} from '../models/auth.models';
import { API_BASE } from './api-base';

@Injectable({ providedIn: 'root' })
export class AuthApi {
  private readonly http = inject(HttpClient);

  login(creds: Credentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE}/auth/login`, creds);
  }
  register(creds: Credentials): Observable<AuthResponse> {
    return this.http.post<AuthResponse>(`${API_BASE}/auth/register`, creds);
  }
  me(): Observable<User> {
    return this.http.get<User>(`${API_BASE}/auth/me`);
  }
}
