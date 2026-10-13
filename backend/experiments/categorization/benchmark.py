"""CLI del benchmark. Ejecutar desde backend: python -m experiments.categorization.benchmark."""
from __future__ import annotations

import argparse
import json
import os
import statistics
import sys
import time
from pathlib import Path

from .dataset import is_yes, prepare, read_jsonl, review_rows

DEFAULT_DB = Path(__file__).resolve().parents[2] / "data" / "cloud_dev.db"
DEFAULT_OUT = Path(__file__).resolve().parents[2] / "data" / "benchmark" / "pilot"
REVIEW = "needs_review"
LAYA_REVISION = "1720e3e3357cfe1e281542e223f8273b0890ca34"
MDEBERTA_REVISION = "8adb042d524ecd5c26d3e3ba0e3fbcf7e2d0864c"

DEFINITIONS = {
    "comida": "Gastos de alimentación, comida y bebidas.",
    "delivery": "Pedidos de comida preparada para entrega a domicilio.",
    "supermercado": "Alimentos y artículos domésticos comprados en supermercados.",
    "transporte": "Movilidad, vehículos, transporte público o privado.",
    "estacionamiento": "Pago por estacionar un vehículo.",
    "bencina": "Gasolina, diésel u otros combustibles para vehículos.",
    "cuentas y servicios": "Servicios básicos, telefonía, internet y pagos recurrentes.",
    "suscripciones": "Servicios o plataformas cobrados periódicamente.",
    "compras": "Bienes personales o del hogar no clasificados en otra categoría.",
    "regalos": "Compras hechas para regalar a otras personas.",
    "entretenimiento": "Ocio, espectáculos, juegos y actividades recreativas.",
    "apuestas deportivas": "Pagos vinculados a apuestas deportivas.",
    "finanzas": "Comisiones, créditos, inversiones y otros movimientos financieros.",
    "comisiones bancarias": "Cargos y comisiones cobrados por instituciones financieras.",
    "deudas y creditos": "Pago de préstamos, créditos u otras deudas.",
    "inversiones": "Aportes o compras de instrumentos de inversión.",
    "reservas": "Dinero apartado o reservado para uso posterior.",
    "salud": "Consultas, medicamentos y otros gastos médicos.",
    "educacion": "Estudios, cursos, libros y formación.",
    "ingresos": "Entradas de dinero no clasificadas en otra categoría.",
    "sueldo": "Salario, remuneración o pago por trabajo.",
    "ahorros": "Ingreso de fondos previamente ahorrados.",
    "ganancias tarjetas": "Ganancias recibidas desde tarjetas o plataformas relacionadas.",
    "premios de apuestas": "Premios o ganancias obtenidos por apuestas.",
    "retorno inversiones": "Retornos, dividendos o ganancias de inversiones.",
    "transferencias": "Movimiento de dinero entre cuentas, sin consumo ni ingreso real.",
    "otros": "Movimiento que no corresponde con las categorías específicas.",
}


def category_text(cat: dict, variant: str) -> str:
    if variant == "A":
        return cat["path"]
    return f"{cat['path']}. {DEFINITIONS.get(cat['name'].lower(), 'Movimiento de esta categoría.')}"


def state_text(case: dict, variant: str) -> str | dict:
    if variant in {"A", "B"}:
        return case["description"]
    return {
        "descripcion": case["description"],
        "descripcion_normalizada": case["normalized_description"],
        "monto_clp": f"{case['amount_clp']} CLP",
        "tipo": case["transaction_type"],
    }


class DecisionRunner:
    def __init__(self, provider: str):
        self.provider = provider
        self.model = None
        if provider == "laya":
            try:
                import laya
            except ImportError as exc:
                raise RuntimeError("Instala el extra local: pip install laya") from exc
            self.model = laya.load("convaiinnovations/laya-multilingual", revision=LAYA_REVISION)
        elif provider == "mdeberta":
            try:
                from transformers import pipeline
            except ImportError as exc:
                raise RuntimeError("Instala torch y transformers para mDeBERTa") from exc
            self.model = pipeline(
                "zero-shot-classification",
                model="MoritzLaurer/mDeBERTa-v3-base-mnli-xnli",
                revision=MDEBERTA_REVISION,
                device=-1,
            )
        elif provider == "mercury":
            from dotenv import load_dotenv
            load_dotenv(Path(__file__).resolve().parents[2] / ".env")
            if not os.getenv("OPENROUTER_API_KEY"):
                raise RuntimeError("Falta OPENROUTER_API_KEY en el entorno")
        else:
            raise ValueError(provider)

    def choose(self, state: str | dict, options: dict[str, str]) -> tuple[str, float]:
        question = {
            "type": "choice",
            "instructions": "Elige la categoría financiera más adecuada para este movimiento. "
                            "Si no hay evidencia suficiente, elige needs_review.",
            "criteria": options,
        }
        if self.provider == "laya":
            answer = self.model.predict(state, {"category": question})["answers"]["category"]
            choice = answer["choice"]
            probabilities = answer["probabilities"]
        elif self.provider == "mdeberta":
            labels = list(options.values())
            result = self.model(
                json.dumps(state, ensure_ascii=False) if isinstance(state, dict) else state,
                labels,
                hypothesis_template="Esta transacción corresponde a {}.",
                multi_label=False,
            )
            choice = next(key for key, value in options.items() if value == result["labels"][0])
            probabilities = {key: result["scores"][result["labels"].index(value)]
                             for key, value in options.items()}
        else:
            import httpx
            payload = {
                "model": "inception/mercury-decide:free",
                "state": state,
                "questions": {"category": question},
            }
            for attempt in range(3):
                response = httpx.post(
                    "https://openrouter.ai/api/alpha/decisions",
                    headers={"Authorization": f"Bearer {os.environ['OPENROUTER_API_KEY']}"},
                    json=payload,
                    timeout=45,
                )
                if response.status_code in {429, 500, 502, 503} and attempt < 2:
                    time.sleep(2 ** attempt)
                    continue
                response.raise_for_status()
                break
            answer = response.json()["answers"]["category"]
            choice = answer["choice"]
            probabilities = answer["probabilities"]
        if choice not in options:
            raise ValueError("El modelo devolvió una opción fuera de la taxonomía")
        return choice, float(probabilities[choice])


def predict(case: dict, cats: list[dict], variant: str, runner: DecisionRunner) -> dict:
    by_id = {cat["id"]: cat for cat in cats}
    roots = [cat for cat in cats if cat["parent_id"] is None and
             cat["type"] in {case["transaction_type"], "transfer"}]
    state = state_text(case, variant)
    root_options = {f"c{cat['id']}": category_text(cat, variant) for cat in roots}
    root_options[REVIEW] = "Necesita revisión: descripción insuficiente o ambigua."
    root_choice, root_prob = runner.choose(state, root_options)
    if root_choice == REVIEW:
        return {"category_id": None, "top_probability": root_prob, "abstained": True}
    root = by_id[int(root_choice[1:])]
    children = [cat for cat in cats if cat["parent_id"] == root["id"]]
    if not children:
        return {"category_id": root["id"], "top_probability": root_prob, "abstained": False}
    child_options = {f"c{cat['id']}": category_text(cat, variant) for cat in children}
    child_options[f"c{root['id']}"] = category_text(root, variant) + " (sin subcategoría)"
    child_options[REVIEW] = "Necesita revisión: no hay información para elegir subcategoría."
    child_choice, child_prob = runner.choose(state, child_options)
    if child_choice == REVIEW:
        return {"category_id": None, "top_probability": root_prob * child_prob, "abstained": True}
    return {"category_id": int(child_choice[1:]),
            "top_probability": root_prob * child_prob, "abstained": False}


def run(dataset: Path, provider: str, variant: str, max_cases: int | None,
        approved_only: bool = False) -> dict:
    cases = read_jsonl(dataset / "cases.jsonl")
    cats = read_jsonl(dataset / "taxonomy.jsonl")
    reviews = review_rows(dataset / "review.csv")
    if provider == "mercury" or approved_only:
        approved = []
        for case in cases:
            review = reviews[case["case_id"]]
            if not is_yes(review["external_approved"]):
                continue
            if review.get("description_depurada_a_enviar") != case["description"]:
                raise ValueError("El texto aprobado difiere del texto que se enviaría")
            approved.append(case)
        cases = approved
        if not cases:
            raise ValueError("Marca external_approved=si en review.csv tras revisar los textos depurados")
    if max_cases is not None:
        cases = cases[:max_cases]
    if not cases:
        raise ValueError("No hay casos para ejecutar")
    out = dataset / f"predictions_{provider}_{variant}.jsonl"
    existing = read_jsonl(out) if out.exists() else []
    completed = {row["case_id"] for row in existing}
    pending = [case for case in cases if case["case_id"] not in completed]
    if not pending:
        return {"provider": provider, "variant": variant, "cases": len(existing),
                "errors": sum(bool(row["error"]) for row in existing), "output": str(out)}
    runner = DecisionRunner(provider)
    with out.open("a", encoding="utf-8") as handle:
        for index, case in enumerate(pending, 1):
            started = time.perf_counter()
            try:
                result = predict(case, cats, variant, runner)
                error = None
            except Exception as exc:
                result = {"category_id": None, "top_probability": None, "abstained": False}
                # No guardar el cuerpo de errores HTTP: puede contener el estado enviado.
                error = type(exc).__name__
            row = {"case_id": case["case_id"], **result,
                   "latency_ms": round((time.perf_counter() - started) * 1000), "error": error}
            handle.write(json.dumps(row, ensure_ascii=False, sort_keys=True) + "\n")
            handle.flush()
            if index % 10 == 0:
                print(f"{provider} {variant}: {len(completed) + index}/{len(cases)}", file=sys.stderr)
    predictions = read_jsonl(out)
    return {"provider": provider, "variant": variant, "cases": len(predictions),
            "errors": sum(row["error"] is not None for row in predictions), "output": str(out)}


def report(dataset: Path, provisional: bool = False,
           models: set[str] | None = None) -> list[dict]:
    reviews = review_rows(dataset / "review.csv")
    taxonomy = {cat["id"]: cat for cat in read_jsonl(dataset / "taxonomy.jsonl")}
    def root_id(category_id: int) -> int:
        current = taxonomy[category_id]
        while current["parent_id"] in taxonomy:
            current = taxonomy[current["parent_id"]]
        return current["id"]
    eligible = {key: row for key, row in reviews.items()
                if provisional or is_yes(row["verified"])}
    if not eligible:
        raise ValueError("No hay etiquetas verificadas; revisa review.csv o usa --provisional")
    prediction_files = sorted(path for path in dataset.glob("predictions_*.jsonl")
                              if models is None or path.stem.removeprefix("predictions_") in models)
    if not prediction_files:
        raise ValueError("No hay predicciones")
    predictions_by_file = {path: read_jsonl(path) for path in prediction_files}
    common_ids = set(eligible)
    for predictions in predictions_by_file.values():
        common_ids &= {row["case_id"] for row in predictions}
    if not common_ids:
        raise ValueError("Los modelos no tienen casos evaluables en común")
    rule_path = dataset / "predictions_rules_current.jsonl"
    rule_predictions = {row["case_id"]: row for row in predictions_by_file.get(rule_path, [])}
    rule_miss_ids = {case_id for case_id in common_ids
                     if case_id in rule_predictions and
                     rule_predictions[case_id]["category_id"] is None}
    results = []
    for path, predictions in predictions_by_file.items():
        rows = [row for row in predictions if row["case_id"] in common_ids]
        answered = [row for row in rows if row["category_id"] is not None and not row["error"]]
        correct = [row for row in answered if row["category_id"] ==
                   int(eligible[row["case_id"]]["gold_category_id"])]
        latencies = [row["latency_ms"] for row in rows if row["latency_ms"] is not None]
        at_90 = [row for row in answered if (row["top_probability"] or 0) >= 0.9]
        suggest = [row for row in answered if 0.7 <= (row["top_probability"] or 0) < 0.9]
        rule_miss_answered = [row for row in answered if row["case_id"] in rule_miss_ids]
        results.append({
            "model": path.stem.removeprefix("predictions_"),
            "label_status": "provisional" if provisional else "verified",
            "evaluated": len(rows),
            "coverage": round(len(answered) / len(rows), 3),
            "accuracy_on_answered": round(len(correct) / len(answered), 3) if answered else None,
            "correct_per_case": round(len(correct) / len(rows), 3),
            "errors": sum(bool(row["error"]) for row in rows),
            "p50_latency_ms": round(statistics.median(latencies)) if latencies else None,
            "auto_90_count": len(at_90),
            "auto_90_correct": sum(row["category_id"] ==
                                   int(eligible[row["case_id"]]["gold_category_id"])
                                   for row in at_90),
            "suggest_70_89_count": len(suggest),
            "needs_review_count": len(rows) - len(answered),
            "parent_correct": sum(root_id(row["category_id"]) ==
                                  root_id(int(eligible[row["case_id"]]["gold_category_id"]))
                                  for row in answered),
            "transfer_confusions": sum(
                (taxonomy[row["category_id"]]["type"] == "transfer") !=
                (taxonomy[int(eligible[row["case_id"]]["gold_category_id"])]["type"] == "transfer")
                for row in answered),
            "rule_miss_cases": len(rule_miss_ids),
            "rule_miss_answered": len(rule_miss_answered),
            "rule_miss_correct": sum(row["category_id"] ==
                                     int(eligible[row["case_id"]]["gold_category_id"])
                                     for row in rule_miss_answered),
        })
    return results


def main() -> None:
    parser = argparse.ArgumentParser(description=__doc__)
    sub = parser.add_subparsers(dest="command", required=True)
    prep = sub.add_parser("prepare")
    prep.add_argument("--db", type=Path, default=DEFAULT_DB)
    prep.add_argument("--out", type=Path, default=DEFAULT_OUT)
    prep.add_argument("--size", type=int, default=120)
    prep.add_argument("--seed", type=int, default=42)
    execute = sub.add_parser("run")
    execute.add_argument("--dataset", type=Path, default=DEFAULT_OUT)
    execute.add_argument("--provider", choices=("laya", "mdeberta", "mercury"), required=True)
    execute.add_argument("--variant", choices=("A", "B", "C"), default="B")
    execute.add_argument("--max-cases", type=int)
    execute.add_argument("--approved-only", action="store_true",
                         help="Usa solo los casos depurados aprobados, también en modelos locales")
    summary = sub.add_parser("report")
    summary.add_argument("--dataset", type=Path, default=DEFAULT_OUT)
    summary.add_argument("--provisional", action="store_true")
    summary.add_argument("--models", help="Nombres separados por coma; compara solo esos archivos")
    args = parser.parse_args()
    if args.command == "prepare":
        result = prepare(args.db, args.out, args.size, args.seed)
    elif args.command == "run":
        result = run(args.dataset, args.provider, args.variant, args.max_cases,
                     args.approved_only)
    else:
        result = report(args.dataset, args.provisional,
                        set(args.models.split(",")) if args.models else None)
    print(json.dumps(result, ensure_ascii=False, indent=2))


if __name__ == "__main__":
    main()
