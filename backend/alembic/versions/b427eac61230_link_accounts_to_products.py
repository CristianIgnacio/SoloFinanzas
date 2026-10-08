"""Link accounts to stable financial product codes when unambiguous."""

from __future__ import annotations

import unicodedata

from alembic import op
import sqlalchemy as sa
import sqlmodel


revision = "b427eac61230"
down_revision = "8645ff693793"
branch_labels = None
depends_on = None


# Migration snapshot: do not import the live catalog, which may change later.
PRODUCTS = (
    ("banco_de_chile", "Cuenta FAN", "vista", "banco_de_chile_cuenta_fan"),
    ("banco_de_chile", "Cuenta Corriente Digital", "corriente", "banco_de_chile_corriente_digital"),
    ("banco_de_chile", "FAN Ahorro", "ahorro", "banco_de_chile_fan_ahorro"),
    ("banco_de_chile", "Visa Signature", "credito", "banco_de_chile_visa_signature"),
    ("banco_de_chile", "Visa Infinite", "credito", "banco_de_chile_visa_infinite"),
    ("banco_santander", "Cuenta Vista Más Lucas", "vista", "banco_santander_mas_lucas"),
    ("banco_santander", "Cuenta Corriente Digital", "corriente", "banco_santander_corriente_digital"),
    ("banco_santander", "Cuenta de Ahorro", "ahorro", "banco_santander_ahorro"),
    ("banco_santander", "Platinum Santander LATAM Pass", "credito", "banco_santander_platinum_latam_pass"),
    ("banco_estado", "CuentaRUT", "vista", "banco_estado_cuenta_rut"),
    ("banco_estado", "Cuenta Corriente Digital", "corriente", "banco_estado_corriente_digital"),
    ("banco_estado", "Visa SMART", "credito", "banco_estado_visa_smart"),
    ("banco_falabella", "Cuenta Corriente", "corriente", "banco_falabella_corriente"),
    ("banco_falabella", "CMR Mastercard", "credito", "banco_falabella_cmr_mastercard"),
    ("mercadopago", "Cuenta Mercado Pago", "billetera_prepago", "mercadopago_cuenta"),
    ("copecpay", "Cuenta Digital Copec Pay", "billetera_prepago", "copecpay_cuenta_digital"),
)

TYPE_ALIASES = {
    "corriente": "corriente",
    "cuenta corriente": "corriente",
    "vista": "vista",
    "cuenta vista": "vista",
    "ahorro": "ahorro",
    "cuenta de ahorro": "ahorro",
    "billetera prepago": "billetera_prepago",
    "billetera digital": "billetera_prepago",
    "prepago": "billetera_prepago",
    "cuenta prepago": "billetera_prepago",
    "tarjeta de prepago": "billetera_prepago",
    "credito": "credito",
    "tarjeta de credito": "credito",
}


def _normalized(value: str) -> str:
    plain = "".join(
        char for char in unicodedata.normalize("NFKD", value.casefold())
        if not unicodedata.combining(char)
    )
    return " ".join(plain.replace("_", " ").split())


def upgrade() -> None:
    op.add_column(
        "accounts",
        sa.Column("product_code", sqlmodel.sql.sqltypes.AutoString(length=80), nullable=True),
    )
    by_identity = {
        (institution, _normalized(name), kind): code
        for institution, name, kind, code in PRODUCTS
    }
    connection = op.get_bind()
    rows = connection.execute(
        sa.text("SELECT id, institution, name, account_type FROM accounts")
    ).mappings().all()
    for row in rows:
        kind = TYPE_ALIASES.get(_normalized(row["account_type"]))
        code = by_identity.get((row["institution"], _normalized(row["name"]), kind))
        if code:
            connection.execute(
                sa.text("UPDATE accounts SET product_code = :code WHERE id = :id"),
                {"code": code, "id": row["id"]},
            )


def downgrade() -> None:
    op.drop_column("accounts", "product_code")
