import type { SummaryCard as SummaryCardType } from "../types";
import { StatCard } from "./ui";

type SummaryCardProps = SummaryCardType;

export function SummaryCard({ label, value, trend }: SummaryCardProps) {
  return <StatCard label={label} value={value} helper={trend} />;
}
