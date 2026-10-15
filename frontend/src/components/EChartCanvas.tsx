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
  TimelineComponent,
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
  TimelineComponent,
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

export type EChartProps = {
  className?: string;
  option: AppChartOption;
  onItemClick?: (index: number) => void;
};

export function EChart({ className, option, onItemClick }: EChartProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const chartRef = useRef<EChartsType | null>(null);
  const onItemClickRef = useRef(onItemClick);
  onItemClickRef.current = onItemClick;

  useEffect(() => {
    const container = containerRef.current;
    if (!container) {
      return;
    }

    const chart = echarts.init(container);
    chartRef.current = chart;
    chart.setOption(option);
    chart.on("click", (event) => {
      if (event.componentType === "series" && typeof event.dataIndex === "number") {
        onItemClickRef.current?.(event.dataIndex);
      }
    });

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
