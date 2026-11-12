# Paso 5 — Escrituras antes de compartir lecturas

Implementado el 7 de noviembre de 2026.

## Contrato

`frontend/src/query/writes.ts` expone `useWriteActions` y `createWriteActions`. Los servicios siguen siendo transporte sin dependencia de Query. Se conectaron Accounts, Categories, Dashboard, ImportStatements, Transactions, Profile, CashAccountPanel, CashMovementFormModal, CategoryLearning y CategoryProposalModal. También se cubren métodos persistentes todavía sin consumidores, como importar PDF directamente, olvidar memoria y crear movimientos en lote.

Cada operación ejecuta una política central en `invalidation.ts`, filtrada por usuario y familias. No existen invalidaciones globales sin filtro. Las cuentas devueltas actualizan listas existentes; el saldo inicial utiliza la respuesta del servidor; onboarding actualiza el perfil; movimientos actualizan filas presentes en páginas, arrays e infinitas, respetando category_version. La invalidación posterior recalcula pertenencia a filtros, conteos y totales. Borrar cuenta retira su fila y cachés filtradas; borrar cartola retira impacto y detalles filtrados.

| Familia de escritura | Familias invalidadas |
| --- | --- |
| Crear/editar cuenta | Cuentas, reportes, dashboard y perfil (onboarding bancario). |
| Movimientos, efectivo, cartolas/importación, borrar cuenta | Cuentas/efectivo/saldo, cartolas, movimientos en todos sus formatos, reportes/períodos, dashboard, categorías, aprendizaje e impactos. |
| Categorías | Familia financiera anterior, catálogo y reglas. |
| Reglas, propuestas, memoria | Reglas, aprendizaje, categorías y movimientos/sugerencias. |
| Onboarding | Perfil. |
| Eliminar perfil | Evento de cierre de sesión; AuthProvider cancela y descarta el cliente. |

Se usa cobertura financiera conservadora donde no hay IDs completos de contrapartes. Esto incluye cambios de presentación de categorías y estados de cartola; una futura optimización puede estrechar estas políticas con evidencia. No se asume que aceptar una regla recategorice movimientos históricos: el backend la crea para futuras importaciones.

## Concurrencia y sesión

El coordinador por cliente y ciclo de sesión reúne escrituras solapadas. Cada éxito cancela lecturas afectadas, aplica respuesta y marca datos obsoletos sin fetch. La última operación refresca las consultas activas una sola vez por clave. Los inactivos esperan a su próximo uso. El reordenamiento existente con Promise.allSettled conserva su manejo de errores parciales y recarga local.

Un fallo HTTP no aplica respuestas ni invalida por sí solo. Los éxitos de sus operaciones hermanas sí se reconcilian. Un fallo del refetch no transforma un guardado confirmado en error ni dispara reintentos de escritura. Se rechaza ejecutar una acción capturada por una sesión anterior y se descartan sus respuestas tardías, incluso al reingresar con el mismo usuario.

Las lecturas aún locales conservan sus callbacks de recarga. Al migrar cada pantalla se retirarán esos callbacks: no añadir invalidación en modal, padre y onSuccess. Previsualizaciones de PDF/reglas y exportaciones no son guardados persistentes.

## Validación

- Build de producción y TypeScript de las pruebas correctos; permanece el aviso conocido de tamaño de bundles.
- Políticas, sesión y escrituras: 24/24 pruebas en escritorio/móvil.
- Flujos de UI seleccionados: 17/18 aprobados en la ejecución conjunta; la prueba móvil de movimiento manual falló en una aserción geométrica (304,5 px frente a 302 px) y pasó al repetirla aislada. Se registra como inestabilidad visual; no hubo cambios de CSS ni se relajó la aserción. Los flujos cubren categorías, reordenamiento, propuestas, onboarding bancario, borrados, movimientos y saldo de efectivo, y vinculación/desvinculación.
- Pruebas nuevas: éxito parcial concurrente con un único refetch activo; consultas inactivas sin descarga; aislamiento entre usuarios; parche de respuestas y protección de versiones; retirada de detalles; fallo sin cambios y respuesta tardía tras nueva sesión.
- Se mantienen los 14 fallos preexistentes de la suite general documentados en `verificacion-query-sesion.md`; no se afirma que la suite completa esté verde.

Referencia: [invalidación selectiva de TanStack Query](https://tanstack.com/query/v5/docs/framework/react/guides/query-invalidation).
