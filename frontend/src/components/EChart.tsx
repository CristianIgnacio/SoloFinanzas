import { useEffect, useRef } from "react";
import * as echarts from "echarts/core";
import {
  BarChart,
  LineChart,
  PieChart,
  type BarSeriesOption,
  type LineSeriesOption,
  type PieSeriesOption,
} from "echarts/charts";
import {
  GridComponent,
  GraphicComponent,
  LegendComponent,
  TooltipComponent,
  type GraphicComponentOption,
  type GridComponentOption,
  type LegendComponentOption,
  type TooltipComponentOption,
} from "echarts/components";
import { CanvasRenderer } from "echarts/renderers";
import type { ComposeOption, EChartsType } from "echarts/core";

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  GridComponent,
  GraphicComponent,
  LegendComponent,
  TooltipComponent,
  CanvasRenderer,
]);

export type AppChartOption = ComposeOption<
  | BarSeriesOption
  | LineSeriesOption
  | PieSeriesOption
  | GridComponentOption
  | GraphicComponentOption
  | LegendComponentOption
  | TooltipComponentOption
>;

type EChartProps = {
  className?: string;
  option: AppChartOption;
};

export function EChart({ className, option }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = echarts.init(container);
    chartRef.current = chart;
    chart.setOption(option);

    const observer = new ResizeObserver(() => {
      chart.resize();
    });

    observer.observe(container);

    return () => {
      observer.disconnect();
      chart.dispose();
      chartRef.current = null;
    };
  }, []);

  useEffect(() => {
    chartRef.current?.setOption(option, true);
  }, [option]);

  return <div ref={containerRef} className={className} />;
}
