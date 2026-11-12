**TanStack Query — verificación del punto 4**

Implementado el 7 de noviembre de 2026.

Las fábricas actuales de consultas usan `queryKeys`, `cachePolicies` y `readQuery`. Los sufijos definidos en el plan y los tiempos de vigencia/retención se mantienen centralizados. Las claves de scroll, mes completo y conteo quedan reservadas para los cargadores que se implementarán al migrar sus pantallas.

Los filtros de movimientos se copian y normalizan antes de construir clave y petición: límite predeterminado 50, offset 0, booleanos false, búsqueda recortada y filtros ausentes equivalentes. Cambiar el objeto que recibió la fábrica no cambia su consulta. La normalización no elimina diferencias de cuenta, cartola, fechas, categoría, tipo, búsqueda, exclusión de transferencias o página. `normalizeSelection` permite representar conjuntos como arrays ordenados sin duplicados.

Las lecturas ordinarias reintentan una vez ante ERR_NETWORK, ECONNABORTED, ETIMEDOUT o HTTP 502/503/504. Esperan al menos un segundo y como máximo cinco; una espera Retry-After mayor requiere recuperación explícita. No se reintentan automáticamente otros HTTP, errores desconocidos ni cancelaciones. Perfil, aprendizaje y mutaciones conservan retry false.

HTTP 429 con Retry-After bloquea nuevos envíos de la misma clave hasta vencer el plazo, incluso al recrear opciones y solicitar refetch manual. Se interpreta el encabezado en segundos o fecha HTTP. El almacenamiento es por QueryClient en memoria; una nueva sesión no hereda la espera. No hay reenvío programado ni polling. Un 429 sin plazo válido conserva el error y permite una nueva solicitud explícita.

**Comprobaciones realizadas**

- `npm run build`: correcto; permanece la advertencia existente de Vite sobre chunks grandes.
- TypeScript de la prueba y helper de navegador: correcto.
- `git diff --check`: correcto.
- `npx playwright test tests/query-policies.spec.ts tests/query-session.spec.ts --workers=1`: 18 pruebas correctas, 9 en escritorio y 9 en móvil.

Las pruebas verifican equivalencia de filtros, separación entre usuarios y formas de respuesta, todos los tiempos definidos, dos intentos máximos ante fallos transitorios, ausencia de reintentos en casos excluidos, reutilización real de consultas con API simulada, invalidación explícita, protección frente a mutación externa de filtros, espera 429 y revalidación por foco/reconexión solo cuando los datos están obsoletos. También vuelven a comprobar el aislamiento de sesión del paso 3.

Solo el perfil está conectado actualmente a pantallas mediante Query. Las otras fábricas quedan preparadas; aplicarles estas políticas no cambia todavía sus consumidores antiguos ni reduce sus solicitudes. Las invalidaciones por escritura siguen siendo el siguiente paso. No se ejecutó nuevamente la suite general, cuyos fallos previos están documentados en `verificacion-query-sesion.md`; esta entrega se verificó con las pruebas pertinentes de caché y sesión.
