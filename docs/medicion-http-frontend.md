**Línea base HTTP antes de migrar los consumidores a TanStack Query**

Fecha del conjunto de datos: 7 de noviembre de 2026. La aplicación todavía realiza sus consultas mediante los efectos y servicios anteriores; los módulos Query del paso 1 no están montados.

El inventario reproducible está en [inventario-http-frontend.md](inventario-http-frontend.md): 53 puntos de transporte, 20 GET y 33 operaciones restantes. Cada entrada indica endpoint, definición y consumidores; las fábricas de opciones de `src/query` se identifican como consumidores preparados, no activos.

**Disparadores y dependencias observados**

| Consumidor | Disparador de lectura | Escrituras/acciones que alteran lo mostrado |
| --- | --- | --- |
| Aprovisionamiento | Montaje autenticado, reintento | `/me` puede aprovisionar; onboarding actualiza perfil |
| Dashboard | Montaje; respuesta/cambio de período | Crear cuenta, comenzar con efectivo; importación, categorías, movimientos y vínculos desde otras pantallas |
| Cuentas | Montaje; cuenta seleccionada y offset | Crear/editar/eliminar cuenta; eliminar cartola |
| Efectivo | Cuenta, offset y refreshKey | Saldo inicial, movimiento manual, vínculo/desvínculo |
| Movimientos | Montaje; filtros; debounce 300 ms; scroll | Categorizar, confirmar, deshacer, registrar/editar/eliminar efectivo, vincular/desvincular y decidir propuestas |
| Análisis | Montaje/reintento; conjunto de meses | Importación/categorización/efectivo en otras pantallas; filtros locales recalculan sin HTTP |
| Categorías | Montaje y loadData después de guardar | Crear/editar/archivar/eliminar/fusionar/reordenar categorías; CRUD de reglas; preview explícita |
| Aprendizaje y propuestas | Montaje; correcciones; cierre/decisión de propuestas | Decisiones, olvido de memoria y cambios en evidencias; algunos GET sincronizan estado |
| Importación | Montaje; preview explícita | Confirmación revisada del PDF; correcciones locales de candidatos |
| Modales de eliminación | Apertura | Confirmación de eliminar cuenta/cartola |
| Exportación | Solicitud explícita y páginas hasta completar alcance | No modifica los datos; conservar cancelación y comprobación de consistencia |
| Perfil | Exportación explícita | Eliminar usuario; sesión de Supabase fuera del inventario de apiClient |

Las operaciones sin consumidor activo quedan registradas igualmente: son contratos que deben contemplarse al añadir invalidaciones. La matriz detallada de dependencias por escritura sigue en el punto 5 del plan.

**Qué mide este benchmark**

- Chromium de escritorio, un worker y contextos nuevos por repetición. Tres repeticiones por modo.
- Producción: `tsc -b` + Vite build + preview. Desarrollo: Vite con StrictMode. Mismo fixture, fecha y recorridos en ambos.
- 500 movimientos: dos cuentas (bancaria y efectivo), dos meses, 125 movimientos por cuenta/mes; una categoría. Respuestas paginadas y actualización de categoría con estado.
- API simulada dentro de Playwright, con 20 ms de espera por respuesta. No utiliza credenciales reales, PostgreSQL, Render ni datos personales.
- Inicio en contexto vacío, navegación SPA con el mismo contexto y regreso al Dashboard. Esto permite comparar caché fría y reutilización tras la futura migración; actualmente no hay una caché Query activa.
- Paginación bancaria y de efectivo, agregar/quitar septiembre en Análisis y guardar una categoría en Movimientos.
- Contadores por método y ruta de solicitudes iniciadas, completadas, canceladas, fallidas y pendientes. El endpoint omite parámetros y los registros no incluyen headers, tokens ni cuerpos.
- `decodedBytes`: bytes del cuerpo de respuesta descomprimido obtenido por Playwright. No representa bytes efectivos sobre la red, headers ni assets.
- `uiCheckpointMs`: tiempo hasta el punto de interfaz comprobado por el test (datos de cuenta, movimiento visible, panel de análisis, detalle de efectivo o confirmación de guardado). No equivale a LCP ni a carga completa de gráficos. En cambios de meses se verifica también que termine el estado de carga.
- `apiCompleteMs`: tiempo desde la acción hasta terminar la última solicitud API de esa acción. Se espera además una ventana de quietud de 200 ms para capturar consultas encadenadas; esa espera no se suma a `apiCompleteMs`.

El panel de Análisis puede conservar datos anteriores durante una carga: interpretar su checkpoint junto con `apiCompleteMs`, no como prueba aislada de frescura. Los tiempos incluyen automatización local y varían; las cantidades y tamaños son la referencia principal para esta migración.

**Resultados registrados**

Tres repeticiones exitosas por modo, con conteos y bytes idénticos entre repeticiones. Los tiempos son medianas de producción, en milisegundos, bajo la simulación descrita arriba.

| Acción | Solicitudes producción | Solicitudes desarrollo | Bytes JSON producción | Checkpoint UI ms | Última respuesta API ms |
| --- | ---: | ---: | ---: | ---: | ---: |
| Dashboard, contexto vacío | 16 | 24 | 55666 | 533 | 298 |
| Navegar a Cuentas | 8 | 13 | 11374 | 225 | 183 |
| Navegar a Movimientos | 6 | 12 | 11127 | 158 | 96 |
| Navegar a Análisis | 5 | 9 | 54499 | 317 | 161 |
| Volver a Inicio | 15 | 23 | 55594 | 201 | 126 |
| Página siguiente bancaria | 3 | 3 | 10944 | 134 | 96 |
| Página siguiente de efectivo | 3 | 3 | 11213 | 133 | 106 |
| Agregar septiembre a octubre | 2 | 2 | 108320 | 108 | 139 |
| Quitar septiembre | 1 | 1 | 54160 | 88 | 96 |
| Guardar categoría | 3 | 3 | 11020 | 171 | 176 |

En el Dashboard frío de producción `/me` se solicita tres veces: aprovisionamiento y dos cargas complementarias. Cuentas, categorías, efectivo y saldo se solicitan dos veces. La fecha fija está en noviembre y el último mes con movimientos es octubre: el cambio del período provisional al resuelto reproduce la doble carga.

Al paginar la cuenta bancaria se consultan movimientos, cartolas y totales. En efectivo se consultan movimientos, saldo y totales. Guardar categoría produce un PATCH y dos GET (lista visible y propuestas). Al agregar septiembre se descargan nuevamente octubre y septiembre; al quitarlo se vuelve a descargar octubre.

Datos por endpoint y repetición: [producción](measurements/http-baseline-production.json) y [desarrollo](measurements/http-baseline-development.json). Los 53 puntos del inventario son definiciones estáticas y no deben confundirse con solicitudes emitidas durante un recorrido.

**Reproducción en PowerShell, desde frontend**

```powershell
npm run inventory:http
npm run benchmark:http -- --repeat-each=3
node benchmarks/report.mjs production
$env:BENCH_MODE = 'development'
npm run benchmark:http -- --repeat-each=3
node benchmarks/report.mjs development
Remove-Item Env:BENCH_MODE
```

Playwright debe tener Chromium instalado. El benchmark usa el puerto 4183 y exige disponer de él. La configuración de autenticación simulada se fija durante la compilación; no reutilizar ese `dist` para desplegar: ejecutar una nueva compilación con la configuración real.

Los resultados de cada ejecución quedan como adjuntos JSON en `frontend/test-results/benchmark-<modo>`. El script `report.mjs` copia esos adjuntos a `docs/measurements/http-baseline-<modo>.json` y calcula medianas. Ejecutar ese script solo al registrar una referencia deliberadamente; para comparar una migración, conservar estos JSON originales y leer los nuevos adjuntos por separado.

**Validación y límites**

Las pruebas comprueban que el recorrido produce contenido, que no hay solicitudes pendientes/fallidas al cerrar cada medición y que todos los endpoints utilizados tienen un fixture explícito. Los fallos de red, reintentos y carreras entre usuarios pertenecen a la fase de migración, no a esta referencia de tráfico normal.

El servidor real sigue sin medirse. Para esa medición usar una cuenta de prueba y los mismos datos/filtros, registrar si la API está recién iniciada o ya activa y repetir al menos tres veces. Medir por separado tiempo de API y SQL; no atribuir los 20 ms simulados al rendimiento real. Guardar categorías solo en esa cuenta de prueba. No publicar HAR con tokens o datos financieros.

La base permite evaluar reducción de llamadas, volumen de JSON y efectos de StrictMode. No permite afirmar una mejora de latencia de Render ni ahorro de recursos PostgreSQL antes de medir esos servicios.
