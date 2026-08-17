# Backend

## Tecnologias y entrada

El backend usa Python, FastAPI, SQLModel, Pydantic Settings, SQLite, pypdf,
pdfplumber y `python-multipart`. El punto de entrada es
[`backend/app/main.py`](../backend/app/main.py).

La aplicacion:

- crea la base y sus catalogos durante el `lifespan`;
- habilita CORS solo para los origenes configurados;
- publica Swagger en `/docs` y ReDoc en `/redoc`;
- monta todos los recursos bajo `/api/v1`;
- responde `{"message": "SoloFinanzas API online"}` en `/`.

## `core`: configuracion y base de datos

### Configuracion

[`core/config.py`](../backend/app/core/config.py) carga `backend/.env` mediante
Pydantic Settings. Sus valores y defaults se describen en
[Instalacion y configuracion](08-instalacion-y-configuracion.md).

### Base de datos

[`core/database.py`](../backend/app/core/database.py):

- resuelve rutas relativas respecto de `backend/`, no del directorio desde el
  que se lanza Uvicorn;
- crea el directorio padre de la base;
- usa `check_same_thread=False` para sesiones web con SQLite;
- habilita `PRAGMA foreign_keys=ON` en cada conexion;
- entrega una sesion por request con `get_session()`;
- crea tablas, normaliza valores legacy, siembra catalogos y reconstruye
  transferencias en `init_db()`.

La siembra es idempotente por nombre de categoria y por combinacion de keyword
normalizada/categoria. Una regla existente conserva su prioridad personalizada.

## `domain`: vocabulario y funciones puras

### Enums

[`domain/enums.py`](../backend/app/domain/enums.py) define:

| Enum | Valores |
| --- | --- |
| `CurrencyCode` | `CLP` |
| `InstitutionCode` | `banco_de_chile`, `banco_santander`, `copecpay`, `mercadopago`, `banco_estado` |
| `StatementStatus` | `pending`, `processed`, `failed` |
| `CategoryType` | `income`, `expense`, `transfer` |
| `TransactionType` | `income`, `expense` |
| `CategorySource` | `rule`, `manual`, `default` |

`CategoryType.TRANSFER` clasifica categorias; no es un `TransactionType`.

### Normalizacion

[`domain/normalizer.py`](../backend/app/domain/normalizer.py) contiene:

- `normalize_amount_clp`: elimina `CLP`, `$`, espacios y separadores; acepta
  formatos de miles y decimales cero, conserva el signo y devuelve `int`.
  Rechaza nulos, textos sin digitos y decimales distintos de cero.
- `normalize_description`: pasa a minusculas, reemplaza puntuacion y guiones
  bajos por espacios y colapsa espacios repetidos.

### Seleccion de parser

[`domain/parsers.py`](../backend/app/domain/parsers.py) mantiene un `ParserKey`
por institucion y el mapa `INSTITUTION_PARSER_MAP`. Backend y frontend tienen
mapas espejo; al agregar una institucion ambos deben modificarse.

## `models` y `schemas`

- `models/` representa las tablas persistidas.
- `schemas/` representa payloads y respuestas publicas.
- `_sql.enum_sql_type()` configura enums para persistir sus valores de texto y
  validar strings.
- La respuesta `Transaction` agrega `is_internal_transfer`, que no es una
  columna de `transactions`; se deriva desde la tabla de matches.

El detalle completo esta en [Modelo de datos](05-modelo-de-datos.md).

## `services`: logica de negocio

### Cuentas

[`services/accounts.py`](../backend/app/services/accounts.py) normaliza los
ultimos cuatro digitos, ordena cuentas por creacion y protege la eliminacion con
claves foraneas. Si existen registros asociados convierte `IntegrityError` en
`AccountDeleteConflictError`.

### Categorias y reglas

[`services/categories.py`](../backend/app/services/categories.py) exige nombre
no vacio, evita duplicados exactos y lista alfabeticamente.

[`services/categorization_rules.py`](../backend/app/services/categorization_rules.py)
normaliza keywords como descripciones, permite CRUD y lista por prioridad
descendente y fecha descendente.

La aplicacion de reglas ocurre en `services/statements.py`:

1. valida que el tipo sea ingreso o gasto;
2. ordena reglas por prioridad descendente, longitud de keyword descendente e ID;
3. compara palabras completas dentro de la descripcion normalizada;
4. comprueba que la categoria sea del mismo sentido o de transferencia;
5. si no hay coincidencia confiable, deja el movimiento sin categoria.

### Cartolas e importacion persistente

[`services/statements.py`](../backend/app/services/statements.py) implementa:

- CRUD basico de cartolas y cambios de estado;
- enriquecimiento de la vista previa con categorias sugeridas;
- validacion y aplicacion de revisiones del usuario;
- checksum de cartola por cuenta;
- fingerprint por movimiento;
- persistencia atomica de cartola y movimientos;
- calculo de impacto y eliminacion completa de una importacion;
- borrado defensivo del PDF solo dentro de `backend/data/raw` y solo cuando no
  queda otra cartola que lo referencie.

Al importar, el estado comienza en `pending` y pasa a `processed` antes del
commit. Si el endpoint captura un error de parseo o validacion realiza rollback.

### Importador PDF

[`services/pdf_importer.py`](../backend/app/services/pdf_importer.py) tiene un
limite de 10 MB y requiere texto seleccionable. Sus etapas son:

1. validar bytes, extension y contraseña;
2. extraer texto y palabras con coordenadas;
3. resolver el parser desde la institucion de la cuenta;
4. validar marcadores institucionales;
5. extraer periodo y lineas de movimientos;
6. identificar montos y su columna visual cuando existe layout;
7. resolver signo por layout, signo explicito, columnas o keywords;
8. normalizar fecha y descripcion;
9. validar totales de resumen cuando el perfil lo exige;
10. devolver candidatos y hasta diez errores de filas no interpretadas.

Los perfiles Santander y CopecPay validan totales declarados. Santander,
CopecPay y Mercado Pago usan configuracion de columnas visuales. El detalle
algoritmico esta en [Flujo tecnico de inspeccion PDF](inspect_pdf_flow.md).

### Transacciones

[`services/transactions.py`](../backend/app/services/transactions.py):

- crea movimientos individuales o en lote;
- filtra por cuenta, cartola, fecha, tipo y categoria;
- pagina con `limit` y `offset`;
- adjunta la marca `is_internal_transfer`;
- valida compatibilidad al cambiar categoria;
- elimina la referencia a regla cuando la categoria se cambia manualmente;
- reconstruye matches despues de crear o recategorizar.

No hay endpoints actuales para editar todos los campos ni eliminar una
transaccion individual.

### Transferencias internas

[`services/internal_transfers.py`](../backend/app/services/internal_transfers.py)
reconstruye todos los pares y exige:

- mismo monto absoluto;
- un ingreso y un egreso;
- cuentas distintas;
- categoria de tipo transferencia en ambos lados;
- fechas iguales, consecutivas o separadas solo por dias no habiles;
- diferencia maxima absoluta de cinco dias;
- correspondencia uno a uno.

[`services/chilean_business_calendar.py`](../backend/app/services/chilean_business_calendar.py)
mantiene feriados 2025 y 2026 en codigo. Fuera de esos años solo se consideran
inhabiles sabado y domingo.

### Dashboard

[`services/dashboard.py`](../backend/app/services/dashboard.py) carga los
movimientos y matches, excluye ambos lados de cada transferencia interna y:

- elige el mes solicitado si tiene datos;
- si no, usa el mes actual con datos o el ultimo disponible;
- genera balance, ingresos y gastos con variacion absoluta contra el mes previo;
- entrega una serie de los doce meses terminados en el periodo elegido.

## Manejo de errores

| Situacion | Respuesta habitual |
| --- | --- |
| Recurso inexistente | `404` |
| Cuenta con datos al intentar eliminar | `409` |
| Categoria duplicada | `409` |
| Cartola duplicada para la cuenta | `409` |
| Payload o query incompatible con Pydantic/FastAPI | `422` |
| PDF invalido, contraseña, parser o revision incorrecta | `422` |
| Regla/categoria semanticamente invalida | `400` o `422`, segun endpoint |

El cliente Axios convierte `detail` de FastAPI, incluidas listas de errores de
validacion, en un unico `Error` legible para las pantallas.

