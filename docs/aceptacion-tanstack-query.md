# Fase 10: validación y condiciones de aceptación

Validación local del 7 de noviembre de 2026. Las pruebas interceptan HTTP y simulan las respuestas de la API; no certifican Supabase, FastAPI ni PostgreSQL desplegados. No se modificaron contratos o servicios backend.

**Decisión: aceptación global pendiente.** La cobertura dirigida de la migración pasa, pero la suite beta conserva 14 fallos previos. Tampoco se validó el entorno real. El [diff exclusivo de la fase 10](changes/fase-10.patch) contiene el ajuste del modal, la prueba actualizada, las pruebas nuevas y este informe.

## Ejecuciones y resultados

- Suite completa: `npx playwright test --workers=2 --reporter=list,json`. **179 aprobadas, 5 omitidas, 16 fallidas**, sin flaky. [Informe por caso](measurements/acceptance-phase10-initial.json). Incluye 60/60 pruebas Query, 22/22 aplicables de Análisis y 14/14 de Importación.
- De esos 16 fallos, 14 coinciden con los ya contrastados contra la implementación anterior en [verificación de sesión](verificacion-query-sesion.md): apariencia de categoría, selector del rollback, contador de búsqueda, dimensiones de Inicio, opciones deshabilitadas de alta/edición de cuenta (ambos proyectos); bienvenida con efectivo y alias/producto (solo móvil).
- Los otros dos eran las variantes escritorio/móvil de la prueba responsive de Movimientos, que esperaba el comportamiento anterior al cambiar filtros. Tras adaptar expectativas y fixture, **2/2 pasaron**, incluyendo categorización y deshacer.
- Comprobación dirigida posterior del modal y dependencias: **16/16 pasaron** (6 nuevas de aceptación, 8 de cuentas y 2 del flujo de eliminación beta). La ejecución conjunta tenía además las dos pruebas responsive, resueltas en la repetición anterior.
- Compilación de producción y TypeScript de las pruebas añadidas correctos. `git diff --check` y comprobación inversa del patch sin errores. Persiste la advertencia de bundles mayores a 500 kB.
- Benchmark de producción: **1/1 aprobado**. No se ejecutaron pruebas backend porque no se modificó backend ni sus contratos.

No se presenta la combinación de ejecuciones como una nueva suite completa verde. La aceptación general exige resolver los 14 fallos documentados, repetir la suite completa y validar tráfico/errores del entorno real. Los cambios previos de Analytics y otros archivos del usuario se conservaron.

## Matriz de cobertura

| Condición del plan | Evidencia automatizada |
| --- | --- |
| Reutilizar datos vigentes al navegar | `query-accounts.spec.ts`, `query-policies.spec.ts`, benchmark de producción |
| Aprovisionar antes de leer finanzas y compartir `/me` | `query-session.spec.ts`: aprovisionamiento y renovación de token |
| Aislar cambios de usuario con peticiones pendientes | `query-session.spec.ts`: cancela lecturas y descarta respuestas tardías, incluido 401 y éxito de escritura |
| Paginar cuentas y efectivo sin recargar catálogos | `query-accounts.spec.ts`: un GET por página y regreso desde caché |
| Consultar solo meses faltantes y no consultar selección vacía | `query-months.spec.ts` y `analytics-filters.spec.ts` |
| Conservar último conjunto completo si falla un mes | `query-months.spec.ts` y `analytics-filters.spec.ts`: fallo, contexto y recuperación |
| Aislar filtros y cambios de cuenta | `query-accounts.spec.ts`, `query-transactions.spec.ts` y recorrido responsive de Movimientos en `beta.spec.ts` |
| Coordinar scroll, páginas y revalidaciones | `query-transactions.spec.ts`: deduplicación, página vacía, dos páginas reconciliadas y refetch durante edición |
| Revertir solo la edición fallida entre dos concurrentes | `query-transactions.spec.ts`: éxito parcial y error persistente por fila |
| Confirmar/deshacer categoría y recuperar 409 | `query-transactions.spec.ts` y pruebas de propuestas de `beta.spec.ts` |
| Importar/eliminar y renovar dependencias | `query-acceptance.spec.ts`: diez familias activas, inactivos obsoletos y aislamiento por usuario; `query-writes.spec.ts`: eliminación de cuenta y retirada de detalles |
| Corregir pertenencia y conteos tras categorizar | `query-transactions.spec.ts`: filtro sin categoría |
| Recuperar foco/conexión sin bucles | `query-policies.spec.ts`: vigencia, reconexión, límites de retry y Retry-After |
| Exportar/cancelar sin archivos parciales | `beta.spec.ts` y `query-actions.spec.ts` |
| Mantener revisión tras errores y no reenviar automáticamente | `import-responsive.spec.ts`: password, advertencias, duplicados y respuesta perdida; `query-actions.spec.ts`: bloqueo y liberación de variables |

## Correcciones de esta fase

El modal de eliminar cuenta aún consultaba servicios desde un efecto local. Se migró a las opciones compartidas de cartolas y página de movimientos, con `staleTime: 0` para comprobar al abrir. Mientras comprueba o falla, la confirmación permanece bloqueada; el reintento solicita solo las consultas fallidas y cerrar cancela la consulta que deja de tener consumidores. El backend sigue siendo la autoridad al eliminar.

La prueba responsive de Movimientos esperaba filas del filtro anterior durante la carga del siguiente. Se actualizó para exigir aislamiento y mantener todas sus comprobaciones de tamaños, detalles, categorización y deshacer. Su API simulada ahora conserva categoría/versión después de escribir y devuelve la fila completa, como exige la revalidación. No se eliminaron assertions para ocultar fallos.

## Comparación HTTP

Misma fixture `v1-500-transactions-20ms`, compilación de producción. Comparación con la primera ejecución de la línea base inicial (las tres ejecuciones iniciales tenían los mismos conteos).

| Recorrido | Inicial | Fase 10 |
| --- | ---: | ---: |
| Inicio frío | 16 | 9 |
| Navegar a Cuentas | 8 | 3 |
| Navegar a Movimientos | 6 | 3 |
| Navegar a Análisis | 5 | 0 |
| Volver a Inicio | 15 | 0 |
| Paginar cuenta bancaria | 3 | 1 |
| Paginar efectivo | 3 | 1 |
| Añadir mes | 2 | 1 |
| Quitar mes | 1 | 0 |
| Guardar categoría | 3 | 7 |

Guardar categoría tiene un coste mayor por la reconciliación conservadora: PATCH más seis lecturas de dependencias activas. No se presenta como una mejora de tráfico. Refinar esa invalidación requiere conservar coherencia entre cuentas, efectivo, categorías, períodos, propuestas y movimientos.

Registro: [medición fase 10](measurements/http-phase10-production.json). La medición se realizó antes del ajuste del modal de eliminación, que no participa en el recorrido del benchmark. Los conteos son evidencia de la fixture, no una estimación del ahorro SQL o del tráfico real.
