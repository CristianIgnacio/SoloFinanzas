# Operacion y mantenimiento

> Actualización de octubre de 2026: los detalles de autenticación, rutas `/app/*`, persistencia, pruebas y operación de la versión multiusuario están en [Despliegue de la beta](despliegue-beta.md). Este documento conserva el contexto funcional de la versión local anterior; no uses sus instrucciones antiguas de arranque/migración para producción.

## Principio principal

Los datos financieros no estan en Git. La base, los PDFs y los respaldos viven
en `backend/data/`, un directorio ignorado. Cualquier operacion de reparacion
debe comenzar con la aplicacion detenida y una copia verificable de ese
directorio.

## Respaldo manual

Con backend y frontend detenidos:

```powershell
Copy-Item backend\data backend\data-backup-20260816 -Recurse
```

Guarda la copia en un medio cifrado y fuera del repositorio. El ejemplo de fecha
debe reemplazarse por la fecha real. Antes de restaurar, conserva tambien una
copia del estado actual.

SQLite puede copiarse de forma segura con el proceso detenido. Copiar el archivo
mientras hay escrituras puede producir un respaldo inconsistente.

## Restauracion

1. Deten la API.
2. Renombra o copia fuera el `backend/data` actual.
3. Coloca la copia restaurada con el nombre/ruta esperados.
4. Confirma que `DATABASE_PATH` apunta a la base restaurada.
5. Inicia la API; `init_db()` ejecutara siembra idempotente y reconstruccion de
   transferencias.
6. Ejecuta health, abre cuentas y compara conteos conocidos.

No mezcles una base de un respaldo con un directorio `raw` distinto sin aceptar
que algunas cartolas pueden quedar con rutas a PDFs inexistentes.

## Script de recategorizacion

[`backend/scripts/recategorize_existing_transactions.py`](../backend/scripts/recategorize_existing_transactions.py)
reaplica reglas actuales sobre movimientos existentes.

Primero simula:

```powershell
cd backend
.venv\Scripts\python.exe scripts\recategorize_existing_transactions.py --dry-run
```

Opciones:

| Opcion | Efecto |
| --- | --- |
| `--dry-run` | Informa cambios sin escribir ni crear respaldo. |
| `--categorized-only` | Omite movimientos actualmente sin categoria. |
| `--include-manual` | Tambien reemplaza asignaciones manuales; usar con especial cuidado. |

Sin `--dry-run`, crea automaticamente un respaldo
`solo_finanzas.backup-recategorize-<timestamp>.db`, normaliza keywords y confirma
los cambios. Por defecto preserva asignaciones manuales y limpia referencias de
regla obsoletas en ellas.

El script no llama explicitamente a la reconstruccion de transferencias. Tras
recategorizar, inicia normalmente la API para que `init_db()` reconstruya los
matches antes de analizar resultados.

## Script de limpieza de categorizacion

[`backend/scripts/cleanup_categorization_data.py`](../backend/scripts/cleanup_categorization_data.py)
es una reparacion puntual de datos historicos. Crea un respaldo y:

- detecta reglas vacias o con categoria vacia;
- elimina asociaciones historicas especificamente codificadas;
- desasigna categorias afectadas en movimientos;
- elimina categorias vacias;
- corrige `Gas` y `Gasto` a tipo expense.

No tiene `--dry-run` y contiene reglas de limpieza especificas, por lo que no se
debe ejecutar como mantenimiento rutinario. Lee el codigo y confirma que los
casos siguen siendo aplicables antes de usarlo.

## Deshacer una cartola desde la aplicacion

Es la via recomendada para retirar una importacion. La UI calcula impacto antes
de habilitar la confirmacion. Al completar:

- elimina cartola y movimientos;
- pierde categorias manuales de esos movimientos;
- recalcula transferencias internas;
- elimina el PDF solo si es un archivo administrado, no compartido y existente;
- permite volver a importar el mismo archivo posteriormente.

No borres manualmente filas de SQLite si la operacion puede hacerse desde la UI,
porque se pueden dejar matches o archivos sin referencia.

## Actualizar feriados bancarios

El archivo
[`chilean_business_calendar.py`](../backend/app/services/chilean_business_calendar.py)
incluye un conjunto local. Al comenzar un nuevo año:

1. agrega feriados bancarios oficiales del año;
2. incluye feriados extraordinarios y 31 de diciembre si corresponde al criterio
   bancario del proyecto;
3. actualiza `test_chilean_business_calendar.py`;
4. agrega casos de transferencia que atraviesen feriado;
5. ejecuta toda la suite.

Si un año no esta cargado, la aplicacion solo reconoce fines de semana, lo que
puede impedir emparejar transferencias separadas por un feriado.

## Cambios de esquema

No confies en `SQLModel.metadata.create_all()` para modificar columnas o claves
existentes. Hasta incorporar migraciones versionadas:

1. respalda la base;
2. ensaya la transformacion sobre una copia;
3. documenta SQL y rollback;
4. verifica conteos y claves foraneas;
5. ejecuta pruebas con una base nueva y una actualizada;
6. conserva el respaldo hasta validar la aplicacion completa.

## Diagnostico

### La API inicia pero faltan datos

- revisa `DATABASE_PATH` y la ruta resuelta respecto a `backend/`;
- confirma que no se creo accidentalmente una segunda base;
- revisa el tamaño y fecha de `solo_finanzas.db`;
- consulta cuentas y cartolas desde Swagger.

### Una cartola aparece pero falta el PDF

`raw_path` puede apuntar a un archivo que fue movido. Esto no impide consultar
movimientos, pero `raw_file_delete_eligible` sera falso. Restaura el archivo en
su ruta relativa o acepta conservar solo los datos normalizados.

### Totales no cuadran

- confirma si la institucion cambio el formato de su PDF;
- inspecciona texto y coordenadas con la guia [`../arci.md`](../arci.md);
- compara candidatos, errores de filas y resumen oficial;
- no fuerces la importacion sin entender que monto fue omitido.

### Transferencia no detectada

Comprueba mismo monto absoluto, cuentas diferentes, ambas categorias de tipo
transferencia, distancia de fechas y feriados configurados. Recategorizar uno de
los lados reconstruye los matches.

## Logs y observabilidad

El proyecto usa la salida estandar de Uvicorn y logging puntual para fallos de
borrado de PDF. No hay rotacion, auditoria, metricas ni monitoreo. Para una
instalacion mas permanente se debe capturar stdout/stderr, limitar la exposicion
de datos y definir retencion.

