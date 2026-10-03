"use client";

import { useEffect } from "react";

const STORAGE_KEY = "c-visualizer:code";

/** Last-resort fallback: a render crash must not blank the page or lose the student's code. */
export default function Error({ error, retry }: { error: Error & { digest?: string }; retry: () => void }) {
  useEffect(() => {
    console.error(error);
  }, [error]);

  const download = () => {
    let code = "";
    try {
      code = localStorage.getItem(STORAGE_KEY) ?? "";
    } catch {}
    const url = URL.createObjectURL(new Blob([code], { type: "text/x-csrc" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = "program.c";
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="app-bg grid min-h-screen place-items-center p-6 text-center">
      <div className="glass max-w-md rounded-2xl p-8">
        <h2 className="gradient-text text-xl font-bold">Something went wrong</h2>
        <p className="mt-2 text-sm text-white/60">The visualizer hit an unexpected error. Your code is saved in this browser.</p>
        <div className="mt-5 flex justify-center gap-3">
          <button className="btn btn-primary" onClick={() => retry()}>
            Try again
          </button>
          <button className="btn" onClick={download}>
            Download my code
          </button>
        </div>
      </div>
    </div>
  );
}
