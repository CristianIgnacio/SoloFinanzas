**Plan de migración de SoloFinanzas a TanStack Query**

Fecha: 7 de noviembre de 2026. Estado: puntos 1, 3, 4, 5, 6, 7, 8 y 9 implementados; punto 2 con inventario y línea base simulada. Punto 10 ejecutado con matriz y comparación de producción: aceptación global pendiente por 14 fallos beta preexistentes y falta de medición del servidor real. Detalle en [validación y aceptación](aceptacion-tanstack-query.md).

Objetivo: reducir solicitudes repetidas, reutilizar datos al navegar y mantener coherencia después de guardar cambios, conservando los flujos actuales de autenticación, categorización, efectivo, importación y análisis.

El diagnóstico se basa en el código local. Las reducciones globales de tráfico y latencia se medirán durante la implementación. Existe un cambio previo en `frontend/src/pages/Analytics.tsx` que debe preservarse.

**1. Arquitectura de destino**

Flujo: pantalla → hooks de consultas/mutaciones → servicios actuales → Axios → FastAPI.

TanStack Query administrará los datos remotos y sus estados de carga/error. Los formularios, selección de filtros, modales, preferencias de gráficos y selección de filas seguirán siendo estado de interfaz. Supabase seguirá gestionando la sesión.

Instalar `@tanstack/react-query` v5 y fijar la versión resuelta en el lockfile. Verificar requisitos de la versión elegida con React 18 y TypeScript del proyecto. Las herramientas de desarrollo de Query serán opcionales y exclusivas del entorno de desarrollo.

Estructura propuesta, relativa a `frontend/src/`:

```text
query/
  createQueryClient.ts
  AuthenticatedQueryProvider.tsx
  keys.ts
  policies.ts
  invalidation.ts
  accounts.ts
  categories.ts
  transactions.ts
  statements.ts
  dashboard.ts
  reports.ts
  profile.ts
  learning.ts
```

Cada módulo agrupará las opciones reutilizables de consulta y los hooks de su dominio. Los servicios conservarán su responsabilidad de transporte; no importarán un cliente global de Query.

**2. Fase inicial: inventario y medición**

Avance del punto 1: dependencia v5 instalada y fijada, módulos `frontend/src/query/` creados, fábricas de opciones por dominio, cliente sin singleton y adaptador de proveedor preparados. Compilación TypeScript y producción verificadas. El proveedor todavía no está conectado al router: autenticación/cancelación completa, políticas por recurso e invalidaciones por operación corresponden a los siguientes puntos. Detalles en `frontend/src/query/README.md`.

- Inventariar todos los GET y todas las escrituras, incluidos modales, propuestas, reglas, exportaciones y llamadas directas a `apiClient` en Perfil.
- Medir entrada al Dashboard, recorrido Dashboard → Cuentas → Movimientos → Análisis → Dashboard, paginación bancaria y de efectivo, selección de meses y guardado de categorías.
- Registrar por recorrido: solicitudes por endpoint, bytes de respuesta y tiempo hasta presentar datos útiles. Separar caché vacía, caché vigente y servidor ya iniciado.
- Distinguir las solicitudes iniciadas, canceladas y completadas. El montaje adicional de StrictMode en desarrollo puede producir una petición cancelada seguida de otra; mantener StrictMode y medir también con compilación de producción.
- Documentar las cifras de referencia y reproducir los mismos datos y filtros al comparar.

Entrega: inventario de consumidores/productores y tabla de mediciones, sin prometer un porcentaje global antes de medir.

Avance del punto 2: [inventario HTTP](inventario-http-frontend.md) generado desde TypeScript y [mediciones de frontend](medicion-http-frontend.md) reproducibles con Playwright. Tres repeticiones de producción y tres de desarrollo; conteos, bytes JSON, tiempos locales y resultados por endpoint en `docs/measurements/`. La API está simulada; el informe explicita la medición pendiente de Render/PostgreSQL.

**3. Base técnica: cliente, errores, cancelación y sesión**

- Crear un `QueryClient` estable por sesión autenticada, dentro de un límite identificado por `session.user.id` y por el ciclo de sesión. Debe sobrevivir a la navegación interna y renovarse tras cerrar sesión, incluso si luego ingresa el mismo usuario.
- Montar el proveedor antes de `ProvisionedApp`. Migrar `/me` a una consulta compartida y conservar el bloqueo de las pantallas financieras hasta completar el aprovisionamiento.
- Reutilizar esa misma consulta en Dashboard. Evitar el segundo GET de perfil inmediato que existe actualmente.
- No recrear el cliente por render, cambio de ruta ni renovación del token del mismo usuario.
- Al salir, expirar sesión o eliminar el usuario: impedir nuevas consultas, cancelar lecturas, limpiar cachés de consultas/mutaciones y descartar el cliente anterior. Las respuestas tardías y callbacks de escrituras anteriores no podrán alterar el cliente de la nueva sesión.
- Mantener la caché financiera en memoria. No incorporar persistencia en localStorage ni sincronización entre pestañas durante esta migración.
- Añadir `AbortSignal` opcional a los GET de los servicios y propagarlo hasta Axios. `getPage` ya ofrece ese argumento; extender el mismo mecanismo a los demás métodos.
- Ajustar `apiClient.ts`: conservar el estado HTTP, código de aplicación y encabezados necesarios para reintentos; preservar los errores de cancelación en lugar de convertirlos en un mensaje de conexión fallida.
- Un aborto del navegador no garantiza detener una consulta SQL o un procesamiento que el servidor ya comenzó. Tampoco revierte una escritura.

La integración de `signal` con Axios está documentada en [Query Cancellation](https://tanstack.com/query/latest/docs/framework/react/guides/query-cancellation).

Avance del punto 3: proveedor conectado a AuthProvider, cliente por ciclo de sesión, `/me` compartido con Dashboard, limpieza/cancelación al salir y descarte de respuestas tardías. Todos los GET de servicios aceptan señal y los errores conservan estado HTTP, código, acción y Retry-After. [Validación y alcance](verificacion-query-sesion.md). Las políticas generales por recurso y reintentos selectivos siguen en el punto 4.

**4. Claves y políticas de caché**

Todas las claves de negocio comenzarán con `['user', userId]`. Usar una fábrica central y opciones compartidas para que diferentes pantallas no configuren de manera contradictoria el mismo recurso.

| Recurso | Sufijo de clave propuesto | `staleTime` inicial | `gcTime` inicial |
| --- | --- | --- | --- |
| Perfil | `['profile']` | 5 min | 15 min |
| Productos financieros | `['account-products']` | 24 h | 30 min |
| Cuentas y cuenta de efectivo | `['accounts']`, `['cash-account']` | 5 min | 15 min |
| Categorías | `['categories', { includeInactive }]` | 2 min | 15 min |
| Reglas y vista previa del catálogo | `['rules', { categoryId }]`, `['category-catalog']` | 2 min | 15 min |
| Cartolas | `['statements', { accountId }]` | 2 min | 15 min |
| Períodos disponibles | `['reports', 'periods', { statementId }]` | 2 min | 15 min |
| Saldo y totales | `['cash-balance']`, `['reports', 'accounts']` | 30 s | 10 min |
| Resumen Dashboard | `['dashboard', { requestedPeriod }]` | 30 s | 10 min |
| Página de movimientos | `['transactions', 'page', filtersWithOffset]` | 30 s | 10 min |
| Movimientos con scroll | `['transactions', 'infinite', filtersWithoutOffset]` | 30 s | 10 min |
| Mes completo para gráficos | `['transactions', 'month', period]` | 60 s | 5 min |
| Conteo sin categoría | `['transactions', 'uncategorized-count', period]` | 30 s | 10 min |
| Patrones, memoria y propuestas | `['learning', resource]` | 30 s | 5 min |
| Impacto de eliminar cartola | `['statement-impact', statementId]` | 0 | 1 min |

Son valores de partida sujetos a medición. `staleTime` define cuándo los datos dejan de considerarse vigentes; `gcTime` controla cuánto permanecen las consultas inactivas en memoria. Vencer `staleTime` no dispara una petición por sí solo. Ver [valores predeterminados](https://tanstack.com/query/latest/docs/framework/react/guides/important-defaults).

- Las claves incluirán todos los filtros que afectan la respuesta: cuenta, cartola, fechas, tipo, categoría, búsqueda, exclusión de transferencias, límite y offset según corresponda.
- Normalizar filtros opcionales; convertir conjuntos a arrays ordenados cuando deban entrar en una clave. No usar objetos `Set`, tokens, contraseñas ni archivos como claves.
- Separar claves de páginas normales, listas infinitas y meses completos: sus respuestas tienen estructuras distintas.
- Revalidar lecturas ordinarias obsoletas al montar, recuperar conexión o volver a la ventana; sin polling ni precarga general de páginas.
- Para patrones/propuestas, desactivar recarga por foco y reintentos automáticos inicialmente: sus GET actuales sincronizan estado y hacen `commit`. Mantener consultas al entrar e invalidación tras decisiones; evaluar hacerlos lecturas puras como trabajo backend posterior.
- Reintentar una sola vez los GET ordinarios ante un fallo de red o un 502/503/504, con espera acotada. No reintentar automáticamente 400/401/403/404/409/422 ni cancelaciones. Ante 429, respetar el tiempo indicado y permitir reintento explícito.
- `/me` conservará recuperación explícita durante aprovisionamiento. Las mutaciones y procesamiento PDF usarán `retry: false`; evitar repetir escrituras cuyo resultado quedó incierto por pérdida de conexión.

**5. Preparar las escrituras antes de compartir lecturas**

Avance del punto 4: `queryKeys` y `cachePolicies` centralizados, filtros de movimientos normalizados y copiados, claves separadas por formato, reintentos transitorios acotados y espera Retry-After para 429. Todas las fábricas actuales utilizan estas políticas. Claves/políticas de scroll y meses están preparadas para sus futuras implementaciones; no se migraron pantallas adicionales. Compilación y comprobación TypeScript correctas; 18/18 pruebas de políticas y sesión aprobadas en escritorio/móvil. Detalle en [verificación de caché](verificacion-query-cache.md).

Crear una política central de invalidación por operación. Conectar todos los puntos que guardan datos a esa política, incluidos los que temporalmente mantengan lecturas antiguas. Esta conexión puede hacerse primero mediante hooks de mutación compartidos o llamadas explícitas al helper tras guardar.

Una pantalla aún no migrada puede modificar información que otra ya almacena en caché. Por eso esta fase precede a la migración masiva de GET. Cada escritura ejecutará una única política; evitar que modal, página y callback invaliden el mismo recurso por separado.

| Operación | Actualización directa e invalidaciones necesarias |
| --- | --- |
| Crear/editar cuenta | Aprovechar la respuesta en cuentas; invalidar variantes y reportes afectados. |
| Eliminar cuenta | Retirar cuenta y cachés de detalles; invalidar cartolas, movimientos, períodos, resúmenes, categorías con contadores, aprendizaje y efectivo afectado. |
| Crear cartola o cambiar su estado | Invalidar listados de cartolas afectados; ampliar si la operación modifica movimientos. |
| Importar PDF o crear movimientos individuales/en lote | Invalidar cartolas, movimientos, períodos, dashboard, totales, saldo afectado, categorías con uso, aprendizaje e impactos de eliminación. |
| Eliminar cartola | Lo anterior más detalles de la cartola eliminada y contrapartes de efectivo/transferencias afectadas. |
| Crear/editar/eliminar movimiento manual | Invalidar movimientos, saldo, totales, períodos, dashboard, categorías con uso, aprendizaje e impactos afectados. Considerar fecha/cuenta anteriores y nuevas. |
| Vincular/desvincular efectivo | Invalidar ambas cuentas, movimientos, saldo, resúmenes, períodos, categorías con uso e impactos; renovar aprendizaje si cambia su evidencia. |
| Cambiar/confirmar/deshacer categoría | Aplicar respuesta al movimiento; invalidar listas, meses, resúmenes, categorías con uso, propuestas, patrones, memoria e impactos afectados. El backend puede recalcular transferencias internas. |
| Cambiar/quitar saldo inicial | Actualizar el saldo con la respuesta; invalidar representaciones de cuenta y consumidores cuyo resultado dependa del saldo inicial. |
| Crear/editar/archivar/eliminar/fusionar categoría | Invalidar categorías y catálogo; actualizar reglas/aprendizaje relacionados. En fusiones o cambios semánticos, renovar movimientos, meses, resúmenes e impactos afectados. |
| Crear/editar/eliminar regla o decidir propuesta | Invalidar reglas, patrones, propuestas, memoria y contadores de categorías. Renovar movimientos cuando cambien sus metadatos/sugerencias; no asumir recategorización retroactiva sin verificar el servicio. |
| Olvidar memoria | Invalidar memoria, patrones, propuestas y sugerencias de movimientos. |
| Cambiar onboarding | Actualizar o invalidar perfil compartido. |
| Eliminar usuario/cerrar sesión | Descartar todas las cachés de esa sesión. |

La selección exacta de cuentas y meses depende de lo que confirme cada respuesta. Si el backend no expone todos los IDs afectados por transferencias o aprendizaje, invalidar la familia financiera correspondiente del usuario. Refinar después con evidencia; no limitar por intuición al único movimiento editado.

Marcar inactivas como obsoletas sin descargarlas inmediatamente. Recargar las activas que lo necesiten y agrupar operaciones rápidas —por ejemplo, reordenar categorías— para una reconciliación al finalizar el grupo. Si hay éxito parcial, reconciliar los cambios confirmados y mostrar los fallos.

No ejecutar `invalidateQueries()` sin filtro tras cada guardado. La [invalidación selectiva](https://tanstack.com/query/latest/docs/framework/react/guides/query-invalidation) permite actualizar familias concretas.

Avance del punto 5: todos los guardados existentes usan `useWriteActions`, con políticas centrales por operación, actualización de respuestas, retiro de detalles eliminados, agrupación concurrente y aislamiento de sesión. Las lecturas locales se mantienen hasta su fase de migración. Ver [verificación de escrituras](verificacion-query-escrituras.md).

**6. Migrar cuentas, efectivo y datos compartidos**

- Sustituir `useAccountProducts` y lecturas repetidas de cuentas, categorías, efectivo, perfil y períodos por hooks comunes.
- Migrar `Accounts.tsx` y `CashAccountPanel.tsx`: separar consulta de movimientos paginados, cartolas por cuenta, totales y saldo.
- Cambiar `pageOffset` solo afectará a los movimientos. Cambiar de cuenta reiniciará la paginación sin solicitar primero el offset anterior.
- Mantener temporalmente filas previas únicamente al paginar la misma cuenta con los mismos filtros, identificando la carga. Al cambiar de cuenta, no presentar movimientos anteriores bajo el nuevo título.
- Actualizar formularios de cuentas, saldo y movimientos manuales, junto a sus modales de eliminación/vínculo.
- El saldo compartido sustituirá la sincronización duplicada por `onBalanceChange` cuando todos sus consumidores estén migrados.

Criterio de salida: con cartolas y totales vigentes, avanzar una página bancaria o de efectivo genera un GET de movimientos y cero GET adicionales de cartolas, totales o saldo.

Avance del punto 6: hooks compartidos conectados a todos los consumidores de cuentas, productos, categorías, efectivo/saldo y períodos; Accounts y CashAccountPanel usan consultas independientes. Se retiraron onBalanceChange y las recargas locales de las vistas migradas. Paginación verificada en escritorio/móvil: un GET de movimientos y cero de cartolas/totales/saldo. Registro de medición y límites en [verificación de cuentas y datos compartidos](verificacion-query-cuentas.md).

**7. Migrar Dashboard y Análisis**

- `useDashboard` será una consulta declarativa. Esperar `data.period_month` antes de pedir movimientos y conteos dependientes; los catálogos independientes podrán cargar en paralelo después de `/me`.
- Extraer un único cargador de mes completo que reutilicen Dashboard y Análisis, propagando cancelación a cada página. Guardar un mes en caché como completo solamente cuando termine correctamente todo su recorrido.
- En Análisis, usar consultas por mes seleccionado y un límite inicial de dos meses en descarga simultánea. Reutilizar meses vigentes; solicitar solo los nuevos u obsoletos.
- Si no hay meses seleccionados, no consultar movimientos. Mantener los filtros que actualmente se aplican en el navegador como operaciones locales sobre los meses cargados.
- Preservar los widgets, exclusiones, búsqueda, orden y filtros actuales, incluidos los cambios locales preexistentes.
- Conservar el último conjunto completo mostrado si falla otro mes y etiquetar qué períodos se están mostrando. No sumar silenciosamente meses parcialmente cargados ni interpretar errores como importes cero.
- Para gráficos, comprobar que todas las consultas requeridas estén disponibles antes de reemplazar el conjunto visible. Mantener separadas selección solicitada y selección efectivamente mostrada.

Criterio de salida: seleccionar A, después A+B y volver a A, dentro de vigencia, descarga A una vez y B una vez; volver desde Dashboard a Análisis puede reutilizar el mismo mes completo. Los meses que excedan una página siguen requiriendo sus páginas HTTP.

Avance del punto 7: resumen declarativo, un único cargador mensual paginado, máximo dos meses concurrentes por cliente y cancelación en páginas/cola. Dashboard espera el período del servidor; Análisis consulta por mes y ambos reutilizan la caché. La visualización solo cambia cuando están completos todos los datos solicitados y conserva/identifica el último conjunto ante error. Ver [verificación de Dashboard y Análisis](verificacion-query-meses.md).

**8. Migrar Movimientos y categorización concurrente**

- Sustituir el manejo manual de páginas por `useInfiniteQuery`, con `initialPageParam: 0`. Derivar el próximo offset de la respuesta y terminar al alcanzar `total` o recibir una página vacía.
- Mantener el debounce de búsqueda de 300 ms. Cada combinación de filtros tendrá su propia clave y un cambio reiniciará el scroll correctamente.
- Pedir otra página solo con `hasNextPage && !isFetching`. Evitar solicitudes simultáneas del observador y una revalidación en curso.
- Conservar `category_version`, `expected_version`, confirmación y deshacer. Actualizar desde la respuesta completa del servidor.
- Para cambios optimistas, cancelar lecturas que puedan sobrescribirlos y guardar el valor anterior del movimiento afectado. Revertir solo esa edición si falla; restaurar una lista completa puede borrar cambios exitosos concurrentes en otros movimientos.
- Impedir dos escrituras simultáneas sobre el mismo movimiento, permitiendo editar movimientos distintos. Una respuesta tardía no debe sobrescribir una versión posterior.
- Ante 409, mostrar el conflicto y renovar el dato; no repetir automáticamente la escritura con una versión nueva.
- Reconciliar las listas filtradas: cambiar una categoría puede sacar un movimiento del filtro o cambiar el total. Actualizar el objeto por sí solo no corrige la pertenencia a una página.
- Una lista infinita obsoleta puede reconsultar todas sus páginas cargadas. Agrupar invalidaciones durante una ráfaga de ediciones y medir ese coste. Inicialmente preservar el scroll y la corrección; considerar límites de páginas solo si se mantiene la navegación esperada.

Referencias: [listas infinitas](https://tanstack.com/query/latest/docs/framework/react/guides/infinite-queries) y [actualizaciones optimistas](https://tanstack.com/query/latest/docs/framework/react/guides/optimistic-updates).

Avance del punto 8: Movimientos utiliza useInfiniteQuery y categorización mediante mutaciones, con debounce de 300 ms, bloqueo por ID, rollback individual, versiones y 409 sin reenvío. Las escrituras concurrentes reconcilian las páginas activas una vez al finalizar el grupo; se conservan scroll y exportaciones bajo demanda. Ver [verificación de Movimientos](verificacion-query-movimientos.md) y [diff exclusivo de la fase 8](changes/fase-8.patch).

**9. Migrar categorías, reglas, importación, modales y perfil**

- Reemplazar `loadData` completo en Categorías por consultas independientes de categorías, reglas y catálogo. Los contadores de uso forman parte de categorías y deben renovarse al cambiar movimientos o reglas.
- Centralizar patrones/propuestas para que la página, `CategoryLearning` y `CategoryProposalModal` no hagan recargas redundantes. Conservar versiones y conflictos de las decisiones.
- Convertir guardar reglas, decidir propuestas y previsualizar reglas en acciones explícitas mediante mutaciones. Cargar el impacto de eliminación solo al abrir el modal; el backend sigue validando la eliminación definitiva.
- En Importación, reutilizar cuentas/productos/categorías y ejecutar preview/confirmación como acciones explícitas. Conservar el estado de revisión y el manejo de advertencias/password.
- No guardar PDF ni contraseña en claves, persistencia o registros. Si se pasan en variables de una mutación, limitar su vida, usar `gcTime: 0` para esas operaciones y limpiar referencias/estado al terminar o cerrar el flujo.
- Evitar doble envío mientras hay una importación pendiente. Un timeout de confirmación requiere verificar el resultado antes de volver a enviar, apoyándose en los controles actuales de duplicados.
- Mantener las exportaciones como operaciones bajo demanda con cancelación, progreso y comprobación de consistencia. No rellenar la caché de navegación con todo el historial exportado.
- Migrar las operaciones directas de Perfil a su servicio, conservar autenticación reciente para eliminar y aplicar la limpieza de sesión.

**10. Validación y condiciones de aceptación**

Avance del punto 9: patrones/propuestas comparten opciones Query entre consumidores; reglas, decisiones, importación, modal de efectivo y perfil usan acciones explícitas sin reintento. Las mutaciones temporales se liberan al finalizar. Importación verifica cuenta/checksum tras una respuesta incierta antes de reenviar. Perfil exporta a través de su servicio y permite cancelar. Detalle en [verificación de fase 9](verificacion-query-consumidores.md) y [diff exclusivo de fase 9](changes/fase-9.patch).

Ampliar Playwright existente con interceptación y contadores de solicitudes. Añadir pruebas focalizadas de QueryClient/políticas si los casos de concurrencia no quedan cubiertos de forma fiable en navegador; no incorporar otro framework por defecto.

| Caso | Resultado exigido |
| --- | --- |
| Navegar entre pantallas con datos vigentes | Reutilizar cuentas/categorías/productos y perfil; ninguna recarga redundante por consumidor. |
| Abrir sesión | Aprovisionar antes de lecturas financieras; reutilizar `/me`. |
| Cambiar usuario con respuestas en vuelo | Cero datos y efectos tardíos del usuario anterior en la nueva sesión. |
| Paginar cuentas/efectivo | Un GET de página; cero recargas de recursos independientes vigentes. |
| Seleccionar y quitar meses | Solo meses faltantes/obsoletos; selección vacía sin consulta de historial. |
| Fallar un mes | Mantener último conjunto completo con períodos correctos y reintento. |
| Cambiar filtros rápido | Cancelación/aislamiento de respuestas; no mostrar datos de otro filtro. |
| Scroll y refresco simultáneo | Sin duplicados, saltos evitables ni páginas reemplazadas por una carrera. |
| Editar dos movimientos y fallar uno | Solo se revierte el fallido; se conserva el otro. |
| Confirmar/deshacer categoría y conflicto 409 | Versiones coherentes, propuestas actualizadas y conflicto recuperable. |
| Importar/eliminar cartola o cuenta | Saldos, transferencias, totales, categorías con uso y períodos coherentes. |
| Cambiar categoría con filtro activo | Lista, pertenencia y conteos correctos. |
| Recuperar foco/conexión | Refrescar según vigencia; sin bucles de reintentos o escrituras duplicadas. |
| Exportar/cancelar | Conservar progreso, cancelación y controles de cambios durante descarga. |
| Preview/importación fallida | Conservar revisión útil; sin reenvío automático ni retención innecesaria del PDF/password. |

Ejecutar `npm run build` y las pruebas Playwright de escritorio/móvil, incluidas `beta.spec.ts`, `analytics-filters.spec.ts` e `import-responsive.spec.ts`. Ejecutar pruebas backend pertinentes si se modifica algún contrato o servicio. Comparar las mediciones contra la fase inicial en una compilación de producción.

**11. Entregas, dependencias y reversión**

Punto 11 preparado el 8 de noviembre de 2026: [guía operativa de entregas y reversión](entregas-reversion-tanstack-query.md), con dependencias reales, criterios de promoción y ensayo aislado de los patches 10 → 9 → 8. Los cambios siguen sin commits; no se desplegó ni revirtió el árbol de trabajo. La aceptación global del punto 10 continúa pendiente. Cambios de este paso en [patch 11](changes/fase-11.patch).

| Entrega | Contenido | Depende de |
| --- | --- | --- |
| 1 | Inventario, mediciones y pruebas de recorridos críticos | — |
| 2 | Dependencia, claves, políticas, errores, cancelación, proveedor y `/me` | 1 |
| 3 | Política de invalidación conectada a todas las escrituras existentes | 2 |
| 4 | Datos compartidos, Cuentas, Efectivo y formularios asociados | 3 |
| 5 | Dashboard y Análisis con caché por mes | 4 |
| 6 | Movimientos, scroll, categorización y deshacer | 3–5 |
| 7 | Categorías/reglas/aprendizaje, Importación, modales y Perfil restantes | 3–6 |
| 8 | Limpieza de mecanismos anteriores, pruebas completas y comparación | 4–7 |

Cada entrega debe compilar y pasar sus recorridos antes de avanzar. Durante la convivencia no ejecutar simultáneamente el efecto antiguo y la consulta nueva para el mismo consumidor. Retirar `refreshKey`, `isMounted` y estados remotos duplicados solo cuando su responsabilidad esté cubierta; conservar efectos de interfaz legítimos.

Preparar cambios pequeños y reversibles, sin migración de base de datos. Si una pantalla presenta una regresión, revertir su entrega conservando la invalidación de las escrituras que otras pantallas necesitan. En un despliegue real, revisar errores y mediciones antes de promover la siguiente entrega.

La migración termina cuando todas las lecturas remotas reutilizables usan las políticas comunes, todas las escrituras actualizan/invalidadan sus dependencias y las excepciones bajo demanda están documentadas. No se exige convertir cada `useEffect` ni cada descarga de archivo en una consulta cacheada.

**12. Mejoras posteriores separadas**

TanStack Query reduce repeticiones y coordina estado remoto; no reduce por sí solo el tamaño de la primera descarga de todos los movimientos del mes ni el coste SQL de cada endpoint.

Tras medir la migración, evaluar resúmenes por día/categoría/cuenta calculados en FastAPI, respuestas compactas para gráficos, GET puros de propuestas/patrones y un flujo PDF que evite reprocesar el mismo documento en preview y confirmación. Estos trabajos requieren revisar contratos y pruebas backend por separado.
