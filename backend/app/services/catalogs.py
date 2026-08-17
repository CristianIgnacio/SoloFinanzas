from app.domain.enums import CategoryType
from app.schemas.categorization_rule import CategorizationRuleSeed
from app.schemas.category import CategoryCreate


DEFAULT_CATEGORIES = [
    CategoryCreate(name="Ingresos", type=CategoryType.INCOME, is_default=True),
    CategoryCreate(name="Sueldo", type=CategoryType.INCOME, is_default=True),
    CategoryCreate(name="Inversiones", type=CategoryType.INCOME, is_default=True),
    CategoryCreate(name="Premios de apuestas", type=CategoryType.INCOME, is_default=True),
    CategoryCreate(name="Apuestas deportivas", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Gasto", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Comida", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Supermercado", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Transporte", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Suscripciones", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Salud", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Educacion", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(
        name="Cuentas y servicios",
        type=CategoryType.EXPENSE,
        is_default=True,
    ),
    CategoryCreate(name="Compras", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(
        name="Transferencias",
        type=CategoryType.TRANSFER,
        is_default=True,
    ),
    CategoryCreate(
        name="Deudas y creditos",
        type=CategoryType.EXPENSE,
        is_default=True,
    ),
    CategoryCreate(
        name="Comisiones bancarias",
        type=CategoryType.EXPENSE,
        is_default=True,
    ),
    CategoryCreate(
        name="Entretenimiento",
        type=CategoryType.EXPENSE,
        is_default=True,
    ),
    CategoryCreate(name="Estacionamiento", type=CategoryType.EXPENSE, is_default=True),
    CategoryCreate(name="Otros", type=CategoryType.EXPENSE, is_default=True),
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
