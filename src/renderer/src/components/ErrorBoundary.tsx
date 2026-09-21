import { Component } from 'react'

interface Props {
  onReset: () => void
  children: React.ReactNode
}

interface State {
  error: Error | null
}

/**
 * Without this, any uncaught render/effect error unmounts the whole app to a blank white
 * screen with no way back short of quitting. This catches it and offers a way home instead.
 */
export default class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null }

  static getDerivedStateFromError(error: Error): State {
    return { error }
  }

  componentDidCatch(error: Error, info: React.ErrorInfo): void {
    console.error('Uncaught render error:', error, info.componentStack)
  }

  render(): React.ReactNode {
    if (this.state.error) {
      return (
        <div className="error-boundary">
          <h2>Something went wrong</h2>
          <p className="deck-description">
            {this.state.error.message || 'An unexpected error occurred.'}
          </p>
          <button
            className="btn btn-primary"
            onClick={() => {
              this.setState({ error: null })
              this.props.onReset()
            }}
          >
            Back to Home
          </button>
        </div>
      )
    }
    return this.props.children
  }
}
