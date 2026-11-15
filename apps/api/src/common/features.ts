/**
 * Feature flags for optional modules. Set FEATURES_DISABLED=cover-letters,crm,job-analytics to switch
 * modules off without affecting core resume workflows (acceptance criterion: disable by configuration).
 */
export function featureEnabled(name: string, env = process.env.FEATURES_DISABLED): boolean {
  return !(env ?? '').split(',').map((s) => s.trim().toLowerCase()).filter(Boolean).includes(name.toLowerCase());
}
