import { SummaryCard } from "./SummaryCard";
import type { SummaryCard as SummaryCardType } from "../types";

type SummaryCardsGridProps = {
  cards: SummaryCardType[];
};

export function SummaryCardsGrid({ cards }: SummaryCardsGridProps) {
  return (
    <section className="grid gap-4 md:grid-cols-2 lg:grid-cols-3">
      {cards.map((card) => (
        <SummaryCard key={card.label} {...card} />
      ))}
    </section>
  );
}
