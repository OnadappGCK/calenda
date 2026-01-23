import { Injectable, inject } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { API_BASE_URL } from './api.config';
import { AuthUser } from './auth.service';

@Injectable({ providedIn: 'root' })
export class UsersService {
  private readonly http = inject(HttpClient);
  private readonly apiBaseUrl = inject(API_BASE_URL);

  me() {
    return this.http.get<AuthUser & { ville: string; lieu: string }>(`${this.apiBaseUrl}/users/me`);
  }

  updateMe(payload: {
    pseudo?: string;
    ville?: string;
    lieu?: string;
    password?: string;
    passwordConfirmation?: string;
  }) {
    return this.http.patch(`${this.apiBaseUrl}/users/me`, payload);
  }
}
