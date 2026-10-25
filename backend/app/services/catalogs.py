"""Universal two-level catalog. Codes identify templates, names remain editable."""
from dataclasses import dataclass

from app.domain.enums import CategoryType
from app.schemas.categorization_rule import CategorizationRuleSeed


@dataclass(frozen=True)
class CategorySeed:
    code: str
    name: str
    type: CategoryType
    parent_code: str | None = None
    description: str = ""
    sort_order: int = 0


CASH_WITHDRAWAL_CATEGORY = "Retiro de efectivo"
CASH_DEPOSIT_CATEGORY = "Depósito de efectivo"

# Increment only when publishing a new catalog for existing users.
CATEGORY_CATALOG_VERSION = 2
# Version 0 is the original cash-only set. Releases add new rules once and may
# retire untouched templates; personal edits and earlier deletions are retained.
RULE_CATALOG_VERSION = 3


def _group(code: str, name: str, kind: CategoryType, children: list[str], order: int) -> list[CategorySeed]:
    result = [CategorySeed(code, name, kind, description=f"Agrupa movimientos de {name.lower()}.", sort_order=order)]
    for index, label in enumerate(children, 1):
        child_code, child_name = label.split("|", 1)
        result.append(CategorySeed(child_code, child_name, kind, code,
                                   description=f"Movimientos de {child_name.lower()}.",
                                   sort_order=index * 10))
    return result


DEFAULT_CATEGORIES = [
    *_group("food", "Alimentación", CategoryType.EXPENSE, [
        "groceries|Supermercado y despensa", "restaurants|Restaurantes",
        "cafes|Cafeterías", "delivery|Comida a domicilio"], 10),
    *_group("home", "Vivienda y hogar", CategoryType.EXPENSE, [
        "rent|Arriendo / alquiler", "common_fees|Gastos comunes",
        "home_repairs|Mantenimiento y reparaciones", "furniture|Muebles y equipamiento",
        "home_supplies|Limpieza y artículos del hogar"], 20),
    *_group("bills", "Cuentas y comunicaciones", CategoryType.EXPENSE, [
        "electricity|Electricidad", "water|Agua", "gas|Gas y calefacción",
        "internet_phone|Internet y telefonía", "subscriptions|Suscripciones"], 30),
    *_group("transport", "Transporte", CategoryType.EXPENSE, [
        "public_transport|Transporte público", "ride_hailing|Taxi y aplicaciones de movilidad",
        "fuel|Combustible", "parking_tolls|Estacionamientos y peajes",
        "vehicle_maintenance|Mantenimiento del vehículo"], 40),
    *_group("health", "Salud", CategoryType.EXPENSE, [
        "medical|Consultas y exámenes", "medicines|Medicamentos",
        "dental|Atención dental", "therapy|Terapias y rehabilitación"], 50),
    *_group("shopping", "Compras personales", CategoryType.EXPENSE, [
        "clothing|Ropa y calzado", "technology|Tecnología y software",
        "personal_care|Cuidado personal"], 60),
    *_group("education", "Educación", CategoryType.EXPENSE, [
        "school|Colegio y universidad", "courses|Cursos y formación",
        "books|Libros y materiales"], 70),
    *_group("leisure", "Ocio y deporte", CategoryType.EXPENSE, [
        "events|Eventos y salidas",
        "games|Juegos y aficiones", "sport|Gimnasio y deporte"], 80),
    *_group("travel", "Viajes", CategoryType.EXPENSE, [
        "tickets|Pasajes", "lodging|Alojamiento", "tours|Tours y excursiones"], 90),
    *_group("finance", "Finanzas y obligaciones", CategoryType.EXPENSE, [
        "loan_payments|Cuotas de créditos e hipoteca", "fees_interest|Intereses y comisiones",
        "insurance|Seguros", "taxes|Impuestos y trámites"], 100),
    *_group("gifts", "Regalos y aportes", CategoryType.EXPENSE, [
        "gifts_given|Regalos", "donations|Donaciones",
        "family_help|Ayuda a familiares y terceros"], 110),
    *_group("other_expense", "Otros gastos", CategoryType.EXPENSE, [], 120),
    *_group("income", "Ingresos", CategoryType.INCOME, [
        "salary|Sueldos", "freelance|Trabajo independiente",
        "pensions|Pensiones y ayudas", "investment_income|Intereses y dividendos", "sales|Ventas ocasionales",
        "gifts_received|Regalos recibidos", "refunds|Devoluciones y reembolsos"], 130),
    *_group("transfers", "Transferencias", CategoryType.TRANSFER, [
        "own_accounts|Entre mis cuentas", "savings_in|Aportes a ahorro e inversión",
        "savings_out|Retiros de ahorro e inversión",
        f"cash_withdrawal|{CASH_WITHDRAWAL_CATEGORY}",
        f"cash_deposit|{CASH_DEPOSIT_CATEGORY}",
        "own_card_payment|Pago de tarjeta propia"], 140),
]

LEGACY_ROOT_ALIASES = {
    "food": ("Comida",), "bills": ("Cuentas y servicios",),
    "shopping": ("Compras",), "education": ("Educacion",),
    "leisure": ("Entretenimiento",), "finance": ("Finanzas",),
    "other_expense": ("Otros",),
}
LEGACY_CHILD_ALIASES = {
    "groceries": ("Supermercado",), "parking_tolls": ("Estacionamiento",),
    "fees_interest": ("Comisiones bancarias",), "loan_payments": ("Deudas y creditos",),
    "salary": ("Sueldo",),
}

# Keep the published templates to identify untouched rules when upgrading v1.
_RULE_CATALOG_V1 = [
    *[CategorizationRuleSeed(keyword=keyword, category_code="cash_withdrawal", transaction_type="expense", priority=40, introduced_in_version=0)
      for keyword in ("giro en cajero", "giro cajero", "giro atm", "retiro en cajero",
                      "retiro de efectivo", "retiro efectivo")],
    *[CategorizationRuleSeed(keyword=keyword, category_code="cash_deposit", transaction_type="income", priority=40, introduced_in_version=0)
      for keyword in ("depósito en efectivo", "deposito en efectivo", "depósito efectivo",
                      "deposito efectivo", "depósito por caja", "deposito por caja")],
    # Specific phrases and unambiguous descriptors only. Generic transfers,
    # purchases, payments and personal names deliberately have no starter rule.
    *[CategorizationRuleSeed(keyword=keyword, category_code=code, transaction_type="expense", priority=30)
      for code, keywords in {
          "groceries": ("supermercado", "tienda de comestibles"),
          "restaurants": ("restaurante", "restaurant"),
          "cafes": ("cafetería", "cafeteria", "coffee shop"),
          "delivery": ("comida a domicilio", "pedido delivery"),
          "rent": ("pago arriendo", "pago alquiler"),
          "common_fees": ("gastos comunes", "cuota de comunidad"),
          "electricity": ("cuenta de luz", "pago electricidad"),
          "water": ("cuenta de agua", "pago agua potable"),
          "gas": ("cuenta de gas", "pago gas natural"),
          "internet_phone": ("pago internet", "plan telefónico", "plan telefonico"),
          "public_transport": ("pasaje metro", "pasaje bus", "transporte público", "transporte publico"),
          "ride_hailing": ("viaje en taxi", "viaje uber", "viaje cabify"),
          "fuel": ("carga combustible", "estación de servicio", "estacion de servicio"),
          "parking_tolls": ("estacionamiento", "peaje"),
          "vehicle_maintenance": ("taller mecánico", "taller mecanico"),
          "medical": ("consulta médica", "consulta medica", "examen médico", "examen medico"),
          "medicines": ("farmacia", "compra medicamentos"),
          "dental": ("consulta dental", "tratamiento dental"),
          "therapy": ("sesión de fisioterapia", "sesion de fisioterapia"),
          "clothing": ("tienda de ropa", "compra de calzado"),
          "technology": ("licencia software", "compra software"),
          "school": ("arancel universitario", "matrícula escolar", "matricula escolar"),
          "courses": ("curso en línea", "curso en linea"),
          "streaming": ("suscripción streaming", "suscripcion streaming"),
          "sport": ("cuota gimnasio", "membresía gimnasio", "membresia gimnasio"),
          "tickets": ("pasaje aéreo", "pasaje aereo", "boleto de avión", "boleto de avion"),
          "lodging": ("reserva hotel", "alojamiento hotel"),
          "loan_payments": ("cuota hipotecaria", "pago préstamo", "pago prestamo"),
          "fees_interest": ("comisión bancaria", "comision bancaria", "intereses del crédito", "intereses del credito"),
          "insurance": ("prima de seguro", "pago de seguro"),
          "taxes": ("pago impuesto", "pago de impuestos"),
          "donations": ("donación benéfica", "donacion benefica"),
      }.items() for keyword in keywords],
    *[CategorizationRuleSeed(keyword=keyword, category_code=code, transaction_type="income", priority=30)
      for code, keywords in {
          "salary": ("pago de sueldo", "abono remuneración", "abono remuneracion"),
          "freelance": ("pago de honorarios", "abono honorarios"),
          "pensions": ("abono pensión", "abono pension"),
          "investment_income": ("abono dividendos", "intereses ganados"),
          "refunds": ("reembolso compra", "devolución compra", "devolucion compra"),
      }.items() for keyword in keywords],
]

# Retain useful bank descriptors; replace the unlikely prose from v1 with
# merchants and shorter terms. These retain version 1 so deletion is respected.
_RETAINED_V1_KEYWORDS = {
    "supermercado", "restaurante", "restaurant", "cafetería", "cafeteria",
    "gastos comunes", "estacionamiento", "peaje", "farmacia",
    "cuota hipotecaria", "comisión bancaria", "comision bancaria",
    "pago de sueldo", "abono remuneración", "abono remuneracion",
    "pago de honorarios", "abono honorarios", "abono pensión", "abono pension",
    "abono dividendos", "intereses ganados",
    "reembolso compra", "devolución compra", "devolucion compra",
}

# Retire only unchanged system rules on accounts that received version 1.
# Deactivation preserves transaction references and their original assignments.
RETIRED_V1_CATEGORIZATION_RULES = [
    seed for seed in _RULE_CATALOG_V1
    if seed.introduced_in_version == 1 and seed.keyword not in _RETAINED_V1_KEYWORDS
]


def _merchant_rules(code: str, *keywords: str, match_type: str = "contains",
                    transaction_type: str = "expense") -> list[CategorizationRuleSeed]:
    return [CategorizationRuleSeed(keyword=keyword, category_code=code,
                                   transaction_type=transaction_type, priority=30,
                                   match_type=match_type, introduced_in_version=2)
            for keyword in keywords]


# Spanish descriptors plus a Chilean merchant starter set. Whole words match
# normalized bank descriptions, including punctuation such as PAYU *UBER TRIP.
# Retail marketplaces and payment processors do not identify what was bought.
DEFAULT_CATEGORIZATION_RULES = [
    *[seed for seed in _RULE_CATALOG_V1
      if seed.introduced_in_version == 0 or seed.keyword in _RETAINED_V1_KEYWORDS],
    *_merchant_rules("groceries", "jumbo", "unimarc", "tottus", "santa isabel",
                     "supermercado lider", "supermercado líder", "hiper lider",
                     "express lider", "acuenta", "alvi"),
    *_merchant_rules("groceries", "lider", "líder", match_type="exact"),
    *_merchant_rules("restaurants", "mcdonalds", "mc donalds", "mcdonald s",
                     "burger king", "kfc", "pizza hut", "papa johns", "papa john s",
                     "dominos pizza", "domino s pizza"),
    *_merchant_rules("cafes", "starbucks", "dunkin", "juan valdez"),
    *_merchant_rules("delivery", "uber eats", "ubereats", "pedidosya", "pedidos ya"),
    *_merchant_rules("rent", "arriendo", "alquiler"),
    *_merchant_rules("electricity", "enel", "cge", "chilquinta", "saesa"),
    *_merchant_rules("water", "aguas andinas", "esval", "essbio", "nuevosur"),
    *_merchant_rules("gas", "metrogas", "abastible", "lipigas", "gasco"),
    *_merchant_rules("internet_phone", "entel", "movistar", "wom", "vtr",
                     "gtd", "mundo pacifico", "mundo pacífico", "claro chile"),
    *_merchant_rules("internet_phone", "claro", match_type="exact"),
    *_merchant_rules("public_transport", "recarga bip", "tarjeta bip"),
    *_merchant_rules("ride_hailing", "uber trip", "ubertrip", "cabify", "didi trip"),
    *_merchant_rules("ride_hailing", "uber", "didi", match_type="exact"),
    # Copec also provides a wallet; a Copec Pay transfer is not fuel.
    *_merchant_rules("fuel", "eds copec", "shell", "petrobras", "aramco"),
    *_merchant_rules("fuel", "copec", match_type="exact"),
    *_merchant_rules("parking_tolls", "costanera norte", "autopista central",
                     "vespucio norte", "vespucio sur", "saba estacionamientos"),
    *_merchant_rules("medical", "integramedica", "integra medica", "integramédica",
                     "redsalud", "clinica davila", "clínica dávila"),
    *_merchant_rules("medicines", "cruz verde", "salcobrand", "farmacias ahumada",
                     "farmacia ahumada", "dr simi"),
    *_merchant_rules("dental", "uno salud", "redsalud dental"),
    *_merchant_rules("clothing", "zara", "h m", "tricot", "fashion s park",
                     "fashion park", "nike", "adidas", "skechers"),
    *_merchant_rules("technology", "pc factory", "pcfactory", "sp digital", "adobe",
                     "github", "openai"),
    *_merchant_rules("courses", "udemy", "coursera", "domestika", "platzi"),
    *_merchant_rules("events", "cinemark", "cineplanet", "cine hoyts", "cinehoyts",
                     "cinepolis", "cinépolis", "puntoticket", "ticketmaster"),
    *_merchant_rules("games", "steamgames", "steampowered", "playstation network",
                     "nintendo eshop", "xbox game pass"),
    *_merchant_rules("sport", "smart fit", "smartfit", "sportlife", "energy fitness"),
    *_merchant_rules("tickets", "latam", "sky airline", "jetsmart", "turbus", "pullman bus"),
    *_merchant_rules("lodging", "airbnb"),
    *_merchant_rules("loan_payments", "dividendo hipotecario"),
    *_merchant_rules("insurance", "bci seguros", "consorcio seguros", "mapfre", "hdi seguros"),
    *_merchant_rules("salary", "remuneraciones", "sueldo", transaction_type="income"),
    *_merchant_rules("freelance", "honorarios", transaction_type="income"),
    *_merchant_rules("refunds", "reembolso", "devolución", "devolucion", transaction_type="income"),
    *[CategorizationRuleSeed(keyword=keyword, category_code="subscriptions",
                             transaction_type="expense", priority=30, introduced_in_version=3)
      for keyword in ("netflix", "spotify", "disney plus", "disneyplus",
                      "hbo max", "youtube premium", "crunchyroll", "prime video")],
]
