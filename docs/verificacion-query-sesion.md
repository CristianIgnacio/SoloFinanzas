**TanStack Query — validación del punto 3**

Implementado el 7 de noviembre de 2026.

AuthProvider posee el cliente Query y el ciclo de transporte. La navegación y renovación de token del mismo usuario conservan el cliente. Un cierre, cambio de usuario o eliminación de cuenta retira el ciclo anterior, cancela lecturas y limpia las cachés de consultas y mutaciones. Las respuestas tardías no se entregan al consumidor, incluyendo errores 401 y respuestas exitosas de escrituras.

El proveedor envuelve ProvisionedApp. `/me` se consulta con Query y bloquea la carga financiera hasta su éxito; Dashboard reutiliza esa respuesta. Onboarding actualiza la elección confirmada en la caché. El perfil permanece vigente cinco minutos y requiere reintento explícito ante un fallo inicial. Las demás consultas todavía usan sus consumidores anteriores.

Los servicios de lectura y las fábricas de opciones reciben AbortSignal. El transporte combina la señal particular con la de sesión, por lo que también se cancelan las lecturas antiguas al salir. ApiRequestError conserva message, code, action, status y retryAfter; los abortos mantienen CanceledError/ERR_CANCELED. No se persiste la caché financiera ni se añaden reintentos de escrituras.

**Pruebas ejecutadas**

- `npm run build`: TypeScript y compilación de producción correctos. Persiste la advertencia de Vite sobre tamaño de chunks.
- Comprobación TypeScript de la nueva prueba y `git diff --check`: correctos.
- `npx playwright test tests/query-session.spec.ts --workers=1`: 8/8 correctas (escritorio y móvil), incluyendo la revisión final que verifica cancelación antes de que responda el servidor y descarte de escrituras exitosas tardías.
- `npx playwright test --workers=2`: 125 correctas, 5 omitidas por condiciones de proyecto y 14 fallidas en pruebas existentes de `beta.spec.ts`. Las ocho pruebas nuevas pasaron también en esta ejecución completa.

La suite nueva verifica bloqueo antes de aprovisionar, una única respuesta completada de `/me` compartida entre consumidores, continuidad al renovar token, reintento explícito, datos estructurados de error, cancelación, cambio de usuario con solicitudes pendientes, descarte de un 401 anterior y un nuevo ciclo al volver a ingresar con el mismo usuario.

**Contraste de los 14 fallos existentes**

Se creó una copia temporal aislada en `tmp/query-session-baseline`, conservando las pruebas y restaurando desde `0c455ef` los archivos de autenticación, transporte, Dashboard, Perfil y servicios modificados en este paso. La copia usó otro puerto y las mismas dependencias. Los seis fallos de escritorio y los ocho móviles se reprodujeron allí, sin la implementación del punto 3.

| Prueba de beta.spec.ts | Escritorio | Móvil | Fallo observado también antes del cambio |
| --- | --- | --- | --- |
| Apariencia de categoría | Falla | Falla | Espera un texto de herencia ausente |
| Restaurar categoría tras fallo | Falla | Falla | Selector `span.line-clamp-1` no encontrado |
| Buscar descripciones con filtros | Falla | Falla | Texto del contador no encontrado |
| Indicadores y gráficos del inicio | Falla | Falla | Expectativa de dimensiones no cumplida |
| Alta de cuenta con producto | Falla | Falla | Matcher de opción deshabilitada |
| Edición de crédito | Falla | Falla | Matcher de opción deshabilitada |
| Bienvenida con efectivo | Pasa | Falla | Enlace de detalle no encontrado en móvil |
| Alias, institución y producto | Pasa | Falla | Enlace de detalle no encontrado en móvil |

Estas pruebas no fueron debilitadas ni se cambiaron componentes ajenos para ocultar los fallos. La suite completa no está verde; el contraste permite separar ese estado previo de la validación de esta entrega.

**Límites**

La cancelación del navegador no revierte escrituras ya recibidas ni garantiza detener trabajo SQL. Descartar una respuesta anterior protege el estado de la sesión nueva. Las pruebas usan API simulada; no validan disponibilidad real de Supabase/Render/PostgreSQL. La política de vigencia para el resto de recursos y las invalidaciones por operación corresponden a los puntos 4 y 5 del plan.
