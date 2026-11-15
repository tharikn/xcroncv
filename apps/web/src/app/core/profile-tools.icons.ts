import { addIcons } from 'ionicons';
import { createOutline, globeOutline, ribbonOutline } from 'ionicons/icons';

/** Icons for the career-tools hub entries of docs 41, 47, 49. Safe to call more than once. */
export function registerProfileToolIcons() {
  addIcons({ createOutline, globeOutline, ribbonOutline });
}
