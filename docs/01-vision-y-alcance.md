# Vision, alcance y conceptos

## Proposito

SoloFinanzas es una aplicacion web local para centralizar finanzas personales
en Chile. Convierte cartolas PDF de distintas instituciones en un conjunto
normalizado de cuentas, cartolas, movimientos, categorias y reglas. Sobre esos
datos entrega consulta, correccion y analisis mensual.

El proyecto esta pensado hoy para una sola persona y una sola instalacion local.
No implementa autenticacion, autorizacion ni separacion de datos por usuario.

## Capacidades actuales

- Crear, editar, listar y eliminar cuentas sin datos asociados.
- Importar cartolas PDF de Banco de Chile, Banco Santander, BancoEstado,
  Mercado Pago y CopecPay.
- Abrir PDFs protegidos con contraseña sin almacenar la contraseña.
- Analizar una cartola antes de persistirla y mostrar filas que no pudieron
  interpretarse.
- Corregir tipo y categoria de cada movimiento en la vista previa.
- Evitar la importacion repetida del mismo PDF por cuenta mediante SHA-256.
- Evitar movimientos ya existentes mediante una huella por cuenta, fecha,
  descripcion normalizada y monto.
- Categorizar automaticamente por reglas de palabras clave y permitir
  correcciones manuales posteriores.
- Detectar transferencias entre cuentas propias y excluirlas de indicadores
  donde no representan ingreso o gasto real.
- Consultar movimientos por periodo, cuenta, categoria y tipo.
- Ver resumen mensual, evolucion de doce meses, categorias de gasto,
  inversiones, gasto diario, cuentas y movimientos destacados.
- Explorar analitica configurable con filtros y graficos.
- Deshacer una importacion completa con una vista previa de su impacto.

## Secciones visibles de la aplicacion

| Ruta | Seccion | Proposito |
| --- | --- | --- |
| `/` | Dashboard | Resumen del periodo y acceso rapido a los principales indicadores. |
| `/analytics` | Analisis | Exploracion multidimensional de todos los movimientos. |
| `/accounts` | Cuentas | Detalle por cuenta, cartolas, movimientos y deshacer importaciones. |
| `/import` | Importar PDF | Seleccion, analisis, revision y confirmacion de una cartola. |
| `/transactions` | Movimientos | Filtros, exportacion Markdown y categorizacion manual. |
| `/settings` | Configuracion | Alta, edicion y eliminacion de cuentas. |
| `/categories` | Categorias | Jerarquia, archivado, fusion y reglas automaticas. |
| Cualquier otra | 404 | Informa que la ruta no existe y permite volver al dashboard. |

La navegacion principal muestra `/categories` como la administracion central
del catalogo y sus reglas automaticas.

## Conceptos del dominio

### Cuenta

Representa una cuenta bancaria, tarjeta o billetera. Define la institucion que
selecciona el parser PDF. El tipo de cuenta es texto libre en backend, aunque el
formulario ofrece credito, corriente, vista, ahorro, prepago y billetera digital.

### Cartola

Registro de una importacion. Conserva nombre, tipo, checksum, periodo, estado y
ruta del PDF original. Una cartola pertenece a una cuenta y agrupa los
movimientos obtenidos de ese documento.

### Movimiento

Hecho financiero normalizado. Tiene fecha, descripcion original y normalizada,
monto CLP con signo, tipo, categoria opcional, huella de deduplicacion y
metadatos del origen.

### Categoria y regla

Una categoria clasifica el movimiento como ingreso, gasto o transferencia. Puede
ser principal o depender de una principal como subcategoria; se admiten dos
niveles y la subcategoria es opcional. Una regla relaciona una palabra clave
normalizada con cualquier categoria activa y una prioridad.
Las asignaciones manuales prevalecen sobre la recategorizacion automatica, salvo
que el script operativo se ejecute con `--include-manual`.

### Transferencia interna

No es un tercer tipo de movimiento. Son dos movimientos normales, un egreso y
un ingreso, ambos categorizados como transferencia, emparejados por monto,
cuentas distintas y cercania de fechas. El par se persiste por separado para
marcar ambos movimientos y excluirlos del dashboard.

## Reglas financieras importantes

- Un ingreso debe tener monto positivo y `transaction_type=income`.
- Un egreso debe tener monto negativo y `transaction_type=expense`.
- Una categoria normal debe coincidir con la direccion del movimiento.
- Una categoria de tipo `transfer` es compatible con ingresos y egresos.
- El dashboard suma el balance como ingresos mas egresos con signo.
- Los graficos de gasto convierten los egresos a valor absoluto para mostrarlos.
- Solo se admite CLP y no se almacenan decimales distintos de cero.

## Fuera del alcance actual

- Multiples usuarios, inicio de sesion y permisos.
- Sincronizacion automatica con bancos.
- OCR para PDFs escaneados.
- Otras monedas y conversion de divisas.
- Presupuestos, metas, patrimonio, deudas e inversiones como entidades propias.
- Migraciones versionadas de base de datos.
- Despliegue endurecido para internet.
