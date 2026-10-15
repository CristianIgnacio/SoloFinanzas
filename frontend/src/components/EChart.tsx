import { lazy, Suspense } from "react";
import type { AppChartOption, EChartProps } from "./EChartCanvas";
export type { AppChartOption } from "./EChartCanvas";
const Canvas = lazy(() =>
  import("./EChartCanvas").then((m) => ({ default: m.EChart })),
);
export function EChart(props: EChartProps) {
  return (
    <Suspense
      fallback={
        <div className={props.className} aria-label="Cargando gráfico" />
      }
    >
      <Canvas {...props} />
    </Suspense>
  );
}
