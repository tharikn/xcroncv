import { addIcons } from 'ionicons';
import { checkmarkOutline, closeOutline, colorPaletteOutline, eyeOutline, saveOutline, cloudDownloadOutline, arrowForwardOutline } from 'ionicons/icons';

/** Icons used by the resume-creation flow (stepper, gallery, editor panel). Safe to call more than once. */
export function registerFlowIcons() {
  addIcons({ checkmarkOutline, closeOutline, colorPaletteOutline, eyeOutline, saveOutline, cloudDownloadOutline, arrowForwardOutline });
}
