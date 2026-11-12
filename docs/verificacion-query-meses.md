# Paso 7 — Dashboard y Análisis

Implementado el 7 de noviembre de 2026.

## Archivos de esta fase

- `frontend/src/hooks/useDashboard.ts`: reemplaza efecto/estado manual por la consulta de resumen ya definida en `query/dashboard.ts`.
- `frontend/src/query/months.ts` (nuevo): rango mensual, cargador completo, límite de concurrencia por cliente, opciones del mes/conteo y hook useCompleteMonths.
- `frontend/src/pages/Dashboard.tsx`: retira cargador mensual duplicado y efecto del conteo. Consulta únicamente el período confirmado por el servidor y conserva resumen y movimientos juntos durante una transición o fallo.
- `frontend/src/pages/Analytics.tsx`: sustituye el bucle de meses por consultas independientes que reutilizan datos vigentes. Conserva widgets, exclusiones, búsqueda, orden y filtros locales.
- `frontend/tests/query-months.spec.ts` (nuevo) y exportaciones del harness: pruebas de integración y de carga mensual.

Los archivos están en el directorio de trabajo; no se crearon commits ni se separaron las fases en el historial de Git. Los archivos nuevos sin seguimiento se ven con `git status --short`, aunque no aparecen en el diff normal de archivos rastreados.

## Comportamiento

Cada mes utiliza su clave existente de usuario/período. El cargador recorre GET /transactions con limit=1000 y offsets sucesivos; guarda el resultado solamente después de completar todas las páginas. Una página fallida o cancelada no publica las anteriores. Una revalidación fallida puede conservar en Query el mes completo anterior, pero no se mezcla silenciosamente con los nuevos resultados.

Una cola por QueryClient permite dos meses simultáneos como máximo. Cada tarea mantiene su turno durante todo el recorrido mensual. Cancelar una consulta en espera retira la tarea sin enviar HTTP; cancelar una activa aborta su lectura y evita seguir con la página siguiente. La salida de sesión conserva las garantías de cancelación ya implementadas.

Análisis utiliza useQueries por mes seleccionado. A → A+B → A reutiliza A y solicita solo B mientras estén vigentes. La selección vacía no inicia lecturas y cancela observadores que ya no se necesitan. Los gráficos reciben el conjunto nuevo únicamente cuando todas sus consultas terminaron correctamente. Mientras tanto conservan los últimos datos completos y muestran los períodos que realmente representan. El botón Reintentar solicita los meses fallidos activos, sin volver a descargar los meses exitosos vigentes.

Dashboard carga catálogos independientes en paralelo tras el aprovisionamiento de /me, pero espera data.period_month para pedir movimientos y conteo. No descarga primero el mes del reloj local. Un snapshot de visualización conserva el resumen y los movimientos del mismo período ante un cambio o error, y el aviso aclara qué período sigue visible. El conteo fallido se informa como error, sin representarlo como cero.

## Medición con API simulada

Se repitió el benchmark de producción con la fixture de 500 movimientos y latencia artificial de 20 ms. Se conserva `http-step6-production.json`; el resultado nuevo está en `docs/measurements/http-step7-production.json`. Una ejecución por fase; los conteos no representan latencia ni carga real del backend.

| Escenario | Paso 6 | Paso 7 |
| --- | ---: | ---: |
| dashboard-cold | 10 | 9 |
| navigation-Cuentas | 3 | 3 |
| navigation-Movimientos | 3 | 3 |
| navigation-Análisis | 1 | 0 |
| navigation-Inicio | 4 | 0 |
| pagination-1 | 1 | 1 |
| pagination-3 | 1 | 1 |
| add-month | 2 | 1 |
| remove-month | 1 | 0 |
| save-category | 7 | 7 |

Agregar un mes requiere un GET porque en esta fixture cabe en una página. Los meses con 1000 o más movimientos requieren las páginas adicionales correspondientes. En el recorrido medido, Análisis reutiliza el mes cargado en Dashboard, y volver a Inicio reutiliza resumen, mes y conteo vigentes.

## Validación

- Build de producción, TypeScript de la prueba nueva y `git diff --check`: correctos. Permanece el aviso conocido sobre tamaño de bundles.
- Suite de Análisis, cuentas y sesión: 38 aprobadas y 2 omitidas por plataforma.
- Pruebas nuevas verifican espera del período del servidor, reutilización Dashboard/Análisis, A → A+B → A, selección vacía, mes de 1001 movimientos, fallo de segunda página sin caché parcial, límite de dos descargas, cancelación activa/en cola y recuperación de Dashboard sin mezclar resumen nuevo con movimientos antiguos.
- Los tests existentes de Análisis conservan búsqueda y datos ante fallo de otro mes, recuperan con reintento y mantienen filtros/widgets/omisiones.
- Ejecución final de las ocho pruebas nuevas más seis flujos existentes de Dashboard: 14/14 aprobadas en escritorio y móvil. Los ajustes durante la validación fueron de selectores en las pruebas nuevas (navegación móvil y texto del componente ErrorState); no se debilitaron pruebas existentes.
- Benchmark de producción: aprobado.

La suite general mantiene los fallos preexistentes documentados en `verificacion-query-sesion.md`; esta fase no intenta corregirlos. La migración de la lista general de Movimientos y su categorización corresponde al paso 8.

Referencia: [useQueries de TanStack Query](https://tanstack.com/query/v5/docs/framework/react/reference/useQueries).
