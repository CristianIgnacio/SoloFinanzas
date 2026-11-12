# Fase 9: categorías, reglas, importación, modales y perfil

Implementación local del 7 de noviembre de 2026. El [diff de esta fase](changes/fase-9.patch) compara contra el estado al comenzar este prompt, incluyendo archivos ya modificados en fases anteriores. No se crearon commits.

## Cambios

- Categorías conserva consultas independientes de categorías, reglas y catálogo. CategoryLearning consume `learningQueries.patterns`; Movimientos consume `learningQueries.proposals`. El modal resuelve versiones obsoletas mediante esas mismas opciones y la invalidación de escrituras. Desaparece la carga de patrones ligada a cada cambio del catálogo. `fetchQuery` reutiliza propuestas vigentes al cerrar/reabrir y después de reconciliar una escritura.
- Crear/editar/eliminar/previsualizar reglas, decidir propuestas y guardar/eliminar efectivo usan `useExplicitAction`. Este hook ejecuta `useMutation`, bloquea invocaciones simultáneas de la misma acción, desactiva reintentos y hace reset al terminar con `gcTime: 0`. Las escrituras conservan la invalidación central de `useWriteActions`; las previews no invalidan navegación. La preview de reglas descarta respuestas si cambió el formulario.
- Importación conserva catálogo compartido, revisión, advertencias, correcciones y contraseña. Preview y confirmación usan mutaciones temporales y un bloqueo síncrono común. PDF/contraseña no forman parte de claves ni se persisten. Las variables se liberan al terminar cada petición; el formulario mantiene lo necesario durante la revisión y los errores recuperables, y limpia archivo, contraseña y revisión al completar. Al desmontar se liberan los estados del flujo.
- Antes de repetir una confirmación cuyo resultado no se recibió, se consulta `/statements?account_id=...` y se compara `file_checksum`. Si la cartola existe, se invalidan las familias financieras del usuario y se abren sus movimientos sin otro POST. Si la comprobación falla, se bloquea el POST; si no existe, se permite el envío explícito. Se mantienen los controles de duplicados del backend. Esta comprobación vive en el flujo montado: no añade persistencia ni idempotencia del servidor; tras recargar sigue aplicándose la protección de duplicados del backend.
- Perfil mueve `/me/export` a `ProfileService`, lo ejecuta bajo demanda y permite cancelar mediante AbortController, también al desmontar. Conserva la confirmación de identidad reciente para eliminar y la limpieza de sesión de la capa de escrituras. El historial exportado no entra en la caché de navegación. La exportación de Movimientos conserva su cancelación, progreso y comprobación de integridad.
- El impacto de eliminar cartolas continúa como consulta habilitada solo al abrir su modal. La eliminación de categorías conserva contadores compartidos y validación definitiva del backend; no se inventó un endpoint de impacto inexistente.

## Validación

- Build de producción y comprobación TypeScript de las pruebas modificadas.
- Regresión dirigida de beta/importación: **33 aprobadas, 1 omitida** (editor exclusivo de escritorio).
- Respuesta perdida de importación: **4 aprobadas**, cubriendo cartola guardada/no guardada y fallo previo de verificación, en escritorio/móvil.
- Acciones temporales y categorización concurrente: **18 aprobadas**, incluyendo doble invocación, ausencia de reintentos y caché de mutaciones vacía después de completar/fallar.
- Verificación final de perfil, cancelación, acciones y editor: **9 aprobadas, 1 omitida**; comparte casos con las ejecuciones anteriores. En total hay **57 casos distintos aprobados y 1 omitido** en estas selecciones.
- Benchmark de producción simulado: **1 aprobado**. [Registro](measurements/http-phase9-production.json): Inicio frío 9 solicitudes; navegación Cuentas 3, Movimientos 3, Análisis 0, Inicio 0; paginación 1; añadir mes 1/quitar mes 0; guardar categoría 7 (una lectura de propuestas). Estos conteos no cambian respecto de la fase 8: no se atribuye una reducción adicional a este escenario.
- `git diff --check` y `git apply --reverse --check docs/changes/fase-9.patch` verifican formato y correspondencia del diff con los archivos actuales, sin revertirlos.

No se ejecutó nuevamente toda la suite beta: los 14 fallos previos documentados en fases anteriores no se declaran resueltos. Las mediciones usan API simulada, no tráfico del servidor real. Persiste el aviso de bundles mayores a 500 kB.
