import { HttpClient } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { SettingsService } from '../../core/settings.service';

/** Small promise-based client for feature modules (auth header is added by the app interceptor). */
@Injectable({ providedIn: 'root' })
export class FeatureApi {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private u(p: string) { return `${this.settings.apiBase}${p}`; }
  get<T>(p: string) { return firstValueFrom(this.http.get<T>(this.u(p))); }
  post<T>(p: string, body: unknown = {}) { return firstValueFrom(this.http.post<T>(this.u(p), body)); }
  patch<T>(p: string, body: unknown = {}) { return firstValueFrom(this.http.patch<T>(this.u(p), body)); }
  put<T>(p: string, body: unknown = {}) { return firstValueFrom(this.http.put<T>(this.u(p), body)); }
  del<T = void>(p: string) { return firstValueFrom(this.http.delete<T>(this.u(p))); }
  blob(p: string, body: unknown = {}) { return firstValueFrom(this.http.post(this.u(p), body, { responseType: 'blob' })); }
}
