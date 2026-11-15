import { Injectable } from '@angular/core';
import { Observable, shareReplay } from 'rxjs';
import { ApiService } from './api.service';
import { RenderModel } from './models';

/** Dummy-data render models for template cards and template preview (cached per template; never the user's own data). */
@Injectable({ providedIn: 'root' })
export class TemplateSampleService {
  private cache = new Map<string, Observable<RenderModel>>();
  constructor(private api: ApiService) {}

  get(templateId: string): Observable<RenderModel> {
    let o = this.cache.get(templateId);
    if (!o) { o = this.api.templateSample(templateId).pipe(shareReplay({ bufferSize: 1, refCount: false })); this.cache.set(templateId, o); }
    return o;
  }
}
