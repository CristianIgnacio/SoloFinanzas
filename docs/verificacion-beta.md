# Verificación de la beta — 5 de octubre de 2026

## Comprobado localmente

- **102 pruebas del backend aprobadas** en una ejecución con PostgreSQL 17.11 temporal y datos ficticios. Tras agregar el caso para la clave secreta actual de Supabase, la suite local ejecutó 103 casos: 102 aprobados y uno específico de despliegue PostgreSQL omitido porque ese servidor temporal ya no estaba activo. Incluye pruebas históricas de parsers sobre SQLite y nuevas pruebas de integración sobre PostgreSQL.
- Migración Alembic a una base vacía; permisos del rol de ejecución sin acceso de modificación al esquema o a `alembic_version`.
- Aislamiento entre usuarios en consultas, agregados, alias ORM, páginas, exportación, categorías, reglas, relaciones, importaciones y eliminación. Una relación cruzada también falla con una sesión SQL sin la protección ORM.
- Importaciones duplicadas concurrentes: una sola confirmación; fallos de operaciones en lote sin guardados parciales.
- Validación criptográfica de JWT y rechazo de firma, algoritmo, audiencia, emisor y vencimiento incorrectos.
- Límites de PDF: peso, páginas, concurrencia, proceso aislado y terminación por tiempo. Límite de cuerpo HTTP también en solicitudes sin Content-Length.
- Migración SQLite → PostgreSQL: ensayo revertido, aplicación, repetición rechazada, totales y clasificaciones conservados, movimientos idénticos conservados y origen sin cambios.
- Respaldo PostgreSQL, cifrado autenticado, restauración en otra base vacía y comparación de registros. Se rechazaron una clave incorrecta y un archivo alterado.
- **8 pruebas de navegador aprobadas** entre escritorio y móvil: home sin solicitudes financieras, rutas privadas y antiguas, cancelación OAuth, privacidad, recarga, cambio de usuario entre pestañas, cierre de sesión y respuesta de sesión inválida. Auth y API simulados en estas pruebas.
- Revisión visual de las capturas de home y cuentas en móvil; comprobación automática de ancho sin desbordamiento de página.
- Compilación TypeScript/Vite aprobada. Los gráficos se cargan al necesitarlos, separados de la home.
- `npm audit --omit=dev --audit-level=high`: cero vulnerabilidades reportadas en dependencias de producción del frontend. `pip check`: sin conflictos de dependencias instaladas.
- `git diff --check`: sin errores de espacios.

## Pendiente de configurar los proyectos externos

No se publicaron servicios, no se activaron planes de pago, no se migraron datos personales y no se instaló la tarea diaria en Windows. Debes crear Supabase, Render y Vercel y seguir [la guía de despliegue](despliegue-beta.md).

Después de configurar los proyectos, quedan las pruebas reales de Google/PKCE, callbacks, CORS, HTTPS, reactivación de Render, Data API deshabilitada, importación con PDF ficticio y eliminación en Supabase Auth. Las suites de backend y frontend están versionadas y el workflow de CI las ejecutará; esta verificación describe ejecuciones locales, no un workflow ya ejecutado en GitHub.

La cadena de desarrollo de Tailwind 3 conserva avisos de `braces` documentados en la guía; la auditoría anterior no cubre herramientas de desarrollo. Vite advierte que el módulo diferido de gráficos supera 500 KB. La página de Análisis carga los registros de los meses elegidos y puede consumir más memoria si se seleccionan muchos períodos.

El respaldo financiero no reemplaza el respaldo/configuración de Supabase Auth. El instalador de la tarea diaria y su recuperación al iniciar sesión están preparados para ejecutarse después de configurar una conexión real; no se ha comprobado una ejecución programada tras reiniciar este equipo.
