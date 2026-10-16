declare module "expo-charts" {
  import { ComponentType } from "react";

  interface BarChartProps {
    data: number[];
    width?: number;
    height?: number;
    barColor?: string;
    labelColor?: string;
    axisColor?: string;
  }

  interface LineChartProps {
    data: number[];
    width?: number;
    height?: number;
    lineColor?: string;
    pointColor?: string;
    axisColor?: string;
  }

  interface PieChartProps {
    data: number[];
    width?: number;
    height?: number;
    colors?: string[];
  }

  export const BarChart: ComponentType<BarChartProps>;
  export const LineChart: ComponentType<LineChartProps>;
  export const PieChart: ComponentType<PieChartProps>;
}
