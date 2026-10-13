# Benchmark de categorización

Este experimento está aislado de la API y no modifica la base de datos. Lee
`backend/data/cloud_dev.db` en modo SQLite de solo lectura. Los movimientos,
resultados individuales y cachés de modelos se guardan en `backend/data/`, que
está excluido de Git.

## Ver resultados en un notebook

Abre [visualizar_resultados.ipynb](visualizar_resultados.ipynb) en Jupyter o
VS Code usando el Python de `backend/.venv`. Para instalar el entorno visual:

```powershell
.venv/Scripts/python.exe -m pip install -r experiments/categorization/requirements-notebook.txt
.venv/Scripts/python.exe -m jupyterlab
```

El notebook local recalcula el informe y muestra los 20 casos depurados para
revisión. En Google Colab, sube el `.ipynb` y **solo**
`data/benchmark/pilot/summary_provisional.json`: allí se verán gráficos
agregados, sin descripciones ni etiquetas individuales.

## 1. Preparar la muestra

Desde `backend/`:

```powershell
.venv/Scripts/python.exe -m experiments.categorization.benchmark prepare --size 120
```

La selección usa el usuario local con más movimientos: 70 % es muestra
aleatoria y 30 % favorece categorías poco frecuentes. Se crean:

- `data/benchmark/pilot/cases.jsonl`: texto depurado y contexto sin etiquetas;
- `data/benchmark/pilot/taxonomy.jsonl`: categorías permitidas;
- `data/benchmark/pilot/taxonomy.csv`: referencia de IDs y rutas para corregir
  `gold_category_id`;
- `data/benchmark/pilot/review.csv`: descripción original, etiqueta histórica y
  columnas `verified` y `external_approved`;
- `data/benchmark/pilot/predictions_rules_current.jsonl`: reglas actuales como
  referencia. Esta referencia usa el estado **actual** de las reglas, no el que
  existía en la fecha de cada movimiento.

`manual` en la base no garantiza una corrección consciente. Revisa cada fila de
`review.csv`, corrige `gold_category_id` si corresponde y escribe `si` en
`verified`. Una etiqueta sin verificar no entra en el informe definitivo.
La columna `description_depurada_a_enviar` muestra exactamente el texto que
se enviaría a Mercury; si cambia después de la aprobación, el runner se detiene.

La depuración automática elimina correos, URL, RUT y números largos, pero puede
dejar nombres u otros datos privados. Revisa el texto de `cases.jsonl` asociado
a cada `case_id` antes de escribir `si` en `external_approved`. El runner de
Mercury solo transmite las filas aprobadas; nunca transmite `review.csv` ni
las etiquetas correctas.

## 2. Ejecutar modelos gratuitos

Opciones locales (los modelos se descargan la primera vez):

```powershell
.venv/Scripts/python.exe -m pip install -r experiments/categorization/requirements-local.txt
.venv/Scripts/python.exe -m experiments.categorization.benchmark run --provider laya --variant B

.venv/Scripts/python.exe -m experiments.categorization.benchmark run --provider mdeberta --variant B
```

Para mantener el caché dentro de `backend/data/`, define `HF_HOME` y
`TORCH_HOME` en `backend/data/benchmark/model-cache` antes de ejecutar.
El código fija los commits de ambos modelos locales para repetir el piloto.

Mercury Decide gratuito requiere una clave de OpenRouter en la variable de
entorno `OPENROUTER_API_KEY` y filas aprobadas para envío externo:

```powershell
.venv/Scripts/python.exe -m experiments.categorization.benchmark run --provider mercury --variant B
```

No guardes la clave en el repo. Los límites del endpoint gratuito pueden
interrumpir una corrida; los errores quedan contados por caso.

Variantes: `A` solo descripción, `B` añade definiciones de categorías y `C`
añade monto, tipo y descripción normalizada. El tipo se usa siempre para limitar
las categorías válidas. Todos los modelos reciben la misma taxonomía y
resuelven primero categoría principal y después subcategoría. `needs_review`
es una opción explícita. La variante D, con historial personal, queda para
cuando exista una muestra verificada y un historial temporal sin filtraciones.
`--approved-only` aplica a los modelos locales el mismo subconjunto revisado
que recibe Mercury.

## 3. Informe

```powershell
.venv/Scripts/python.exe -m experiments.categorization.benchmark report
```

Para un diagnóstico temprano contra etiquetas históricas sin validar:

```powershell
.venv/Scripts/python.exe -m experiments.categorization.benchmark report --provisional
```

El informe usa solamente los `case_id` presentes en todos los archivos de
predicciones seleccionados. Para ver los 120 casos locales sin restringirse a
los aprobados para Mercury:

```powershell
.venv/Scripts/python.exe -m experiments.categorization.benchmark report --provisional --models rules_current,laya_B,mdeberta_B
```

Las probabilidades de modelos diferentes no deben interpretarse como
equivalentes sin calibración. El umbral de 0,90 se muestra solo como referencia
inicial. No seleccionar umbrales definitivos con la misma muestra usada para
comparar modelos.

Fuentes de los contratos de modelo:
[OpenRouter Decisions](https://openrouter.ai/blog/insights/what-is-jev/),
[Mercury Decide gratis](https://openrouter.ai/inception/mercury-decide:free),
[Laya Multilingual](https://huggingface.co/convaiinnovations/laya-multilingual),
[mDeBERTa XNLI](https://huggingface.co/MoritzLaurer/mDeBERTa-v3-base-mnli-xnli).
