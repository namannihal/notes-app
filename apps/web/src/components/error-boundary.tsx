'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  /**
   * Identity of the content being rendered (e.g. the note id). Errors only
   * count as "repeating" while this stays the same, and changing it clears any
   * error state, so navigating away always recovers automatically.
   */
  resetKey?: string;
}

interface State {
  /** Bumped to remount children after a recoverable error. */
  key: number;
  errorCount: number;
  lastErrorAt: number;
  /** resetKey that the counted errors belong to. */
  errorKey?: string;
}

/** Errors this far apart (ms) are treated as unrelated rather than a loop. */
const REPEAT_WINDOW_MS = 2000;
/** Consecutive failures on the SAME content before we stop retrying. */
const MAX_REPEATS = 4;

/**
 * Recovers from transient render errors (notably TipTap's React node-view
 * "removeChild" race on delete/unmount) by remounting its children instead of
 * white-screening.
 *
 * The retry budget is scoped to `resetKey`: rapidly switching between several
 * notes must not accumulate into the "give up" fallback, because each of those
 * errors was independently recovered. Only a genuine loop on one note - many
 * failures in quick succession for the same `resetKey` - shows the fallback.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { key: 0, errorCount: 0, lastErrorAt: 0 };

  static getDerivedStateFromError() {
    return {};
  }

  componentDidUpdate(prevProps: Props) {
    // Navigated to different content: forget past errors and drop any fallback.
    if (prevProps.resetKey !== this.props.resetKey && this.state.errorCount !== 0) {
      this.setState({ errorCount: 0, lastErrorAt: 0, errorKey: this.props.resetKey });
    }
  }

  componentDidCatch(error: unknown) {
    const now = Date.now();
    const currentKey = this.props.resetKey;
    this.setState((s) => {
      const sameContent = s.errorKey === currentKey;
      const isRepeat = sameContent && now - s.lastErrorAt < REPEAT_WINDOW_MS;
      return {
        key: s.key + 1,
        errorCount: isRepeat ? s.errorCount + 1 : 1,
        lastErrorAt: now,
        errorKey: currentKey,
      };
    });
    console.warn('Editor recovered from a render error:', error);
  }

  render() {
    if (this.state.errorCount > MAX_REPEATS) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Something went wrong rendering this note.{' '}
            <button
              className="ml-2 underline"
              onClick={() =>
                this.setState({ key: this.state.key + 1, errorCount: 0, lastErrorAt: 0 })
              }
            >
              Reload
            </button>
          </div>
        )
      );
    }
    return <div key={this.state.key} className="contents">{this.props.children}</div>;
  }
}
