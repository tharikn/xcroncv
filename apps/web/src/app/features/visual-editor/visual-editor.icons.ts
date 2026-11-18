import { addIcons } from 'ionicons';
import {
  addOutline, appsOutline, arrowRedoOutline, arrowUndoOutline, chevronDownOutline, chevronUpOutline, closeOutline, copyOutline, eyeOffOutline, eyeOutline,
  gridOutline, imageOutline, listOutline, lockClosedOutline, openOutline, reorderThreeOutline, refreshOutline, removeOutline, saveOutline, timeOutline, trashOutline,
} from 'ionicons/icons';

/** Icons used by the visual resume editor (doc 16). Safe to call more than once. */
export function registerVisualEditorIcons() {
  addIcons({
    addOutline, appsOutline, arrowRedoOutline, arrowUndoOutline, chevronDownOutline, chevronUpOutline, closeOutline, copyOutline, eyeOffOutline, eyeOutline,
    gridOutline, imageOutline, listOutline, lockClosedOutline, openOutline, reorderThreeOutline, refreshOutline, removeOutline, saveOutline, timeOutline, trashOutline,
  });
}
