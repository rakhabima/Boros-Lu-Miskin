// Without this, a click on a nav link shows the OLD page until the serverless
// function + DB round-trip finishes — the "frozen button" feel. The fallback is
// prefetched, so the shell now swaps in immediately and the data streams after.
export default function Loading() {
  return (
    <div className="animate-pulse space-y-4" aria-busy="true">
      <div className="h-28 rounded-md bg-neutral-200" />
      <div className="h-10 w-2/3 rounded-md bg-neutral-200" />
      <div className="h-64 rounded-md bg-neutral-200" />
    </div>
  );
}
