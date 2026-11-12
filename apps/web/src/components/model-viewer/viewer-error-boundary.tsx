'use client';

import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  /** Called before the boundary resets, e.g. to fetch a fresh signed URL. */
  onRetry: () => void;
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Catches failures while loading or rendering the model (expired URL, corrupt file,
 * unsupported compression) so they don't take the whole page down. React still needs a
 * class component for error boundaries.
 */
export class ViewerErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    // Development aid only; production error reporting comes with observability (Stage 7).
    if (process.env.NODE_ENV !== 'production') {
      // eslint-disable-next-line no-console -- surfaces viewer failures in the dev console
      console.error('Model viewer failed', error, info.componentStack);
    }
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <div
          role="alert"
          className="flex h-full flex-col items-center justify-center gap-3 p-6 text-center"
        >
          <p className="text-sm text-red-300">
            The model could not be displayed: {this.state.error.message}
          </p>
          <button
            type="button"
            onClick={() => {
              this.props.onRetry();
              this.setState({ error: null });
            }}
            className="rounded bg-neutral-800 px-3 py-1.5 text-sm hover:bg-neutral-700"
          >
            Try again
          </button>
        </div>
      );
    }

    return this.props.children;
  }
}
