# Paso 8 — Movimientos y categorización concurrente

Implementado el 7 de noviembre de 2026.

## Revisar únicamente esta fase

[Diff de la fase 8](changes/fase-8.patch): compara los archivos con una copia tomada justo antes de empezar este prompt. Incluye archivos nuevos, aunque Git todavía los muestre como no rastreados, y no incorpora las modificaciones de las fases anteriores.

| Archivo | Cambio de esta fase |
| --- | --- |
| `frontend/src/pages/Transactions.tsx` | useInfiniteQuery y useMutation; retiro de paginación/recargas manuales; errores por fila; conservación de filtros, debounce, confirmación, deshacer y exportación. |
| `frontend/src/query/transactions.ts` | Fábrica infinita con initialPageParam=0, siguiente offset y fin por total/página vacía. |
| `frontend/src/query/categoryMutations.ts` (nuevo) | Exclusión por ID, preparación optimista, originales por fila, rollback individual y aplicación de respuestas completas. |
| `frontend/src/query/transactionCache.ts` (nuevo) | Recorrido de filas en arrays, páginas y listas infinitas; comparación de versiones y protección de ediciones pendientes. |
| `frontend/src/query/writes.ts` | Conecta set/confirm/undo con el coordinador de categorías. |
| `frontend/src/query/invalidation.ts` | Reconciliación ante 409 sin reintentar la escritura. |
| `frontend/src/query/readQuery.ts`, `months.ts` | Propagan el cliente a las lecturas y preservan ediciones pendientes también en los meses completos. |
| `frontend/tests/query-transactions.spec.ts` (nuevo) | Concurrencia, versiones, conflictos, páginas, filtros, errores visibles y debounce. |

## Lecturas

Cada combinación normalizada de filtros tiene una clave infinita del usuario. El siguiente offset es offset de respuesta + cantidad recibida; se termina cuando no quedan filas o se alcanza total. Las páginas se deduplican por ID al representarlas. No se recorta la caché con maxPages.

El IntersectionObserver no pide más durante otra carga/revalidación, mientras hay búsqueda pendiente o si falló la página siguiente. fetchNextPage usa cancelRefetch:false para que llamadas repetidas no cancelen ni dupliquen una solicitud en curso. El usuario puede reintentar una página fallida. Cambiar de filtro reinicia el scroll y la expansión de detalles, manteniendo la búsqueda con debounce de 300 ms. Las exportaciones siguen siendo acciones bajo demanda, fuera de esta caché.

## Escrituras y conflictos

Set, confirm y undo usan mutaciones sin reintentos automáticos. El bloqueo está compartido por cliente/ID: impide dos acciones sobre la misma fila incluso desde instancias distintas, pero permite editar filas diferentes.

La preparación ocurre dentro del coordinador de escrituras: cancela lecturas, guarda originales por fila y aplica la categoría temporal. Una lectura que llegue durante la edición conserva esa previsualización salvo que su versión sea más nueva. Al resolver se retiran los campos temporales y se aplica el objeto completo del servidor respetando category_version. Ante fallo solo se restaura la fila afectada, nunca la lista completa; una versión posterior no se sobrescribe. Los errores por fila permanecen visibles aunque el aviso global muestre otro guardado exitoso.

Un HTTP 409 muestra el error y marca las familias correspondientes para renovar el dato. No aumenta expected_version ni reenvía PATCH/undo automáticamente. Las ediciones concurrentes acumulan familias y la última operación refresca una sola vez cada consulta activa. La revalidación infinita vuelve a consultar las páginas cargadas: así corrige la pertenencia a filtros y los totales cuando categorizar retira una fila del filtro sin categoría. Confirmación y deshacer conservan los identificadores y versiones devueltos por el servidor.

## Coste y pruebas

La prueba de ráfaga carga dos páginas y guarda dos filas simultáneamente. Tanto con dos éxitos como con éxito parcial se espera exactamente un GET por página al terminar el grupo, conservando pageParams. No se afirma que un refetch infinito sea un único GET: una lista con N páginas cargadas puede requerir N solicitudes para reconciliarse.

El benchmark de producción con API simulada está en `measurements/http-step8-production.json`; se conservan todas las mediciones anteriores. Sus conteos son iguales a los del paso 7: guardar una categoría en el escenario medido hace 7 solicitudes totales (escritura, reconciliación de recursos activos y propuestas), paginar cuentas hace 1, agregar un mes hace 1 y quitarlo hace 0. Esta fase prioriza la corrección concurrente y evita refetch duplicados por componente; no promete una reducción universal de llamadas.

Validación final: **22/22 pruebas aprobadas** en `query-transactions.spec.ts` y `query-writes.spec.ts`, en escritorio y móvil (16 nuevas y 6 existentes). Build de producción, TypeScript de las pruebas, benchmark y revisión de espacios correctos. Las pruebas cubren rollback de A sin perder B, dos éxitos agrupados, bloqueo entre set/undo del mismo ID, 409 sin reenvío, respuesta antigua frente a versión nueva, refetch durante edición, fetchNextPage repetido, página vacía, filtro sin categoría, errores por fila y debounce exacto de 300 ms. Los flujos existentes seleccionados de confirmación/deshacer, propuestas, contexto de navegación, carga incremental, exportación y vínculo de efectivo también se comprobaron.

No se repitió toda la suite general: sus 14 fallos preexistentes están documentados en `verificacion-query-sesion.md`. Permanecen el aviso conocido de bundles grandes y la centralización de propuestas/modales del paso 9. Las pruebas utilizan API simulada, no un despliegue real.

Referencias: [consultas infinitas](https://tanstack.com/query/v5/docs/framework/react/guides/infinite-queries) y [actualizaciones optimistas](https://tanstack.com/query/v5/docs/framework/react/guides/optimistic-updates).
