/** Show the progress bar only if a request is still running after this long, so fast calls do not flicker. */
export const SHOW_DELAY_MS = 200;
/** Background calls that must not drive the global indicator. */
const SILENT = ['/me/preferences', '/analytics/job-search/events', '/usage/'];
export function isSilentUrl(url: string): boolean { return SILENT.some((m) => url.includes(m)); }

/** Counts in-flight requests and reports visibility once any has been pending for SHOW_DELAY_MS. */
export class LoadingCounter {
  private pending = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  constructor(private onVisible: (v: boolean) => void) {}

  begin() {
    this.pending++;
    if (this.pending === 1 && !this.timer) {
      this.timer = setTimeout(() => { this.timer = null; if (this.pending > 0) this.onVisible(true); }, SHOW_DELAY_MS);
    }
  }

  end() {
    this.pending = Math.max(0, this.pending - 1);
    if (this.pending === 0) {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      this.onVisible(false);
    }
  }
}
