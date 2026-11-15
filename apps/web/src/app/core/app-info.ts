/** Single source of the displayed app version. Keep in step with apps/web/package.json. */
export const APP_VERSION = '0.1.0';

/** Version to show: the native build when running inside the Android app, else the web constant. */
export async function resolveAppVersion(): Promise<string> {
  try {
    const { Capacitor } = await import('@capacitor/core');
    if (!Capacitor.isNativePlatform()) return APP_VERSION;
    const { App } = await import('@capacitor/app');
    const info = await App.getInfo();
    return info.version || APP_VERSION;
  } catch { return APP_VERSION; }
}
