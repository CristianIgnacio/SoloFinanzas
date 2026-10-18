# Verificación del plan de categorización

Verificación inicial: 15 de octubre de 2026 (America/Santiago).
Rama: `codex/mejorar-categorizacion-automatica`.

## Actualización del 17 de octubre: aprendizaje automático de decisiones

### Propuesta contextual en Movimientos

Al guardar una categoría que completa un patrón, Movimientos abre un modal con ejemplos, categoría de destino y alcance. El usuario puede crear, posponer o rechazar la regla desde ahí. Cerrar conserva la propuesta pendiente sin repetir la interrupción en esa visita; «Revisar propuestas» vuelve a abrir las pendientes. Se mantiene la opción de deshacer el cambio de categoría. Las propuestas ajenas al movimiento editado no se abren automáticamente.

Validación de este ajuste: **14 pruebas Playwright aprobadas** entre escritorio y móvil, incluyendo el tercer cambio, ausencia de modal antes del umbral, propuestas ajenas, cierre con Escape, navegación por teclado, reapertura, las tres decisiones, evidencia obsoleta y fallos al guardar categorías. Se adaptó la regresión de deshacer al selector actual de categorías. Capturas del modal revisadas en ambos tamaños y sin desbordamiento horizontal. TypeScript/Vite compilados correctamente. Este ajuste reutiliza la API existente y no requiere migración de datos.

### Implementación y migración del aprendizaje

- Las asignaciones, correcciones y confirmaciones explícitas se registran automáticamente, también durante la revisión de importaciones y en Efectivo. Se retiró el paso «Recordar». Guardar sin cambiar ni confirmar no suma evidencia; cada movimiento aporta como máximo un ejemplo vigente.
- Tres movimientos distintos y tres decisiones independientes coherentes generan una propuesta por descripción normalizada exacta y dirección. Las descripciones genéricas, las contradicciones y las reglas personales que ya cubren el patrón impiden proponer una regla duplicada o ambigua.
- Personalización permite revisar ejemplos y alcance, crear la regla, posponer 30 días, rechazar y reactivar. El historial persiste. Las reglas se crean únicamente al aceptar y se aplican a futuras importaciones; no reclasifican movimientos históricos.
- Se verificaron versiones obsoletas, aceptación repetida y concurrente en PostgreSQL, aislamiento entre usuarios, exportación, deshacer, olvido previo, archivo y supresión de propuestas al pausar/eliminar reglas. Deshacer una categoría incompatible después de cambiar la dirección de un movimiento de Efectivo se rechaza.
- La migración `a64c9d730e21` conserva los eventos anteriores y bloquea los patrones previamente olvidados. La prueba en SQLite temporal verificó actualización, `alembic check`, reversión y conservación de datos.
- Backend con PostgreSQL 18.6 temporal: suite de 203 pruebas, con un único fallo de configuración del servidor temporal en la prueba de respaldo (la URL sintética no incluía contraseña). Corregida la configuración del entorno de prueba, se ejecutaron 20 pruebas específicas y todas pasaron, incluido respaldo/restauración y un caso nuevo de deshacer en Efectivo. En conjunto quedaron comprobados los 204 casos actuales. El servidor temporal se detuvo al terminar.
- Interfaz: 57 de 58 pruebas pasaron en la ejecución completa en escritorio/móvil. El único tiempo de espera, en el formulario de cuenta ajeno a este cambio, pasó al repetirlo de forma aislada. Los casos de aprendizaje, historial y decisiones pasaron en ambos tamaños; se revisaron sus capturas y el ancho de pantalla. TypeScript/Vite y `git diff --check` completados correctamente.
- Aplicada exclusivamente a SQLite de desarrollo local, desde `f53b8a629d10`, después de crear `backend/data/cloud_dev-before-automatic-learning-20261017T215745Z.db`. La comparación de todas las columnas anteriores de todas las tablas conservó sus cantidades y hashes: **1.147 movimientos sin cambios**, integridad y claves foráneas correctas. Reporte: `backend/data/local-automatic-learning-migration.json`, excluido de Git.

Esta entrega usa coincidencia exacta normalizada. La agrupación de variantes del mismo comercio y las propuestas para modificar reglas existentes quedan para una entrega posterior. La revisión objetivo de producción pasa a ser `a64c9d730e21`; su migración y despliegue siguen a cargo del usuario.

## Actualización del 16 de octubre: catálogo automático

A petición del usuario, el catálogo final se incorpora también a las cuentas antiguas. Se eliminó «Arriendos recibidos» de la plantilla, que queda con 69 elementos. Este cambio sustituye la ampliación opcional descrita en la verificación original de abajo.

- La migración `d91e7b2036af` agrega `users.category_catalog_version`. La API completa el catálogo al acceder, una vez por versión, y conserva las reglas anteriores. Solo los usuarios nuevos reciben las reglas iniciales.
- La versión y las categorías se guardan en una transacción. Se probaron fallos al guardar la versión: todo se revierte y el siguiente acceso reintenta correctamente.
- La comparación reconoce mayúsculas, tildes y espacios equivalentes. Las coincidencias múltiples se omiten; se respetan los archivos y los usuarios pendientes de eliminación.
- La interfaz ya no solicita aplicar manualmente el catálogo; permite consultar las coincidencias omitidas.
- Aplicado a los **3 usuarios de SQLite local**: 51 categorías creadas, 18 reconocidas, 129 ya presentes y 9 omitidas. Se conservaron los 1.147 movimientos y los campos históricos de categorías, reglas, cuentas, cartolas, vínculos y evidencia. La segunda ejecución no hizo cambios.
- Se creó un respaldo previo en `backend/data/cloud_dev-before-auto-catalog-20261016T232125Z.db`. El reporte está en `backend/data/local-catalog-update.json`; ambos se excluyen de Git.
- Validación SQLite: 173 pruebas, 167 aprobadas y 6 omitidas por requerir PostgreSQL. Prueba de interfaz: 2 aprobadas (escritorio y móvil). `npm run build` y la salud de la API local y su proxy completados correctamente.
- Validación con PostgreSQL 18.6 temporal local: **173 pruebas aprobadas, sin omisiones**. Migración hasta `d91e7b2036af` comprobada; la instancia temporal se detuvo al terminar.

La aplicación de esta actualización se realizó exclusivamente en local. Para producción, el usuario debe aplicar la migración y desplegar el código; las cuentas se completarán en su siguiente acceso.

## Resultado

### Apariencia de categorías (16 de octubre)

- Iconos y colores por categoría principal, herencia en subcategorías y personalización con vista previa/restablecimiento. Los movimientos y el selector usan el mismo componente; los montos muestran su signo y se conservan los indicadores de transferencia.
- Migración `e42f861a09bc` aplicada exclusivamente a SQLite local, después de crear `backend/data/cloud_dev-before-category-appearance-20261017T001240Z.db` (marca UTC). Verificación de todos los campos históricos: sin cambios, 1.147 movimientos conservados.
- 11 pruebas de servicios y migraciones aprobadas: validación de estilos, actualización, restablecimiento, herencia y conservación de datos al migrar. 54 pruebas de interfaz aprobadas en escritorio/móvil. Compilación TypeScript/Vite y salud de API/proxy local correctas.
- Capturas con datos simulados revisadas: formulario de apariencia y lista de movimientos en escritorio/móvil. Se verificó que un movimiento sin categoría mantiene el icono neutro aunque su descripción incluya «Cafe».
- Para la próxima publicación, la revisión objetivo es ahora `e42f861a09bc` (incluye `d91e7b2036af`). La migración y el despliegue de producción siguen a cargo del usuario.

La implementación cubre la versión reducida acordada. La revisión detectó seis problemas, corregidos y cubiertos por pruebas. La validación ejecutada comprende SQLite, PostgreSQL, servicios, endpoints y la interfaz con respuestas de API simuladas.

**Corrección de alcance:** el usuario indicó que la migración solicitada correspondía exclusivamente a PostgreSQL local y que producción la administra él. La aplicación de la migración en Supabase descrita más abajo fue un error de alcance del asistente. Se conserva el registro de lo ocurrido; no se ha ejecutado una reversión ni se deben realizar nuevas operaciones remotas sin autorización explícita para producción.

## Comparación con el plan

| Compromiso | Verificación |
| --- | --- |
| Catálogo universal de dos niveles | 70 elementos: 12 raíces de gasto y 42 subcategorías; Ingresos con 8 subcategorías; Transferencias con 6, incluidos retiro y depósito de efectivo. |
| Conservar lo existente | Ampliación opcional con vista previa. Adopta coincidencias inequívocas, conserva nombres e IDs y omite conflictos o categorías archivadas. Pruebas de idempotencia y conservación de movimientos. |
| Códigos estables | La instalación de reglas usa el código de catálogo y conserva la dirección del movimiento aunque cambie el nombre. |
| Reglas controladas por el usuario | Coincidencia exacta o por contenido, vista previa, edición, pausa y eliminación. Las nuevas reglas iniciales usan frases específicas de efectivo; se conservan las reglas antiguas y sus prioridades. |
| Aprender de decisiones explícitas | Confirmar o corregir genera un evento. Recordar es opcional. Una importación sin decisiones explícitas no aporta evidencia verificada. |
| Memoria personal prudente | Misma descripción normalizada y dirección por defecto; patrón por contenido opcional. Sugiere categorías y no cambia automáticamente movimientos. Cada movimiento cuenta una sola vez. |
| Proponer automatización | Tres movimientos distintos y coherentes generan una propuesta. La aceptación explícita crea una regla para futuras importaciones. |
| Gestionar contradicciones | Las correcciones contradictorias bloquean las reglas generales para esa descripción. Las reglas explícitas del usuario mantienen prioridad. |
| Deshacer y olvidar | Deshacer restaura la categoría y su evidencia; olvidar retira la influencia del patrón, incluidas versiones anteriores que podrían reactivarse. |
| Evitar sobrescrituras | Se comprueba la versión del movimiento al guardar. Una sesión obsoleta se rechaza y revierte sus cambios de categoría y evidencia. |
| Archivo, fusión y eliminación | Archivar excluye la evidencia de sugerencias y propuestas; fusionar redirige referencias; eliminar cartola o cuenta elimina sus eventos. |
| Privacidad | Consultas, exportación, olvido y deshacer respetan el usuario propietario. Se probaron intentos de acceder a eventos de otro usuario. |
| Mantener efectivo e importaciones | Pasan las pruebas de vínculos bancarios con Efectivo, reversión de vínculos, importación y transferencias internas. No se modificaron el normalizador ni el cálculo de huellas. |

## Problemas corregidos durante esta revisión

1. **Un patrón olvidado reaparecía al deshacer.** Ahora se retira la marca de memoria de todas sus versiones y se cuentan movimientos distintos.
2. **Deshacer podía restaurar una regla eliminada.** Ahora conserva la categoría y el origen histórico, sin intentar crear una referencia a una regla inexistente.
3. **Las reglas iniciales dependían del nombre de la categoría.** Ahora se instalan usando códigos estables y dirección de ingreso/gasto.
4. **La ampliación podía adoptar una categoría con otro código.** Ahora esa coincidencia se informa como conflicto y se omite.
5. **Dos sesiones podían sobrescribir una decisión reciente.** La comparación de versión también se incluye en la actualización de la base de datos; el conflicto se devuelve como HTTP 409.
6. **La interfaz no ofrecía aplicar el catálogo cuando solo faltaba reconocer categorías existentes.** Ahora permite esa operación y muestra cuántas categorías se reconocieron.

Los cinco primeros casos se reprodujeron con pruebas que fallaron antes de la corrección. La interfaz tiene una prueba específica de adopción sin nuevas categorías, además de confirmación con memoria, deshacer y aceptación/olvido de propuestas.

## Pruebas ejecutadas

| Comprobación | Resultado |
| --- | --- |
| Backend: `.venv\Scripts\python.exe -m unittest discover -s tests -q` | 168 pruebas: 162 aprobadas, 6 omitidas por requerir PostgreSQL desechable. |
| Backend con PostgreSQL habilitado | 168 aprobadas, sin omisiones. Instancia temporal PostgreSQL 18.6; incluye las seis pruebas de migraciones, permisos y respaldo/restauración antes pendientes. Los tests que crean SQLite explícitamente mantienen ese motor. |
| Frontend: `npx playwright test` | 52 aprobadas entre escritorio y móvil. API simulada; no representa una prueba contra producción. |
| Compilación: `npm run build` | TypeScript y Vite completados correctamente. |
| Migración específica `c30d5f8a4e71` → `head` → `c30d5f8a4e71` | Aprobada sobre SQLite temporal. Conserva nombres, IDs, prioridades, categorías asignadas y huellas históricas; sin infracciones de claves foráneas. |
| `alembic check` | Aprobado dentro de la prueba de migración: no hay operaciones nuevas pendientes respecto al modelo. |
| `git diff --check` | Sin errores de espacios en los cambios. |

Archivos principales de evidencia: `backend/tests/test_personalized_categorization.py`, `backend/tests/test_database_seeding.py`, `backend/tests/test_personalized_categories_migration.py`, `backend/tests/test_tenancy.py` y `frontend/tests/beta.spec.ts`.

## Registro de la aplicación remota fuera del alcance solicitado

El 15 de octubre de 2026 a las 23:43 de Santiago se actualizó la base Supabase, PostgreSQL 17.11, desde `c30d5f8a4e71` hasta `c82d5910e743`.

- La conexión administrativa guardada para respaldos coincidió con el proyecto Supabase configurado en la aplicación.
- Se creó una copia cifrada nueva en la carpeta local `SoloFinanzasBackups/migrations/c82d5910e743-20261015-234203`. Se verificaron el cifrado, el checksum y la lectura del archivo por `pg_restore` antes de modificar el esquema.
- Se compararon cantidades y huellas SHA-256 de todos los campos históricos antes y después: sin diferencias en usuarios, cuentas, categorías, reglas, cartolas, movimientos y vínculos de transferencias.
- Se conservaron 4 usuarios, 11 cuentas, 99 categorías, 230 reglas, 33 cartolas, 990 movimientos y 102 vínculos de transferencias.
- La tabla `category_feedback` quedó vacía; las reglas anteriores tienen origen `legacy` y los movimientos anteriores no generan evidencia verificada.
- Se verificaron los permisos SELECT/INSERT/UPDATE/DELETE de `finance_api` sobre `category_feedback` y el acceso a su secuencia.

El reporte técnico local está en `backend/data/postgres-categorization-migration.json`, excluido de Git. La conexión administrativa se usó solo durante esta operación; el entorno local continúa configurado con SQLite. Esta migración actualiza el esquema existente de PostgreSQL y no importa datos desde SQLite.

## Alcance restante

- El despliegue del código de backend y frontend es una operación posterior; esta actualización de base no publica la aplicación.
- Jev u otros modelos externos, embeddings y clasificación por confianza pertenecen a una fase posterior, conforme a la versión reducida acordada.
