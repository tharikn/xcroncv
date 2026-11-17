import { HttpClient, HttpErrorResponse } from '@angular/common/http';
import { Injectable } from '@angular/core';
import { Observable, catchError, from, mergeMap, throwError } from 'rxjs';
import {
  CareerProfile, RenderModel, Resume, ResumeSummary, ResumeVersion, SectionConfig, Overrides, ResumeStatus,
  TemplateSummary,
} from './models';
import { SettingsService } from './settings.service';

export interface ResumeUpdate {
  name?: string; targetRole?: string; templateId?: string; templateVersion?: number;
  status?: ResumeStatus; sections?: SectionConfig[]; overrides?: Overrides;
}

/** Thin typed client over the XCron CV API (/api/v1). Replace with the generated SDK when packages/sdk lands. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  constructor(private http: HttpClient, private settings: SettingsService) {}
  private url(p: string) { return `${this.settings.apiBase}${p}`; }

  // career profile
  getProfile(): Observable<CareerProfile> { return this.http.get<CareerProfile>(this.url('/career-profile')); }
  saveProfile(p: CareerProfile): Observable<CareerProfile> { return this.http.put<CareerProfile>(this.url('/career-profile'), p); }
  /** Server-side restore of the canonical starter profile; works on any device without local sample data. */
  resetProfile(): Observable<CareerProfile> { return this.http.post<CareerProfile>(this.url('/career-profile/reset'), {}); }
  deleteProfile(): Observable<void> { return this.http.delete<void>(this.url('/career-profile')); }

  // templates
  listTemplates(): Observable<TemplateSummary[]> { return this.http.get<TemplateSummary[]>(this.url('/templates')); }
  getTemplate(id: string): Observable<TemplateSummary> { return this.http.get<TemplateSummary>(this.url(`/templates/${id}`)); }
  /** Dummy-data render model of a template (shared builder; for gallery cards and template preview only). */
  templateSample(id: string): Observable<RenderModel> { return this.http.get<RenderModel>(this.url(`/templates/${id}/sample`)); }

  // resumes
  listResumes(): Observable<ResumeSummary[]> { return this.http.get<ResumeSummary[]>(this.url('/resumes')); }
  getResume(id: string): Observable<Resume> { return this.http.get<Resume>(this.url(`/resumes/${id}`)); }
  createResume(b: { name: string; targetRole?: string; templateId: string }): Observable<Resume> {
    return this.http.post<Resume>(this.url('/resumes'), b);
  }
  updateResume(id: string, b: ResumeUpdate): Observable<Resume> { return this.http.patch<Resume>(this.url(`/resumes/${id}`), b); }
  /** Concurrency-safe save (module 28): 409 when the resume changed since `expectedUpdatedAt`. Falls back to PATCH only if the endpoint is not deployed (feature off). */
  saveDraft(id: string, b: ResumeUpdate, expectedUpdatedAt: string): Observable<Resume> {
    return this.http.put<Resume>(this.url(`/resumes/${id}/draft`), { ...b, expectedUpdatedAt }).pipe(
      catchError((e: HttpErrorResponse) => (e.status === 404 && /Cannot PUT/i.test(String(e.error?.message ?? '')) ? this.updateResume(id, b) : throwError(() => e))));
  }
  deleteResume(id: string): Observable<void> { return this.http.delete<void>(this.url(`/resumes/${id}`)); }
  createResumeShare(id: string): Observable<{ shareToken: string; sharePath: string }> {
    return this.http.post<{ shareToken: string; sharePath: string }>(this.url(`/resumes/${id}/share`), {});
  }
  revokeResumeShare(id: string): Observable<void> { return this.http.delete<void>(this.url(`/resumes/${id}/share`)); }
  publicResume(token: string): Observable<{ name: string; model: RenderModel }> {
    return this.http.get<{ name: string; model: RenderModel }>(this.url(`/public/resumes/${token}`));
  }
  renderModel(id: string): Observable<RenderModel> { return this.http.get<RenderModel>(this.url(`/resumes/${id}/render-model`)); }
  listVersions(id: string): Observable<ResumeVersion[]> { return this.http.get<ResumeVersion[]>(this.url(`/resumes/${id}/versions`)); }
  createVersion(id: string, changeSummary?: string): Observable<ResumeVersion> {
    return this.http.post<ResumeVersion>(this.url(`/resumes/${id}/versions`), { changeSummary });
  }
  /** Export bytes are streamed and never stored by the server. */
  exportFile(id: string, format: 'pdf' | 'html' | 'docx' | 'xlsx'): Observable<Blob> {
    return this.http.post(this.url(`/resumes/${id}/export/${format}`), {}, { responseType: 'blob' }).pipe(
      // Error bodies arrive as Blobs for blob requests; decode them so callers can show the server message.
      catchError((e: HttpErrorResponse) => (e.error instanceof Blob
        ? from(e.error.text()).pipe(mergeMap((t) => {
          let body: unknown = t;
          try { body = JSON.parse(t); } catch { /* keep text */ }
          return throwError(() => new HttpErrorResponse({ error: body, status: e.status, statusText: e.statusText, url: e.url ?? undefined }));
        }))
        : throwError(() => e))),
    );
  }
}
