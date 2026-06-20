# Guia para agregar un nuevo banco

Esta guia resume lo que hay que definir, tocar y validar antes de sumar una
nueva institucion al importador de cartolas PDF.

## Objetivo

Agregar un banco no es solo agregarlo a un enum. Hay que asegurar que:

- La cuenta pueda crearse desde el frontend.
- La institucion tenga un `ParserKey`.
- El PDF sea validado como perteneciente a esa institucion.
- Las filas de movimientos se conviertan en `TransactionCandidate`.
- Los montos queden con signo correcto: cargos negativos, abonos positivos.
- Los tests cubran casos reales del formato.

## Antes de programar

Define o consigue al menos un PDF real de ejemplo y responde estas preguntas:

- Nombre visible del banco o billetera.
- Codigo interno que usaremos, por ejemplo `banco_x`.
- Si el PDF viene protegido con contrasena.
- Si el texto es seleccionable o si requiere OCR. Hoy OCR no esta soportado.
- Headers reales de la tabla, por ejemplo `Fecha Descripcion Cargos Abonos Saldo`.
- Formato de fecha: `dd/mm/yyyy`, `dd-mm-yyyy`, o solo `dd/mm`.
- Si declara periodo explicito: `Desde/Hasta`, `Periodo`, u otro texto.
- Si los movimientos empiezan y terminan entre marcadores especificos.
- Si hay movimientos en varias lineas.
- Si hay totales/resumen que podamos usar para cuadratura.
- Si existen numeros dentro de la descripcion, como `DOM AHUMADA 146`.
- Si el saldo aparece junto al monto de movimiento.

## Archivos principales

Backend:

- `backend/app/domain/enums.py`
  Agregar `InstitutionCode`.

- `backend/app/domain/parsers.py`
  Agregar `ParserKey` y mapear `InstitutionCode -> ParserKey`.

- `backend/app/services/pdf_importer.py`
  Agregar el perfil en `PARSER_PROFILES`.

- `backend/tests/test_pdf_importer.py`
  Agregar fixtures sinteticos y, si se puede, tests basados en ejemplos reales
  anonimizados.

Frontend:

- `frontend/src/types.ts`
  Agregar `InstitutionCode`, `ParserKey`, `InstitutionLabels`,
  `InstitutionParserMap` y `ParserLabels`.

Docs:

- `README.md`
  Actualizar la lista de instituciones soportadas.

- `docs/inspect_pdf_flow.md`
  Actualizar la lista de perfiles soportados si corresponde.

## Perfil del parser

La mayoria de bancos actuales usan `TabularParserProfile`.

Campos importantes:

- `display_name`
  Nombre humano para errores.

- `document_markers`
  Textos que deben aparecer en el PDF para validar que corresponde al banco.
  Usa marcadores especificos, no demasiado genericos.

- `period_patterns`
  Regex para extraer periodo. Si no hay periodo, el parser infiere el mes desde
  la fecha maxima de los movimientos, pero es mejor tener periodo explicito.

- `income_keywords`
  Palabras que sugieren ingreso cuando no hay columnas claras.

- `expense_keywords`
  Palabras que sugieren egreso cuando no hay columnas claras.

- `layout_columns`
  Muy recomendado para tablas con cargos, abonos y saldo. Permite usar las
  coordenadas del PDF para descartar saldos y numeros dentro de descripciones.

- `continuation_lines`
  Usalo si hay movimientos que continuan en una linea sin fecha.

- `movement_start_markers` y `movement_end_markers`
  Usalos si el PDF tiene resumenes u otras tablas que no son movimientos.

- `summary_totals_extractor`
  Ideal cuando el banco declara total cargos y total abonos.

- `description_normalizer`
  Util para limpiar prefijos operacionales del banco sin borrar datos utiles.

## Layout columns

Para tablas tipo:

```text
Fecha Descripcion Cargos Abonos Saldo
```

configura algo asi:

```python
layout_columns=LayoutColumnProfile(
    expense_headers=("CARGO", "CARGOS"),
    income_headers=("ABONO", "ABONOS"),
    balance_headers=("SALDO",),
    description_headers=("DESCRIPCION", "DESCRIPCIÓN", "DETALLE"),
)
```

Puntos de cuidado:

- El orden de columnas puede variar. El parser calcula rangos por posicion.
- El saldo debe quedar fuera de cargos/abonos.
- Si hay numeros al final de la descripcion, el layout debe evitar tomarlos como
  monto. Ejemplo real: `Compra tarjeta digital DOM AHUMADA 146 $16.940 $0 ...`.
- Mantener ceros de columnas como placeholders ayuda a reconstruir bien la
  descripcion y el signo.

## Tests minimos

Agrega al menos estos tests:

- Que `_resolve_parser` incluya la nueva institucion.
- Que `test_every_institution_parser_is_fully_registered` siga pasando.
- Un PDF/texto simple con monto firmado, si el formato lo permite.
- Un caso tabular con `Cargos Abonos Saldo`.
- Un caso con numero dentro de la descripcion.
- Un caso de validacion negativa: PDF de otra institucion debe fallar.
- Si hay totales oficiales, un test que falle cuando los movimientos no cuadran.

Ejemplo de fixture textual:

```python
NUEVO_BANCO_SAMPLE = """
NUEVO BANCO
DESDE: 01/05/2026 HASTA: 31/05/2026
Fecha Descripcion Cargos Abonos Saldo
01/05/2026 Compra ejemplo 10.000 0 90.000
02/05/2026 Abono ejemplo 0 50.000 140.000
""".strip()
```

Si el bug depende de columnas, crea tambien `LayoutLine` con posiciones
similares a las que entrega `pdfplumber`.

## Como inspeccionar un PDF real

Desde `backend`, puedes probar el parser asi:

```powershell
.venv\Scripts\python.exe -c "from pathlib import Path; from app.domain.enums import InstitutionCode; from app.services.pdf_importer import inspect_pdf; p=Path(r'C:\ruta\cartola.pdf'); preview=inspect_pdf(file_name=p.name,file_bytes=p.read_bytes(),institution=InstitutionCode.COPECPAY,password='clave',preview_line_limit=40); print(preview.parser_key, preview.period_month, len(preview.candidate_transactions)); print(preview.parsing_errors); print('\n'.join(preview.preview_lines))"
```

Para revisar coordenadas de una linea:

```powershell
.venv\Scripts\python.exe -c "from pathlib import Path; from app.services.pdf_importer import _extract_pdf_content; p=Path(r'C:\ruta\cartola.pdf'); content=_extract_pdf_content(p.read_bytes(),'clave'); [print(line.text, [(w.text, round(w.x0,1), round(w.x1,1)) for w in line.words]) for line in content.layout_lines if 'TEXTO A BUSCAR' in line.text]"
```

## Validacion antes de cerrar

Corre:

```powershell
cd backend
.venv\Scripts\python.exe -m unittest tests.test_pdf_importer
.venv\Scripts\python.exe -m unittest discover tests
```

Si tocaste tipos o UI, tambien valida frontend:

```powershell
cd frontend
npm run build
```

## Errores frecuentes

- Agregar el enum backend pero olvidar `frontend/src/types.ts`.
- Agregar `InstitutionCode` pero no `ParserKey`.
- El validator acepta textos demasiado genericos y deja pasar PDFs de otro banco.
- El parser toma el saldo como movimiento.
- Un numero dentro de la descripcion se interpreta como monto.
- Una fila con `0 cargo` y `abono real` deja el `0` pegado a la descripcion.
- Las fechas sin anio fallan si no hay periodo declarado.
- Los movimientos continuados se omiten si `continuation_lines` no esta activo.
- Los headers reales tienen acentos o nombres distintos a los supuestos.

## Checklist rapido

- [ ] Tengo al menos un PDF real o texto extraido representativo.
- [ ] Identifique headers reales de tabla.
- [ ] Defini `InstitutionCode`.
- [ ] Defini `ParserKey`.
- [ ] Mapee institucion a parser.
- [ ] Agregue labels y mapa en frontend.
- [ ] Cree `TabularParserProfile`.
- [ ] Configure `layout_columns` si hay columnas monetarias.
- [ ] Agregue tests del parser.
- [ ] Probe con PDF real usando `inspect_pdf`.
- [ ] `parsing_errors` queda vacio o explicado.
- [ ] `candidate_transactions` calza con lo esperado.
- [ ] Tests backend pasan completos.
- [ ] README/docs actualizados.
