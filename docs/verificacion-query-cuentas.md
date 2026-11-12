# Paso 6 — Cuentas, efectivo y datos compartidos

Implementado el 7 de noviembre de 2026.

## Cambios

- `frontend/src/query/shared.ts`: hooks autenticados para cuentas, productos, categorías, reglas/catálogo, cuenta de efectivo/saldo, reportes/períodos, cartolas, impacto y movimientos por cuenta. Reutilizan claves, cancelación y políticas existentes.
- `Accounts.tsx`: lecturas independientes de listados, cartolas por cuenta, página de movimientos, totales y saldo. Impacto de eliminación bajo demanda con Query. Se retiran copias de datos remotos y recargas manuales posteriores a guardados/borrados.
- `CashAccountPanel.tsx`: saldo y totales compartidos; solo cambia la consulta de movimientos al paginar. Se elimina `onBalanceChange` y el contador de recarga local.
- `useAccountProducts` conserva su interfaz pública y usa Query.
- Dashboard, Análisis, Movimientos e Importación usan los mismos catálogos; los períodos de Análisis/Movimientos se comparten salvo cuando corresponde otra clave por cartola. Las selecciones iniciales no se reinician por una revalidación de catálogo.
- Categorías consume Query para categorías/reglas/catálogo; no repite la invalidación de escrituras. Su previsualización de orden es estado local temporal, descartado al terminar el lote, incluso si hay fallo parcial.

Cambiar de cuenta pone offset a cero en el mismo cambio de selección. La consulta conserva filas previas solo al paginar esa misma cuenta con el mismo límite; la pantalla indica que muestra la página anterior y deshabilita la paginación mientras carga. Una cuenta diferente no recibe filas de la anterior. Volver a una página vigente usa la caché.

## Medición de producción con API simulada

Se repitió `npx playwright test --config playwright.benchmark.config.ts`, con la misma fixture de 500 movimientos y latencia artificial de 20 ms. La línea base histórica se conserva. Resultado nuevo: `docs/measurements/http-step6-production.json` (una ejecución posterior; la línea base tiene tres ejecuciones con los mismos conteos).

| Escenario | Solicitudes antes | Solicitudes después |
| --- | ---: | ---: |
| dashboard-cold | 16 | 10 |
| navigation-Cuentas | 8 | 3 |
| navigation-Movimientos | 6 | 3 |
| navigation-Análisis | 5 | 1 |
| navigation-Inicio | 15 | 4 |
| pagination-1 | 3 | 1 |
| pagination-3 | 3 | 1 |
| add-month | 2 | 2 |
| remove-month | 1 | 1 |
| save-category | 3 | 7 |

El criterio de salida se cumple: paginar banco o efectivo realiza un GET a `/transaction-pages`, sin GET adicionales de cartolas, totales o saldo. Las pruebas de navegador verifican todos los requests iniciados en ese intervalo, no solo los completados.

El guardado de categoría aumenta de 3 a 7 solicitudes: ahora las consultas compartidas activas de cuentas/efectivo/categorías/períodos revalidan conforme a la política conservadora de escrituras del paso 5. Antes esas vistas podían conservar información anterior. No se presenta esta fase como una reducción universal: afinar esas dependencias requiere evidencia de qué recursos cambia el servidor. Las descargas mensuales se mantienen hasta el paso 7; por eso agregar/quitar meses no mejora aún.

Estos conteos no representan tiempos ni carga de Render, Supabase o PostgreSQL reales.

## Verificación

- Build de producción y TypeScript de `query-accounts.spec.ts` correctos. Persiste el aviso conocido de bundles grandes.
- Suite de cuentas, escrituras, políticas, sesión, filtros de Análisis e importación: 64 aprobadas y 2 omitidas por plataforma.
- Ocho pruebas de cuentas en escritorio/móvil cubren un único GET por página, vuelta a página vigente sin HTTP, aislamiento al cambiar de cuenta y reutilización de catálogos/saldo al navegar. La versión ampliada incluye respuesta demorada, filas previas identificadas y controles deshabilitados.
- Suite amplia de formularios (`beta.spec.ts`) más cuentas: 93 aprobadas, 3 omitidas y los mismos 14 fallos preexistentes documentados en `verificacion-query-sesion.md`. No aparecen fallos nuevos; las ocho pruebas ampliadas de cuentas pasan. La suite general sigue sin estar completamente verde.
- Benchmark de producción: aprobado.

## Alcance pendiente

El resumen y los meses de Dashboard/Análisis corresponden al paso 7. La lista infinita y el aprendizaje de Movimientos siguen en el paso 8. Se conservaron filtros, widgets, selección y omisiones de Análisis. No se modificó el backend ni se persistió caché financiera en disco.

Referencia: [paginación y placeholderData de TanStack Query](https://tanstack.com/query/v5/docs/framework/react/guides/paginated-queries).
