export interface SiteAdapter {
  id: string;
  name: string;
  version: number;
  description: string;
  /** COPY: values are shown for manual copy only. FILL: the browser extension may fill the visible selectors below. */
  mode: 'COPY' | 'FILL';
  /** Empty means any host. Matches the exact host or a subdomain of it. */
  hostPatterns: string[];
  /** True only when the selectors have been exercised against the live site. */
  verified: boolean;
  /** Allowlisted CSS selectors keyed by field key. Never submit buttons; the extension must not submit forms. */
  selectors: Record<string, string>;
}

/**
 * Declarative, allowlisted adapters (immutable per version). Only the manual-copy adapter is verified; the others ship
 * as experimental until they are tested against the real sites (doc 47 phase P1/P2).
 */
export const SITE_ADAPTERS: ReadonlyArray<SiteAdapter> = Object.freeze([
  Object.freeze({
    id: 'manual-copy', name: 'Manual copy', version: 1, mode: 'COPY' as const, hostPatterns: [], verified: true,
    description: 'Works on any site: review the values here and copy them yourself. Nothing touches the page.', selectors: {},
  }),
  Object.freeze({
    id: 'html-autocomplete', name: 'Standard form fields', version: 1, mode: 'FILL' as const, hostPatterns: [], verified: false,
    description: 'Experimental. Targets inputs that declare standard HTML autocomplete hints; visible fields only.',
    selectors: {
      firstName: 'input[autocomplete="given-name"]', lastName: 'input[autocomplete="family-name"]', fullName: 'input[autocomplete="name"]',
      email: 'input[autocomplete="email"]', phone: 'input[autocomplete="tel"]',
    },
  }),
  Object.freeze({
    id: 'greenhouse-boards', name: 'Greenhouse job boards', version: 1, mode: 'FILL' as const, hostPatterns: ['greenhouse.io'], verified: false,
    description: 'Experimental. Basic identity fields on Greenhouse-hosted application forms.',
    selectors: { firstName: '#first_name', lastName: '#last_name', email: '#email', phone: '#phone' },
  }),
]);

export const getAdapter = (id: string) => SITE_ADAPTERS.find((a) => a.id === id);

const HOST_RE = /^(?=.{1,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;

/** Hostname only: URLs, paths, queries, ports and credentials are rejected so nothing sensitive is stored. */
export function normalizeHost(raw: string): string | null {
  const h = raw.trim().toLowerCase();
  return HOST_RE.test(h) ? h : null;
}

export function hostAllowed(adapter: SiteAdapter, host: string | null): boolean {
  if (adapter.hostPatterns.length === 0) return true;
  if (!host) return false;
  return adapter.hostPatterns.some((p) => host === p || host.endsWith(`.${p}`));
}
