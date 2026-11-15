import { addIcons } from 'ionicons';
import { alertCircleOutline, checkmarkCircleOutline, helpCircleOutline, scanOutline } from 'ionicons/icons';

/** Icons used by the parsing test page and its hub card. Idempotent. */
export function registerParsingTestIcons() {
  addIcons({ alertCircleOutline, checkmarkCircleOutline, helpCircleOutline, scanOutline });
}
