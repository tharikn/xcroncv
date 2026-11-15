import { Injectable } from '@angular/core';
import { environment } from '../../environments/environment';
import { safeGet, safeRemove, safeSet } from './safe-storage';
import { isValidApiUrl } from './url';

const KEY = 'xcroncv.apiBase';

@Injectable({ providedIn: 'root' })
export class SettingsService {
  get apiBase(): string { return safeGet('local', KEY) || environment.apiBase; }

  setApiBase(url: string) {
    const v = url.trim().replace(/\/+$/, '');
    if (v) safeSet('local', KEY, v); else safeRemove('local', KEY);
  }

  static isValidUrl(url: string): boolean { return isValidApiUrl(url); }
}
