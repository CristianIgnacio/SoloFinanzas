// Browser-only imports; never included in the application bundle.
export { createElement } from "react";
export { createRoot } from "react-dom/client";
export { QueryClient, QueryClientProvider } from "@tanstack/react-query";
export { useExplicitAction } from "../../src/query/useExplicitAction";
