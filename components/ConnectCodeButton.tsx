"use client";

import { useActionState } from "react";
import { createConnectCodeAction } from "@/actions/devices";

export function ConnectCodeButton() {
  const [state, action, pending] = useActionState<{ code?: string }>(
    () => createConnectCodeAction(),
    {}
  );
  return (
    <form action={action} className="flex flex-wrap items-center gap-3">
      <button
        disabled={pending}
        className="h-10 rounded-md bg-neutral-900 px-4 text-sm font-medium text-white disabled:opacity-60"
      >
        {pending ? "Generating..." : "Generate connect code"}
      </button>
      {state.code && (
        <span className="text-sm">
          <span className="font-mono text-lg font-semibold tracking-widest">{state.code}</span>
          <span className="ml-2 text-neutral-500">single use, expires in 10 minutes</span>
        </span>
      )}
    </form>
  );
}
