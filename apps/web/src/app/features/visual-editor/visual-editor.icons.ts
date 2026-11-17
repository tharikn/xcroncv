import { addIcons } from 'ionicons';
import {
  addOutline, arrowRedoOutline, arrowUndoOutline, chevronDownOutline, chevronUpOutline, closeOutline, copyOutline, eyeOffOutline, eyeOutline,
  imageOutline, listOutline, openOutline, reorderThreeOutline, refreshOutline, removeOutline, saveOutline, timeOutline, trashOutline,
} from 'ionicons/icons';

/** Icons used by the visual resume editor (doc 16). Safe to call more than once. */
export function registerVisualEditorIcons() {
  addIcons({
    addOutline, arrowRedoOutline, arrowUndoOutline, chevronDownOutline, chevronUpOutline, closeOutline, copyOutline, eyeOffOutline, eyeOutline,
    imageOutline, listOutline, openOutline, reorderThreeOutline, refreshOutline, removeOutline, saveOutline, timeOutline, trashOutline,
  });
}
