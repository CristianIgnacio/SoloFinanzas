import { QueryClient } from "@tanstack/react-query";
import { queryDefaults } from "./policies";

/** Create once per authenticated session, never as a module-level singleton. */
export function createQueryClient() {
  return new QueryClient({ defaultOptions: queryDefaults });
}
