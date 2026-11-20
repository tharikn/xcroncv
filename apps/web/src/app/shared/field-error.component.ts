import { Component, input } from '@angular/core';
import { NgModel } from '@angular/forms';

/**
 * Inline validation message for a template-driven control.
 *
 * Usage:
 *   <input id="email" #emailCtl="ngModel" [(ngModel)]="f.email" required minlength="5" maxlength="254" type="email" />
 *   <app-field-error [control]="emailCtl" label="Email" />
 *
 * The message only appears once the user has touched the control, so a freshly loaded form is
 * never shown a wall of red before the user has had a chance to type.
 */
@Component({
  selector: 'app-field-error',
  standalone: true,
  template: `
    @if (control().touched && control().invalid) {
      <span class="error" role="alert">{{ message() }}</span>
    }
  `,
})
export class FieldErrorComponent {
  control = input.required<NgModel>();
  label = input('This field');

  message(): string {
    const errors = this.control().errors ?? {};
    const min = errors['minlength']?.requiredLength as number | undefined;
    const max = errors['maxlength']?.requiredLength as number | undefined;
    if (errors['required']) return `${this.label()} is required.`;
    if (min != null) return `${this.label()} must be at least ${min} characters.`;
    if (max != null) return `${this.label()} must be at most ${max} characters.`;
    if (errors['email']) return 'Enter a valid email address.';
    if (errors['url']) return 'Enter a valid URL starting with http:// or https://.';
    if (errors['pattern']) return `${this.label()} format is invalid.`;
    return `${this.label()} is invalid.`;
  }
}
