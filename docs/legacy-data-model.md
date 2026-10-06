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

- esquemas tipados separados por recurso en
  [`backend/app/schemas/`](../backend/app/schemas/)
- modelos persistentes en [`backend/app/models/`](../backend/app/models/)
- catalogos iniciales en
  [`backend/app/services/catalogs.py`](../backend/app/services/catalogs.py)
- modelo vigente documentado en [Modelo de datos](05-modelo-de-datos.md)

> Nota historica: este archivo describe decisiones heredadas. El modelo vigente
> ya no admite `transfer` ni `unknown` como tipos de transaccion; esos valores se
> normalizan al iniciar segun el signo del monto.
