import { addIcons } from 'ionicons';
import { briefcaseOutline, downloadOutline, mailOutline, peopleOutline, shieldCheckmarkOutline, statsChartOutline } from 'ionicons/icons';

/** Icons used by the career-tool pages (docs 42, 46, 48). Safe to call more than once. */
export function registerCareerToolIcons() {
  addIcons({ briefcaseOutline, downloadOutline, mailOutline, peopleOutline, shieldCheckmarkOutline, statsChartOutline });
}
