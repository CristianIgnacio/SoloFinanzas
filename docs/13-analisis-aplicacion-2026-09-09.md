# Análisis de SoloFinanzas — 9 de septiembre de 2026

SoloFinanzas tiene una buena base como aplicación personal local: resuelve la entrada de datos desde cartolas chilenas, permite revisarlos y ofrece varias formas de analizarlos. La principal prioridad es reforzar la confianza en sus cifras y la capacidad de corregir y recuperar información. Eso debe preceder a nuevos indicadores y funciones de planificación.

Esta evaluación corresponde al árbol de trabajo actual, incluidos cambios que ya estaban sin confirmar en Git. Combina inspección del código, navegación de escritorio con cuentas ficticias, las pruebas existentes y reproducciones específicas en bases temporales o en memoria. No se modificó el código funcional ni la base de datos personal. No se hizo una auditoría exhaustiva de seguridad, rendimiento, accesibilidad o dispositivos móviles, ni se contrastaron todas las instituciones con cartolas bancarias reales.

**Verificación ejecutada.** Las 71 pruebas del backend pasan. La compilación de TypeScript y Vite pasa. Vite advierte de un archivo JavaScript de 1.086,46 kB minificado, 350,12 kB comprimido. El primer intento de compilación encontró una restricción del entorno para iniciar subprocesos; al ejecutarlo con los permisos necesarios compiló correctamente. Ese incidente no constituye un defecto de la aplicación.

**Lo que está bien resuelto**

- **Enfoque del producto.** Centralizar cartolas de varias instituciones chilenas es un problema concreto. El soporte de CLP, cuentas bancarias, billeteras y formatos PDF distintos da utilidad real al proyecto.
- **Importación revisable.** Analizar antes de guardar, corregir tipos y categorías, mostrar errores de lectura, admitir contraseñas sin guardarlas y comprobar duplicados reduce errores de entrada. El código valida tamaño de hasta 10 MB y extensión PDF; los perfiles de Santander y CopecPay incluyen comprobaciones de totales.
- **Categorías y reglas.** Ya existen categorías principales, subcategorías, prioridades, archivado, edición, ordenación y gestión de reglas. Se protege el historial al impedir borrar categorías utilizadas. La fusión está disponible para categorías personalizadas que cumplen las restricciones del servicio.
- **Transferencias propias.** El emparejamiento uno a uno por cuentas, montos y fechas evita inflar ingresos y gastos en el dashboard. Hay pruebas para montos repetidos, fines de semana y feriados del calendario configurado.
- **Recuperación de importaciones.** Ya se puede deshacer una cartola, con una vista previa del impacto y cuidado de los PDFs compartidos y de las rutas fuera del directorio administrado.
- **Diseño visual.** Hay identidad consistente, navegación legible, componentes reutilizables, estados de carga y error y formularios con contexto. La pantalla de análisis permite combinar filtros, configurar gráficos y omitir movimientos; supera un resumen mensual básico.
- **Base técnica.** La separación entre rutas, servicios, modelos y contratos ayuda a evolucionar el backend. Usar enteros para CLP evita problemas de redondeo decimal. SQLite es una elección razonable para el alcance de una persona en su computador. Ya existe una migración versionada para la jerarquía, con respaldo previo.

**Problemas comprobados que conviene corregir primero**

| Prioridad | Hallazgo y efecto | Evidencia y dirección de corrección |
| --- | --- | --- |
| Alta | Los indicadores del dashboard no excluyen las mismas transferencias. Una transferencia a un tercero puede contar en gastos y desaparecer del calendario y del desglose. | Con datos ficticios, la tarjeta mostró $175.000 de gasto; categoría y calendario consideraron $125.000. El backend excluye pares internos confirmados; los dos gráficos excluyen toda categoría de tipo `transfer`. Unificar el criterio mediante `is_internal_transfer`. |
| Alta | La API permite guardar movimientos financieramente inconsistentes. | `POST /transactions` devolvió HTTP 201 para un ingreso de -$999 asociado a una cuenta y a una cartola de otra cuenta. Validar signo, tipo, compatibilidad de categoría y pertenencia de la cartola, también en el alta por lote. |
| Alta | Cambiar el tipo de una categoría puede dejar transferencias internas obsoletas. | En memoria, después de convertir una categoría de transferencia saliente a gasto, el par interno permaneció y el dashboard mostró $0 de gasto. Tras recalcular los pares mostró -$5.000. Recalcular los datos derivados dentro de la operación que cambia el tipo. |
| Alta | La inicialización puede contradecir la personalización del usuario. | Al eliminar una regla predeterminada y ejecutar de nuevo la siembra, reapareció. Al renombrar “Supermercado”, la siguiente siembra recreó la categoría original además de conservar el nuevo nombre. Separar la creación inicial del catálogo de las actualizaciones versionadas y conservar las decisiones del usuario. |

Referencias: [cálculo del dashboard](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/services/dashboard.py:20), [desglose de gastos](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Dashboard.tsx:525), [calendario](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Dashboard.tsx:565), [alta de movimientos](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/services/transactions.py:34), [contrato de entrada](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/schemas/transaction.py:34), [actualización de categorías](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/services/categories.py:211) e [inicialización y siembra](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/core/database.py:56).

**Aspectos del producto que pueden generar confusión**

“Balance total” es el resultado del mes, calculado como ingresos menos gastos; no es el dinero disponible en todas las cuentas. “Saldo neto” en Cuentas suma los movimientos importados y no parte de un saldo inicial conciliado. Conviene usar “Resultado del mes” y “Variación neta importada”, o implementar saldos iniciales y conciliación antes de presentarlos como saldos bancarios. [Resumen de cuentas](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Accounts.tsx:166).

“Ganancias por inversión” suma ingresos de una categoría cuyo nombre sea exactamente “Inversiones”. No calcula rentabilidad ni separa capital recuperado de ganancia, y cambiar el nombre de la categoría altera el indicador. Conviene describirlo como ingresos registrados en esa categoría hasta disponer de un modelo de inversiones. [Implementación](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Dashboard.tsx:545).

Análisis incluye transferencias internas por defecto y el dashboard las excluye. Es válido ofrecer ambos alcances, pero se debería indicar claramente qué está incluido y facilitar una vista comparable. En la prueba inicial, Análisis mostró $1.400.000 de ingresos y $375.000 de gastos; el dashboard mostró $1.200.000 y $175.000. El balance coincidió porque ambas partes de la transferencia estaban en el mismo período. El promedio mensual de Análisis, además, divide por meses con movimientos: necesita explicitar ese denominador si se seleccionan períodos vacíos. [Filtros y resumen](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Analytics.tsx:412).

El gráfico de categorías toma las cinco mayores y no agrega el resto como “Otras”. Con más de cinco categorías, el título y los porcentajes deberían aclarar que representan una selección o incluir el resto del gasto. [Selección de categorías](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Dashboard.tsx:542).

**Corrección de datos y experiencia de uso**

La interfaz permite cambiar categorías y deshacer importaciones completas, pero falta una edición individual de fecha, descripción y monto, y un flujo para registrar efectivo u operaciones sin PDF. El contrato actual exige `statement_id`, por lo que un alta manual completa también requiere ajustar la representación del origen del movimiento.

Guardar varias categorías envía peticiones independientes en paralelo, cada una con su propio commit. Por inspección del código, si alguna falla pueden quedar cambios parciales; no se forzó ese fallo durante esta revisión. Un endpoint transaccional de actualización por lote permitiría informar y garantizar mejor el resultado. También evitaría recalcular todas las transferencias una vez por cada movimiento editado. [Guardado múltiple](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Transactions.tsx:391).

La exportación actual descarga Markdown. Es útil para leer, pero CSV/Excel y un respaldo restaurable aportan más a quien quiera analizar o recuperar su información. El respaldo de una migración no sustituye una estrategia regular que incluya la base y los PDFs originales. [Exportación](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Transactions.tsx:366) y [migración existente](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/backend/app/core/migrations.py:180).

Visualmente reduciría el tamaño de algunas cabeceras y el espacio inicial para acercar las acciones y datos al primer vistazo. En la ventana de escritorio revisada, el dashboard tuvo 1.294 px de contenido para 1.265 px disponibles: el selector de “Top 5 Movimientos” desbordaba horizontalmente. Los botones superiores de notificaciones y usuario no tienen acción ni nombre accesible; “Privacidad” y “Soporte” son textos sin destino. El formulario compartido de cuenta tampoco implementa un diálogo accesible con gestión del foco. Estas mejoras son más concretas que un rediseño completo. [Selector](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/pages/Dashboard.tsx:1116), [cabecera](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/router/RootLayout.tsx:113) y [formulario](C:/Users/crist/Documents/U/Proyectos/SoloFinanzas/frontend/src/components/AccountFormModal.tsx:52).

**Mantenibilidad, pruebas y operación**

Las pruebas actuales cubren lógica importante del backend, pero no encontré una suite de frontend ni pruebas HTTP de extremo a extremo. Tampoco configuración de CI, lint o formateo en el repositorio inspeccionado. Los defectos reproducidos muestran por qué conviene probar también la consistencia entre pantallas, la validación de las rutas y la persistencia de personalizaciones después de reiniciar.

Hay páginas muy extensas: Análisis tiene 1.748 líneas, Dashboard 1.205 y Categorías 911. El importador PDF tiene 1.468. Separaría gradualmente cálculos, acceso a datos, gráficos y formularios al trabajar en esas áreas. No hace falta reescribir todo el proyecto.

Movimientos y Análisis descargan el historial completo en páginas de 1.000 registros y luego filtran localmente. El dashboard del backend también carga todas las transacciones. Esto merece agregaciones y filtros en SQL conforme crezca el historial. El paquete JavaScript medido sugiere separar la carga de las rutas y los gráficos; no se realizó una prueba de carga que permita afirmar un tiempo de respuesta específico.

El calendario bancario está fijado a 2025 y 2026. Fuera de esos años solo conserva el comportamiento de fines de semana. Debe haber un mecanismo de actualización o advertencia de cobertura para mantener el comportamiento de emparejamiento.

La ausencia de autenticación concuerda con el alcance local declarado. Si se decide publicar, autenticación, aislamiento de datos, protección de documentos, respaldo y monitoreo pasan a ser requisitos de esa nueva etapa. No es necesario introducir múltiples usuarios para mejorar primero la versión personal.

El README está atrasado respecto del código: menciona como pendientes la gestión de categorías/reglas y deshacer importaciones, y parte de la documentación afirma que no hay migraciones versionadas. Ya existen esas capacidades, aunque todavía admiten mejoras. Conviene actualizar el estado y distinguir claramente lo implementado de lo propuesto.

**Funcionalidades futuras, ordenadas por valor para el uso personal**

| Orden | Funcionalidad | Valor y alcance inicial sugerido |
| --- | --- | --- |
| 1 | Respaldo y restauración; exportación CSV/Excel | Recuperar toda la instalación y reutilizar los datos. Incluir categorías, reglas, relaciones y PDFs; verificar una restauración en una base nueva. |
| 2 | Edición completa y movimientos manuales | Corregir errores individuales y registrar efectivo. Agregar trazabilidad de cambios y un mecanismo de deshacer. |
| 3 | Conciliación y cobertura de cartolas | Identificar cuentas o períodos incompletos, diferencias de totales, duplicados y transferencias pendientes de pareja. Mostrar revisión necesaria, motivo y resolución. |
| 4 | Presupuestos por categoría | Comparar gasto real con un límite mensual y mostrar cuánto queda. Empezar con pocas categorías, un período claro y avisos de umbral. |
| 5 | Recurrentes, suscripciones y proyección | Sugerir movimientos periódicos para confirmación, mostrar próximos pagos y proyectar el cierre del mes a partir de supuestos explícitos. |
| 6 | Búsqueda, etiquetas y división de gastos | Buscar por descripción, monto o comercio, y repartir una compra entre categorías conservando el total original. |
| 7 | Automatización de categorías con revisión | Crear una regla desde una corrección, mostrar por qué se aplicaría, previsualizar su efecto histórico y conservar las asignaciones manuales. |
| 8 | Tarjetas, cuotas y deudas | Representar compras, cuotas, vencimientos y pagos para evitar doble conteo. Hoy el tipo de cuenta no equivale a un modelo de deuda. |
| 9 | Metas de ahorro y patrimonio | Incorporar objetivos, activos y pasivos sobre saldos conciliados. Separar transferencias de ahorro, aportes y rendimientos. |
| 10 | Nuevas entradas y acceso móvil | CSV primero cuando haya formatos disponibles; OCR y nuevos parsers según documentos realmente utilizados. Validar el flujo móvil completo antes de plantear instalación como PWA. |

**Secuencia de trabajo propuesta.** Una primera entrega debería corregir los cuatro defectos reproducidos, unificar las definiciones de los indicadores, proteger las actualizaciones por lote y ofrecer recuperación de datos. La siguiente puede concentrarse en edición, búsqueda y conciliación. Después, presupuestos y recurrentes darían el salto desde consultar el pasado hacia planificar el mes. Tarjetas, patrimonio, otras monedas, sincronización bancaria o una versión en la nube requieren decisiones de alcance adicionales.

Para comprobar el progreso, mediría tiempo de importar y revisar una cartola, cantidad de correcciones manuales, porcentaje de movimientos pendientes de categoría o conciliación, consistencia entre totales y capacidad de restaurar un respaldo. Esas medidas conectan las mejoras técnicas con la utilidad diaria de SoloFinanzas.
