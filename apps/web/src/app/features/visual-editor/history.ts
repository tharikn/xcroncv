/**
 * Undo/redo for the visual editor. Snapshots are immutable documents, so history is just two stacks.
 * Rapid edits that share a `coalesce` key (typing into one element, nudging a size) collapse into one undo step.
 */
export class History<T> {
  private past: T[] = [];
  private future: T[] = [];
  private lastKey = '';
  private lastAt = 0;

  constructor(private limit = 100, private windowMs = 900, private now: () => number = () => Date.now()) {}

  get canUndo() { return this.past.length > 0; }
  get canRedo() { return this.future.length > 0; }

  /** Record that `before` is being replaced by a new state. */
  record(before: T, coalesce = ''): void {
    const t = this.now();
    const merge = !!coalesce && coalesce === this.lastKey && t - this.lastAt < this.windowMs && this.past.length > 0;
    this.lastKey = coalesce; this.lastAt = t;
    this.future = [];
    if (merge) return;
    this.past.push(before);
    if (this.past.length > this.limit) this.past.shift();
  }
  undo(current: T): T | undefined {
    const prev = this.past.pop();
    if (prev === undefined) return undefined;
    this.future.push(current); this.lastKey = '';
    return prev;
  }
  redo(current: T): T | undefined {
    const next = this.future.pop();
    if (next === undefined) return undefined;
    this.past.push(current); this.lastKey = '';
    return next;
  }
  clear(): void { this.past = []; this.future = []; this.lastKey = ''; }
}
