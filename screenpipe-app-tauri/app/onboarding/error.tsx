"use client";

export default function OnboardingError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div style={{ padding: 40, fontFamily: "monospace", color: "red", backgroundColor: "white" }}>
      <h2>Onboarding Error</h2>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all" }}>
        {error.message}
      </pre>
      <pre style={{ whiteSpace: "pre-wrap", wordBreak: "break-all", fontSize: 12, marginTop: 10 }}>
        {error.stack}
      </pre>
      <button onClick={reset} style={{ marginTop: 20, padding: "8px 16px", cursor: "pointer" }}>
        Retry
      </button>
    </div>
  );
}
