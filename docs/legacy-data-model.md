# Modelo de datos migrado desde legacy

## Entidades base

- `accounts`: cuenta financiera con banco, tipo, parser y moneda.
- `statements`: cartola importada con checksum, periodo y estado de procesamiento.
- `transactions`: movimiento normalizado con monto, tipo, huella, categoria y metadatos de origen.
- `categories`: catalogo de categorias financieras.
- `categorization_rules`: reglas por keyword para categorizar automaticamente.

## Relaciones

- una `account` tiene muchas `statements`
- una `statement` tiene muchas `transactions`
- una `transaction` puede apuntar a una `category`
- una `transaction` puede registrar una `categorization_rule` aplicada

## Reglas heredadas del legacy

- los montos se trabajan en `CLP`
- las cartolas usan `status`: `pending`, `processed`, `failed`
- los movimientos usan `transaction_type`: `income`, `expense`, `transfer`, `unknown`
- la categorizacion puede venir de `rule`, `manual` o `default`
- la deteccion de duplicados combina `account_id`, `date`, `normalized_description` y `amount_clp`

## Implementacion nueva

- esquemas tipados en [backend/app/schemas/finance.py](/C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/schemas/finance.py)
- catalogos iniciales en [backend/app/services/catalogs.py](/C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/services/catalogs.py)
