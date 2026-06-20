import { useEffect, useState } from "react";
import { DashboardService } from "../services";
import type { DashboardResponse } from "../types";

type UseDashboardState = {
  data: DashboardResponse | null;
  loading: boolean;
  error: string | null;
};

export function useDashboard(periodMonth?: string): UseDashboardState {
  const [state, setState] = useState<UseDashboardState>({
    data: null,
    loading: true,
    error: null,
  });

  useEffect(() => {
    let isMounted = true;

    async function loadDashboard() {
      setState((current) => ({ ...current, loading: true, error: null }));
      try {
        const payload = await DashboardService.getDashboard(periodMonth);
        if (isMounted) {
          setState({ data: payload, loading: false, error: null });
        }
      } catch (err) {
        if (isMounted) {
          const errorMessage =
            err instanceof Error ? err.message : "Error desconocido";
          setState({ data: null, loading: false, error: errorMessage });
        }
      }
    }

    void loadDashboard();

    return () => {
      isMounted = false;
    };
  }, [periodMonth]);

  return state;
}
