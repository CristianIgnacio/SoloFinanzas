# Flujo visual de inspect_pdf

Este documento resume que pasa cuando se analiza una cartola PDF. El centro del
proceso esta en `backend/app/services/pdf_importer.py`, funcion `inspect_pdf`.

## Vista general

```mermaid
flowchart TD
    A["Usuario selecciona cuenta, PDF y password opcional"] --> B["Frontend: StatementService.previewPdf o importPdf"]
    B --> C["API: /statement-imports/pdf/preview o /statement-imports/pdf"]
    C --> D["_read_pdf(file): lee nombre y bytes"]
    D --> E["session.get(AccountModel, account_id): obtiene institucion de la cuenta"]
    E --> F["inspect_pdf(file_name, file_bytes, institution, password)"]

    F --> G["Devuelve PdfPreview"]

    G --> H{"Endpoint usado"}
    H -->|Preview| I["Retorna vista previa al frontend"]
    H -->|Importacion| J["save_raw_pdf: guarda PDF original"]
    J --> K["import_pdf_transactions: crea cartola y movimientos"]
    K --> L["Retorna PdfImportResponse"]
```

`inspect_pdf` solo inspecciona y parsea. No guarda el PDF, no crea cartolas y no
inserta movimientos. La persistencia ocurre despues, solo en el endpoint de
importacion real.

## Flujo interno de inspect_pdf

```mermaid
flowchart TD
    A["inspect_pdf recibe file_name, file_bytes, institution, password"] --> B{"Validaciones basicas"}
    B -->|Sin bytes| E1["PdfImportError: archivo vacio"]
    B -->|Mas de 10 MB| E2["PdfImportError: supera limite"]
    B -->|No termina en .pdf| E3["PdfImportError: extension invalida"]
    B -->|OK| C["_build_reader"]

    C --> C1["PdfReader abre el PDF"]
    C1 --> C2{"PDF encriptado?"}
    C2 -->|Si, sin password| E4["PdfImportError: pide contrasena"]
    C2 -->|Si, password mala| E5["PdfImportError: contrasena incorrecta"]
    C2 -->|No o password OK| D["_extract_pdf_content"]

    D --> D1["pdfplumber extrae texto por pagina"]
    D --> D2["_extract_layout_lines agrupa palabras por linea visual con coordenadas"]
    D1 --> F["_build_preview_lines"]
    D2 --> F

    F --> G{"Hay lineas visibles?"}
    G -->|No| E6["PdfImportError: requiere OCR no soportado"]
    G -->|Si| H["_resolve_parser(institution)"]

    H --> I["_validate_document(parser_key, extracted_text)"]
    I --> J["_parse_document(parser_key, extracted_text, layout_lines)"]
    J --> K["Calcula checksum SHA-256"]
    K --> L["Construye PdfPreview"]
```

## Funciones principales

```mermaid
flowchart LR
    A["inspect_pdf"] --> B["_build_reader"]
    A --> C["_extract_pdf_content"]
    C --> D["_extract_layout_lines"]
    A --> E["_build_preview_lines"]
    A --> F["_resolve_parser"]
    A --> G["_validate_document"]
    A --> H["_parse_document"]
    H --> I["_parse_tabular_document"]
    I --> J["_iter_tabular_lines"]
    I --> K["_parse_tabular_line"]
    K --> L["_resolve_tabular_amount"]
    L --> M["_resolve_layout_column_candidate_amount"]
    I --> N["_validate_summary_totals"]
```

| Funcion | Que hace |
| --- | --- |
| `inspect_pdf` | Orquesta todo: valida archivo, extrae texto/layout, elige parser, parsea movimientos y arma el `PdfPreview`. |
| `_build_reader` | Abre el PDF con `pypdf`, valida si esta protegido y desencripta con password si corresponde. |
| `_extract_pdf_content` | Usa `pdfplumber` para sacar texto plano y lineas visuales posicionadas. |
| `_extract_layout_lines` | Agrupa palabras por coordenadas para saber en que columna cae cada monto. Esto ayuda especialmente a Santander. |
| `_build_preview_lines` | Limpia las primeras lineas no vacias para mostrarlas en la vista previa. |
| `_resolve_parser` | Traduce la institucion de la cuenta a un `ParserKey`. |
| `_validate_document` | Verifica que el texto tenga marcadores de la institucion esperada. |
| `_parse_document` | Busca el parser registrado y le pasa el texto y layout. |
| `_parse_tabular_document` | Parser generico para cartolas tabulares: periodo, filas, candidatos, errores y totales. |

## Subflujo del parser tabular

```mermaid
flowchart TD
    A["_parse_tabular_document"] --> B["_extract_optional_period"]
    B --> C["_build_layout_context"]
    C --> D["_iter_tabular_lines"]

    D --> E{"Linea candidata?"}
    E -->|No| D
    E -->|Si| F["_parse_tabular_line"]

    F --> G{"Linea valida?"}
    G -->|No| H["Guarda error parseable hasta maximo 10"]
    H --> D
    G -->|Si| I["Agrega TransactionCandidate"]
    I --> D

    D --> J{"Periodo definido?"}
    J -->|Periodo explicito| K["period_month = fecha final del periodo"]
    J -->|Sin periodo y hay candidatos| L["period_month = mes de la fecha maxima"]
    J -->|Sin periodo y sin candidatos| E1["PdfImportError: no pudo determinar periodo"]

    K --> M["_validate_summary_totals"]
    L --> M
    M --> N["Retorna candidates, parsing_errors, period_month"]
```

### Como se interpreta cada linea candidata

```mermaid
flowchart TD
    A["_parse_tabular_line(TabularLine)"] --> B["Detecta fecha inicial con TABULAR_DATE_LINE_PATTERN"]
    B --> C["Ignora saldos iniciales, finales y totales"]
    C --> D["Busca montos con AMOUNT_PATTERN"]
    D --> E["_select_amount_block: toma el bloque de montos relevante"]
    E --> F["normalize_amount_clp: convierte montos a enteros CLP"]
    F --> G["Reconstruye descripcion antes del primer monto"]
    G --> H["_resolve_tabular_amount"]
    H --> I["Normaliza o infiere fecha"]
    I --> J["Valida tolerancia contra periodo declarado"]
    J --> K["Crea TransactionCandidate"]
```

## Resolucion del signo del monto

```mermaid
flowchart TD
    A["_resolve_tabular_amount"] --> J["_resolve_layout_column_candidate_amount"]
    J --> K{"Monto cae en columna visual de movimiento?"}
    K -->|Columna cargo| C["Egreso"]
    K -->|Columna abono| D["Ingreso"]
    K -->|No identificable| B
    B -->|Negativo| C
    B -->|Positivo explicito| D
    B -->|No| E{"Hay columnas cargo/abono con una no cero?"}
    E -->|Cargo no cero| C
    E -->|Abono no cero| D
    E -->|No| F{"Descripcion contiene keyword?"}
    F -->|Income keyword| D
    F -->|Expense keyword| C
    F -->|No| I["PdfImportError: no se pudo determinar cargo o abono"]
```

El orden de decision es importante:

1. Coordenadas visuales del PDF, cuando existe perfil de columnas; los montos
   fuera de columnas cargo/abono, como saldos, se descartan.
2. Signo explicito en el texto.
3. Columnas cargo/abono cuando vienen dos montos.
4. Keywords del perfil de institucion.
5. Error si todavia es ambiguo.

## Salida de inspect_pdf

```mermaid
flowchart LR
    A["PdfPreview"] --> B["parser_key"]
    A --> C["file_name"]
    A --> D["file_checksum"]
    A --> E["page_count"]
    A --> F["is_encrypted"]
    A --> G["used_password"]
    A --> H["preview_lines"]
    A --> I["extracted_text_length"]
    A --> J["period_month"]
    A --> K["candidate_transactions"]
    A --> L["parsing_errors"]

    K --> M["TransactionCandidate: fecha, descripcion, descripcion normalizada, monto CLP, tipo"]
```

## Camino de errores

```mermaid
flowchart TD
    A["Cualquier validacion o parser falla"] --> B["Lanza PdfImportError"]
    B --> C{"Endpoint"}
    C -->|Preview| D["HTTP 422 con detail del error"]
    C -->|Importacion| E["session.rollback"]
    E --> F["HTTP 422 con detail del error"]

    G["Cartola duplicada en importacion"] --> H["DuplicateStatementError"]
    H --> I["HTTP 409"]
```

## Perfiles soportados

`PARSER_PROFILES` registra los parsers tabulares para:

- `BANCO_DE_CHILE`
- `BANCO_SANTANDER`
- `COPECPAY`
- `MERCADOPAGO`
- `BANCO_ESTADO`
- `BANCO_FALABELLA`

Cada perfil define marcadores de documento, keywords de ingreso/egreso y, cuando
aplica, reglas especiales como lineas de continuacion, marcadores de inicio/fin,
extraccion de totales y columnas visuales.

### Banco Falabella: cuenta corriente

El perfil `FALABELLA_PROFILE` admite la **Cartola de Movimientos de Cuenta
Corriente**. El logo puede estar rasterizado y no aparecer en el texto extraido;
su validador comprueba conjuntamente el titulo, el producto, el periodo,
`Saldo Disponible`, `Saldo Contable`, `Listado de movimientos` y el encabezado
`FECHA DESCRIPCIÓN CARGO ABONO SALDO`. Rechaza encabezados de otras instituciones
y no admite estados de cuenta CMR.

`movement_columns_pattern` captura desde el final de cada fila la descripcion,
cargo, abono y saldo. Cada celda monetaria lleva `$` y la celda vacia usa `-`.
Se aceptan miles con comas o puntos mediante el normalizador CLP existente;
los decimales distintos de cero y las filas con cargo y abono simultaneos se
reportan como errores. El signo depende de la columna, no de la descripcion.
Los saldos se validan pero no se importan como movimientos ni se comparan con
el saldo disponible del encabezado, que puede representar otro momento.

El periodo `Periodo de movimientos DD/MM/AAAA al D/MM/AAAA` admite dias y meses
de uno o dos digitos. Se usa para validar las fechas de las transacciones.
`period_from_transactions` asigna el mes del ultimo movimiento, ya que el fin
del rango de consulta puede estar en el futuro. Sin movimientos se conserva
el mes final declarado; la interfaz no permite confirmar una importacion vacia.

El perfil reutiliza la vista previa, revision, categorizacion, identificadores
por fila y proteccion contra duplicados del flujo comun. Las pruebas usan datos
sinteticos y PDFs generados en memoria, sin incluir informacion del titular.
