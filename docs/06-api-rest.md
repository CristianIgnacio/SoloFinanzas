# API REST

## Convenciones generales

- Base local: `http://127.0.0.1:8000`.
- Prefijo de negocio: `/api/v1`.
- JSON para recursos normales; `multipart/form-data` para PDFs.
- Fechas: `YYYY-MM-DD`; periodos: `YYYY-MM`.
- Montos: enteros CLP con signo.
- La API no exige autenticacion.
- Swagger: `/docs`; ReDoc: `/redoc`.

## Salud

| Metodo y ruta | Respuesta |
| --- | --- |
| `GET /` | Mensaje de API online. |
| `GET /api/v1/health` | `{"status":"ok"}`. |

## Cuentas

| Metodo y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/v1/accounts` | Sin parametros | Lista ordenada por creacion. |
| `POST /api/v1/accounts` | `AccountCreate` JSON | Crea y responde `201`. |
| `PUT /api/v1/accounts/{account_id}` | `AccountUpdate` JSON completo | Reemplaza campos editables. |
| `DELETE /api/v1/accounts/{account_id}` | ID de ruta | `204`; `409` si tiene datos. |

Ejemplo de creacion:

```json
{
  "name": "Cuenta principal",
  "institution": "banco_de_chile",
  "account_type": "corriente",
  "account_last4": "1234",
  "currency": "CLP"
}
```

## Categorias

| Metodo y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/v1/categories` | `include_inactive`, default `true` | Lista jerarquica plana, padres antes de hijas. |
| `GET /api/v1/categories/{category_id}` | ID | Detalle y contadores de uso. |
| `POST /api/v1/categories` | `CategoryCreate` JSON | Crea y responde `201`. |
| `PATCH /api/v1/categories/{category_id}` | `CategoryUpdate` JSON | Edita, mueve, ordena, archiva o reactiva. |
| `POST /api/v1/categories/{category_id}/merge` | `target_category_id` JSON | Traslada movimientos y reglas y elimina el origen. |
| `DELETE /api/v1/categories/{category_id}` | ID | Elimina solo si no tiene dependencias. |

```json
{
  "name": "Mascotas",
  "type": "expense",
  "parent_id": null,
  "is_default": false,
  "is_active": true,
  "sort_order": 120
}
```

Nombre vacio, tercer nivel o tipos incompatibles producen `400`; duplicado en
el mismo padre produce `409`. Una categoria usada debe archivarse. La respuesta
incluye `transaction_count` y `rule_count`.

## Reglas de categorizacion

| Metodo y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/v1/categorization-rules` | Query opcional `category_id` | Lista de reglas. |
| `GET /api/v1/categorization-rules/{rule_id}` | ID | Regla o `404`. |
| `POST /api/v1/categorization-rules` | JSON | Crea y responde `201`. |
| `PATCH /api/v1/categorization-rules/{rule_id}` | Query `keyword`, `category_id`, `priority`, todos opcionales | Actualizacion parcial. |
| `DELETE /api/v1/categorization-rules/{rule_id}` | ID | `204` o `404`. |

```json
{
  "keyword": "veterinaria",
  "category_id": 21,
  "priority": 50
}
```

El `PATCH` usa parametros de query, no body JSON. La keyword se normaliza antes
de persistir.

## Cartolas

| Metodo y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/v1/statements` | Query opcional `account_id` | Lista por fecha descendente. |
| `GET /api/v1/statements/{statement_id}` | ID | Cartola o `404`. |
| `POST /api/v1/statements` | `StatementCreate` JSON | Registro manual `201`. |
| `PATCH /api/v1/statements/{statement_id}/status` | Query requerido `status` | Estado actualizado. |
| `GET /api/v1/statements/{statement_id}/deletion-impact` | ID | Vista previa de eliminacion. |
| `DELETE /api/v1/statements/{statement_id}` | ID | Elimina cartola y derivados; devuelve resultado. |

`StatementDeletionImpact`:

```json
{
  "statement_id": 10,
  "transaction_count": 34,
  "income_total_clp": 1500000,
  "expense_total_clp": 725000,
  "net_total_clp": 775000,
  "affected_periods": ["2026-07"],
  "internal_transfer_match_count": 2,
  "raw_file_delete_eligible": true
}
```

El resultado del `DELETE` agrega `raw_file_deleted`.

## Importacion PDF

### Vista previa

`POST /api/v1/statement-imports/pdf/preview`

Multipart:

| Campo | Tipo | Requerido |
| --- | --- | --- |
| `account_id` | entero | Si |
| `file` | archivo PDF | Si |
| `password` | texto | No |

No persiste cartola, movimientos ni PDF. La respuesta contiene metadata,
periodo, candidatos con categoria sugerida y errores de filas.

### Importacion directa

`POST /api/v1/statement-imports/pdf` usa los mismos campos. Guarda el PDF,
cartola y candidatos con categorizacion automatica.

### Importacion revisada

`POST /api/v1/statement-imports/pdf/reviewed` agrega el campo multipart
`reviewed_transactions`, un string JSON que representa una lista:

```json
[
  {
    "source_id": "row-000001",
    "source_line": "01/07/2026 COMPRA 10.000",
    "transaction_type": "expense",
    "category_id": 8
  }
]
```

Cada revision debe referenciar un candidato real y no repetido. La categoria
debe coincidir con el tipo o ser transferencia. Cambiar el tipo tambien cambia
el signo del monto.

Respuesta de ambas importaciones:

```json
{
  "statement": {
    "id": 10,
    "account_id": 1,
    "file_name": "cartola.pdf",
    "file_type": "pdf",
    "file_checksum": "...",
    "period_month": "2026-07",
    "status": "processed",
    "raw_path": "data/raw/..._cartola.pdf",
    "uploaded_at": "2026-08-16T20:00:00Z"
  },
  "result": {
    "statement_id": 10,
    "inserted_count": 34,
    "omitted_internal_count": 0,
    "omitted_existing_count": 2
  }
}
```

`omitted_internal_count` es el nombre historico del contador de candidatos
duplicados por identidad dentro del payload; no significa pares de transferencia
interna detectados.

## Transacciones

### Listado

`GET /api/v1/transactions`

| Query | Tipo | Default | Restriccion |
| --- | --- | --- | --- |
| `account_id` | entero | ninguno | Opcional. |
| `statement_id` | entero | ninguno | Opcional. |
| `date_from` | fecha | ninguno | Inclusiva. |
| `date_to` | fecha | ninguno | Inclusiva. |
| `transaction_type` | texto | ninguno | La ruta no declara enum; el motor compara el valor. |
| `category_id` | entero | ninguno | Opcional. |
| `limit` | entero | `100` | Entre 1 y 1.000. |
| `offset` | entero | `0` | Mayor o igual a 0. |

La lista se ordena por fecha e ID descendentes y cada elemento incluye
`is_internal_transfer`.

### Otras operaciones

| Metodo y ruta | Entrada | Resultado |
| --- | --- | --- |
| `GET /api/v1/transactions/{transaction_id}` | ID | Movimiento o `404`. |
| `POST /api/v1/transactions` | `TransactionCreate` JSON | Crea `201`. |
| `POST /api/v1/transactions/bulk` | Lista de `TransactionCreate` | Crea lista `201`. |
| `PATCH /api/v1/transactions/{transaction_id}/category` | JSON con `category_id` nullable y `category_source` opcional | Recategoriza o limpia. |

`TransactionCreate` exige `account_id`, `statement_id`, fecha, ambas
descripciones, monto y tipo; el resto de metadatos es opcional. La API no crea
automaticamente una cartola para transacciones manuales.

El endpoint valida que la categoria exista, este activa y sea compatible. Un
`category_id: null` limpia la categoria sin ambiguedades de query string. Al
filtrar por una categoria principal, el listado incluye tambien sus hijas.

## Dashboard

`GET /api/v1/dashboard?period_month=YYYY-MM`

El parametro es opcional y se valida con expresion regular. La respuesta:

```json
{
  "period_month": "2026-07",
  "available_periods": ["2026-07", "2026-06"],
  "cards": [
    {
      "label": "Balance total",
      "value": "$775.000",
      "trend": "Subio $100.000 vs mes anterior"
    }
  ],
  "monthly_movements": [
    {"month": "2026-07", "income": 1500000, "expenses": 725000}
  ]
}
```

Las tarjetas ya llegan formateadas como texto; la serie mensual conserva enteros.

## Codigos de error relevantes

- `400`: regla o categoria incompatible en operaciones que capturan `ValueError`.
- `404`: cuenta, cartola, regla o movimiento inexistente.
- `409`: categoria duplicada, cuenta con dependencias o cartola duplicada.
- `422`: validacion FastAPI, PDF invalido, contraseña, revision o parseo.
- `500`: error no capturado; revisar terminal del backend.
