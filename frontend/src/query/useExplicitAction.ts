import { useMutation } from "@tanstack/react-query";
import { useRef } from "react";

/** User-triggered actions never retry or retain their payload after completion. */
export function useExplicitAction<A extends unknown[], R>(action: (...args: A) => Promise<R>) {
  const running = useRef(false);
  const mutation = useMutation({ mutationFn: (args: A) => action(...args), retry: false, gcTime: 0 });
  const run = async (...args: A): Promise<R> => {
    if (running.current) throw new Error("Esta operación ya está en curso.");
    running.current = true;
    try { return await mutation.mutateAsync(args); }
    finally { running.current = false; mutation.reset(); }
  };
  return { run, isPending: mutation.isPending };
}
