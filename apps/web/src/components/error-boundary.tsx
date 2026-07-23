'use client';

import { Component, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  /** Bumped to remount children after a recoverable error. */
  key: number;
  errorCount: number;
  lastErrorAt: number;
}

/**
 * Recovers from transient render errors (notably TipTap's React node-view
 * "removeChild" race on delete/unmount) by remounting its children instead of
 * white-screening. If errors repeat rapidly, shows a manual reload fallback.
 */
export class EditorErrorBoundary extends Component<Props, State> {
  state: State = { key: 0, errorCount: 0, lastErrorAt: 0 };

  static getDerivedStateFromError() {
    return {};
  }

  componentDidCatch(error: unknown) {
    const now = Date.now();
    this.setState((s) => {
      const recent = now - s.lastErrorAt < 2000 ? s.errorCount + 1 : 1;
      return { key: s.key + 1, errorCount: recent, lastErrorAt: now };
    });
    console.warn('Editor recovered from a render error:', error);
  }

  render() {
    if (this.state.errorCount > 4) {
      return (
        this.props.fallback ?? (
          <div className="flex flex-1 items-center justify-center p-8 text-sm text-muted-foreground">
            Something went wrong rendering this note.{' '}
            <button
              className="ml-2 underline"
              onClick={() => this.setState({ key: this.state.key + 1, errorCount: 0 })}
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
