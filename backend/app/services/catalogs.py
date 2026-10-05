from dataclasses import dataclass

from app.domain.enums import CategoryType
from app.schemas.categorization_rule import CategorizationRuleSeed


@dataclass(frozen=True)
class CategorySeed:
    name: str
    type: CategoryType
    parent_name: str | None = None
    is_default: bool = True
    is_active: bool = True
    sort_order: int = 0


DEFAULT_CATEGORIES = [
    CategorySeed(name="Ingresos", type=CategoryType.INCOME, sort_order=10),
    CategorySeed(name="Sueldo", type=CategoryType.INCOME, parent_name="Ingresos", sort_order=10),
    CategorySeed(name="Inversiones", type=CategoryType.INCOME, parent_name="Ingresos", sort_order=20),
    CategorySeed(name="Premios de apuestas", type=CategoryType.INCOME, parent_name="Ingresos", sort_order=30),
    CategorySeed(name="Ahorros", type=CategoryType.INCOME, parent_name="Ingresos", sort_order=40),
    CategorySeed(name="Comida", type=CategoryType.EXPENSE, sort_order=20),
    CategorySeed(name="Supermercado", type=CategoryType.EXPENSE, parent_name="Comida", sort_order=10),
    CategorySeed(name="Transporte", type=CategoryType.EXPENSE, sort_order=30),
    CategorySeed(name="Estacionamiento", type=CategoryType.EXPENSE, parent_name="Transporte", sort_order=10),
    CategorySeed(
        name="Cuentas y servicios",
        type=CategoryType.EXPENSE,
        sort_order=40,
    ),
    CategorySeed(name="Suscripciones", type=CategoryType.EXPENSE, parent_name="Cuentas y servicios", sort_order=10),
    CategorySeed(name="Finanzas", type=CategoryType.EXPENSE, sort_order=50),
    CategorySeed(name="Deudas y creditos", type=CategoryType.EXPENSE, parent_name="Finanzas", sort_order=10),
    CategorySeed(name="Comisiones bancarias", type=CategoryType.EXPENSE, parent_name="Finanzas", sort_order=20),
    CategorySeed(name="Entretenimiento", type=CategoryType.EXPENSE, sort_order=60),
    CategorySeed(name="Apuestas deportivas", type=CategoryType.EXPENSE, parent_name="Entretenimiento", sort_order=10),
    CategorySeed(name="Compras", type=CategoryType.EXPENSE, sort_order=70),
    CategorySeed(name="Salud", type=CategoryType.EXPENSE, sort_order=80),
    CategorySeed(name="Educacion", type=CategoryType.EXPENSE, sort_order=90),
    CategorySeed(name="Otros", type=CategoryType.EXPENSE, sort_order=100),
    CategorySeed(
        name="Transferencias",
        type=CategoryType.TRANSFER,
        sort_order=110,
    ),
]


DEFAULT_CATEGORIZATION_RULES = [
    CategorizationRuleSeed(
        keyword="traspaso a",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transferencia a",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transf a",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="Retiro",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="traspaso de",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transferencia de",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transf.",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transferencia",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transferencia recibida",
        category_name="Transferencias",
        priority=10,
    ),
    CategorizationRuleSeed(
        keyword="transferencia enviada",
        category_name="Transferencias",
        priority=10,
    ),

    CategorizationRuleSeed(keyword="uber trip", category_name="Transporte", priority=20),
    CategorizationRuleSeed(keyword="didi", category_name="Transporte", priority=20),
    CategorizationRuleSeed(keyword="cabify", category_name="Transporte", priority=20),
    CategorizationRuleSeed(keyword="WHOOSH", category_name="Transporte", priority=20),
    CategorizationRuleSeed(keyword="uber", category_name="Transporte", priority=30),
    
    CategorizationRuleSeed(
        keyword="netflix",
        category_name="Suscripciones",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="spotify",
        category_name="Suscripciones",
        priority=20,
    ),
    
    CategorizationRuleSeed(
        keyword="lider",
        category_name="Supermercado",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="jumbo",
        category_name="Supermercado",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="tottus",
        category_name="Supermercado",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="unimarc",
        category_name="Supermercado",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="santa isabel",
        category_name="Supermercado",
        priority=20,
    ),


    CategorizationRuleSeed(
        keyword="servipag",
        category_name="Cuentas y servicios",
        priority=20,
    ),

    CategorizationRuleSeed(keyword="farmacia", category_name="Salud", priority=20),
    
    CategorizationRuleSeed(
        keyword="google play",
        category_name="Suscripciones",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="google youtube",
        category_name="Suscripciones",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="chatgpt",
        category_name="Suscripciones",
        priority=20,
    ),

    CategorizationRuleSeed(keyword="uber eats", category_name="Comida", priority=20,),
    CategorizationRuleSeed(keyword="rappi", category_name="Comida", priority=20),
    CategorizationRuleSeed(keyword="pedidosya", category_name="Comida", priority=20),
    CategorizationRuleSeed(keyword="mc donalds", category_name="Comida", priority=20),
    CategorizationRuleSeed(keyword="mcdonalds", category_name="Comida", priority=20),
    CategorizationRuleSeed(keyword="buffalo waffles", category_name="Comida", priority=20),

    CategorizationRuleSeed(
        keyword="comision",
        category_name="Comisiones bancarias",
        priority=20,
    ),
    
    CategorizationRuleSeed(
        keyword="Ganancia Copec Pay",
        category_name="Inversiones",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="Rentabilidad",
        category_name="Inversiones",
        priority=20,
    ),
    CategorizationRuleSeed(
        keyword="Ganancia",
        category_name="Inversiones",
        priority=20,
    ),

    CategorizationRuleSeed(
        keyword="Honorarios",
        category_name="Sueldo",
        priority=30,
    ),
    
    CategorizationRuleSeed(
        keyword="cineplanet",
        category_name="Entretenimiento",
        priority=20,
    ),
]
