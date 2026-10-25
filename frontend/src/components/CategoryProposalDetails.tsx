import type { CategoryPattern } from "../services/categoryService";
import type { Category } from "../types";

export function CategoryProposalDetails({ proposal, categories, expanded = false }: {
  proposal: CategoryPattern; categories: Category[]; expanded?: boolean;
}) {
  const name = (id: number | null) => categories.find(category => category.id === id)?.name ?? "Categoría no disponible";
  return <div className="space-y-3 break-words text-sm">
    <p>Has clasificado <strong>{proposal.evidence_count} movimientos de «{proposal.pattern}»</strong> como <strong>{name(proposal.category_id)}</strong>.</p>
    <p>¿Quieres aplicar esta categoría automáticamente a futuros movimientos que coincidan?</p>
    <details className="text-muted" open={expanded || undefined}>
      <summary className="cursor-pointer text-primary">Ver ejemplos y alcance</summary>
      <p className="mt-2">{proposal.match_type === "exact" ? "Descripción exacta" : "Contiene"}: «{proposal.pattern}» · {proposal.transaction_type === "expense" ? "Salidas" : "Entradas"} de dinero.</p>
      <p>{proposal.match_count} movimientos actuales coinciden; no se modificarán.</p>
      <ul className="mt-2 space-y-1">{proposal.examples.map(example => <li key={example.transaction_id}>{example.date} · {example.description} → {name(example.category_id)}</li>)}</ul>
    </details>
  </div>;
}
