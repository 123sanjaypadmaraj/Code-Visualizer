"use client";

import { Component, type ReactNode } from "react";

/** Keeps a crash in one panel (e.g. the memory view) from taking down the editor and player. Resets when `resetKey` changes. */
export default class PanelBoundary extends Component<{ children: ReactNode; resetKey?: unknown }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidUpdate(prev: { resetKey?: unknown }) {
    if (this.state.failed && prev.resetKey !== this.props.resetKey) this.setState({ failed: false });
  }

  render() {
    if (this.state.failed) {
      return <div className="p-4 text-sm text-white/60">This panel could not be drawn for this step. Try another step.</div>;
    }
    return this.props.children;
  }
}
