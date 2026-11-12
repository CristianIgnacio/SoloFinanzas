# Fase 11: entregas, dependencias y reversión

Fecha: 8 de noviembre de 2026. Este documento cierra la organización operativa de la migración; no autoriza ni registra un despliegue. La [aceptación global](aceptacion-tanstack-query.md) sigue pendiente por 14 fallos beta previos y por la validación del entorno real.

## Estado real de las entregas

HEAD observado: `0c455ef`, rama `codex/correcciones-ux-navegacion`. La implementación sigue en el árbol de trabajo, con archivos modificados y nuevos sin seguimiento. Ese HEAD no es un respaldo completo del estado previo: ya existían cambios locales, incluido Analytics. No se crearon commits, tags ni releases en esta fase.

Los números siguientes son las ocho entregas del punto 11 del plan, no los once pasos de trabajo. Los archivos indicados delimitan responsabilidades; no son listas para añadir automáticamente a Git, porque varios contienen cambios de distintas entregas y cambios previos del usuario.

| Entrega | Pasos realizados | Alcance principal | Dependencias | Evidencia |
| --- | --- | --- | --- | --- |
| E1 · Inventario y medición | 1–2 | `frontend/benchmarks`, inventario y mediciones HTTP | Ninguna | [Inventario](inventario-http-frontend.md), [medición](medicion-http-frontend.md) |
| E2 · Base de Query y sesión | 3–4 | Dependencia y lockfile; AuthProvider; apiClient/apiSession; cliente, claves, políticas y opciones Query | E1 | [Sesión](verificacion-query-sesion.md), [caché](verificacion-query-cache.md) |
| E3 · Escrituras coherentes | 5 | `query/writes.ts`, `invalidation.ts`, servicios y consumidores de escrituras | E2 | [Escrituras](verificacion-query-escrituras.md) |
| E4 · Datos compartidos y cuentas | 6 | `shared.ts`, Accounts, CashAccountPanel, catálogos, cartolas e impacto | E2–E3 | [Cuentas](verificacion-query-cuentas.md) |
| E5 · Dashboard y Análisis | 7 | `months.ts`, useDashboard, Dashboard y Analytics | E4 | [Meses](verificacion-query-meses.md) |
| E6 · Movimientos concurrentes | 8 | Transactions, consulta infinita, versiones y rollback por fila | E3–E5 | [Movimientos](verificacion-query-movimientos.md), [patch 8](changes/fase-8.patch) |
| E7 · Consumidores restantes | 9 | Aprendizaje, propuestas, reglas, importación, efectivo y perfil | E3–E6 | [Consumidores](verificacion-query-consumidores.md), [patch 9](changes/fase-9.patch) |
| E8 · Validación y cierre | 10–11 | Modal de eliminar cuenta, pruebas de aceptación, comparación HTTP y operación | E4–E7 | [Aceptación](aceptacion-tanstack-query.md), [patch 10](changes/fase-10.patch), [patch 11](changes/fase-11.patch) |

E1–E7 están implementadas localmente. E8 tiene verificación y documentación, pero su puerta de aceptación global permanece abierta. Los patches 8–11 registran diferencias entre prompts; no equivalen a ocho commits independientes. No existen patches históricos completos de los pasos 1–7 en `docs/changes`.

## Preparar una entrega revisable

1. Conservar una copia íntegra del árbol actual, incluidos archivos nuevos relevantes. `git diff` por sí solo no contiene los archivos sin seguimiento. Separar `.vscode`, PDFs en `tmp`, credenciales y archivos locales del material de entrega; no eliminarlos ni añadirlos en bloque.
2. Revisar los cambios por responsabilidad con la tabla anterior. Si se preparan commits pequeños, reconstruir cada etapa en una rama/copia aislada, manteniendo los cambios previos del usuario. No repartir archivos compartidos automáticamente entre entregas: revisar sus fragmentos y comprobar cada estado intermedio.
3. Mantener juntos `frontend/package.json` y `package-lock.json`. Instalar desde el lockfile y ejecutar las comprobaciones desde una copia limpia del candidato, no desde un árbol con cambios adicionales.
4. Registrar para cada candidato su commit real, artefacto de frontend, configuración de entorno, resultados de pruebas y versión anterior compatible. Estos identificadores aún no existen para esta migración; no sustituirlos por el HEAD previo observado.

Comprobaciones desde la raíz del candidato:

```powershell
npm --prefix frontend ci
npm --prefix frontend run build
npm --prefix frontend run test:e2e -- --workers=2
npm --prefix frontend run benchmark:http
git diff --check
```

La instalación limpia y esa secuencia completa son requisitos del candidato futuro, no comprobaciones nuevas ejecutadas en este paso documental. Los resultados ya obtenidos están en el informe de fase 10. Antes de promover, resolver los 14 fallos conocidos y repetir la suite completa; no convertirlos en omisiones para lograr un resultado verde.

## Promoción y observación

La migración cambia el frontend; no incorpora migraciones de base de datos ni nuevos contratos backend. Conservar API y esquema compatibles durante promoción y reversión. Seguir la [guía de despliegue existente](despliegue-beta.md) para el entorno del proyecto.

Primero validar un candidato en un entorno de prueba con una cuenta de prueba. Comprobar apertura/cierre de sesión, cambio de usuario, navegación entre cuentas y meses, categorización concurrente/deshacer, importación con advertencias, exportación/cancelación y eliminación. Confirmar saldos, períodos, contadores y propuestas tras cada escritura.

Comparar solicitudes por recorrido, errores HTTP, latencia y resultados financieros contra la misma carga y configuración anteriores. Conservar conteos agregados: no registrar PDF, contraseña, tokens ni descripciones financieras. La medición simulada actual no certifica tráfico real ni coste SQL. Guardar una categoría pasó de 3 a 7 solicitudes por reconciliación; ese coste está documentado y no debe confundirse con un ahorro.

Detener la promoción ante datos de otra sesión, escritura duplicada, saldos/conteos incoherentes, pérdida de revisión del PDF o exportaciones parciales. Cualquier incidente de aislamiento de usuario exige detener la exposición del candidato; no se compensa con una mejora de latencia. No se fijan umbrales de latencia sin una línea base del entorno real.

## Reversión de producción

La opción operativa es restaurar el último artefacto completo de frontend previamente validado y compatible con la API actual. Antes de hacerlo, identificar el despliegue real, su versión anterior y la configuración correspondiente. No se verificó aquí ningún identificador de despliegue ni se accionó producción.

Después de restaurar, recargar las pestañas de prueba para sustituir el JavaScript y el QueryClient en memoria; una pestaña abierta puede seguir ejecutando el bundle anterior. Repetir sesión, navegación y escrituras críticas, y revisar que cesó el incidente. No hace falta vaciar una caché financiera persistida: Query vive en memoria en esta implementación.

Revertir el frontend no deshace operaciones ya confirmadas por el servidor. Ante una importación con respuesta perdida, comprobar cuenta y checksum antes de reenviar. Eliminar una cartola para deshacer una importación es una acción de negocio distinta que requiere revisar su impacto; no forma parte automática de la reversión técnica. No restaurar una base de datos como parte de esta entrega.

## Revertir una pantalla en código

Una corrección selectiva debe hacerse en una rama/copia de trabajo con respaldo, conservando `useWriteActions`, las políticas de invalidación y el ciclo de sesión que siguen usando las otras pantallas. No revertir E2 o E3 mientras existan consumidores de E4–E7. E6 también modifica infraestructura compartida utilizada por meses y escrituras: no tratar su patch como una modificación aislada de Transactions.

Si se recupera una lectura manual anterior para una pantalla, desmontar su consulta Query equivalente para evitar dos consumidores con cargas paralelas, pasar AbortSignal y comprobar que las escrituras continúan renovando las pantallas que permanecen migradas. Si esa adaptación no es comprobable, preferir la reversión del artefacto completo validado.

Revisar el diff resultante, compilar y ejecutar los tests del dominio revertido, sesión, escrituras y aceptación. Si hubo commits posteriores dependientes, preparar una corrección explícita; no ejecutar un revert ciego sobre un commit mezclado. La reversión tampoco debe restaurar Analytics desde HEAD y borrar sus cambios previos.

## Ensayo de patches locales

Se copiaron únicamente los archivos mencionados por los patches 8, 9 y 10 a `tmp/phase11-review/reversal`, se inicializó un repositorio aislado y se ejecutó para cada patch, en orden **10 → 9 → 8**, primero `git apply --reverse --check` y luego `git apply --reverse`. Los seis comandos terminaron con código 0. Se compararon hashes antes/después para comprobar que los archivos originales permanecieron intactos.

Resultado: [registro del ensayo](measurements/reversal-phase11.json). Es una prueba de aplicabilidad textual, no una compilación de los estados históricos ni una prueba de rollback de producción. La copia parcial no incluye el proyecto completo para ejecutar la aplicación.

El ensayo se hizo antes de editar la documentación del paso 11. Para deshacer todos estos pasos en una copia del estado final actual, el orden es **11 → 10 → 9 → 8**, comprobando cada paso antes de aplicarlo. Si hay cambios posteriores o falla una comprobación, detenerse y resolver el diff; no forzar ni descartar archivos. Los patches históricos deben conservarse como evidencia, sin regenerarlos para que encajen en código nuevo.

## Excepciones bajo demanda conservadas

Previsualizar PDF/reglas, confirmar importación, verificar una confirmación incierta y exportar son acciones explícitas. Exportar no carga todo el historial en la caché de navegación. La verificación de duplicados consulta el servidor porque necesita el estado actual. Los efectos de foco, formularios, scroll, modales y preferencias locales no se sustituyen por Query.

El cierre técnico requiere lecturas reutilizables con las opciones comunes, invalidación de dependencias en escrituras, ausencia de efectos de carga duplicados y las excepciones anteriores documentadas. El cierre de publicación requiere además superar la aceptación pendiente; este paso no la declara aprobada.
