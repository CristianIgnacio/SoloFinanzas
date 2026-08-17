# Frontend

## Tecnologias y entrada

El frontend usa React 18, TypeScript estricto, React Router, Axios, Tailwind CSS,
Font Awesome y ECharts. Vite sirve desarrollo y genera el build estatico.

[`src/main.tsx`](../frontend/src/main.tsx) monta un `RouterProvider` dentro de
`React.StrictMode`. `App.tsx` es un remanente sin uso funcional.

## Router y layout

[`src/router/index.tsx`](../frontend/src/router/index.tsx) define todas las rutas.
[`RootLayout.tsx`](../frontend/src/router/RootLayout.tsx) entrega:

- barra lateral fija en escritorio;
- navegacion horizontal desplazable en pantallas pequeñas;
- encabezado fijo con nombre de seccion;
- `Outlet` para la pagina activa;
- pie con version visual y mensaje de procesamiento local.

Los botones de campana y usuario son actualmente elementos visuales sin accion.
Las etiquetas de Privacidad y Soporte del pie tampoco enlazan a otras vistas.

## Pantallas

### Dashboard (`/`)

Combina `GET /dashboard` con cuentas, categorias y todas las transacciones del
periodo seleccionado. Presenta:

- balance, ingresos y gastos con comparacion al mes anterior;
- evolucion mensual de ingresos y gastos;
- cinco principales categorias de gasto, excluyendo categorias transferencia;
- ingresos de la categoria llamada exactamente `Inversiones`;
- mapa de calor de gasto diario;
- hasta cuatro cuentas activas con acceso a su detalle;
- cinco movimientos de mayor monto absoluto, excluyendo transferencias internas;
- filtro local de destacados por todos, ingresos o egresos;
- modal rapido para crear una cuenta.

El selector de periodo solo ofrece meses presentes en la respuesta del backend.

### Analisis (`/analytics`)

Carga todas las cuentas, categorias y movimientos en paginas de 1.000. Permite
seleccion multiple por:

- periodos;
- cuentas;
- ingreso/egreso;
- movimientos normales/transferencias internas;
- categorias, incluida `Sin categoria`.

Calcula en el navegador ingresos, gastos, balance, gasto promedio por mes y
cantidad de movimientos. Sus widgets son:

- evolucion temporal en barras o lineas;
- distribucion por categoria;
- comparacion por cuenta;
- gastos por dia de la semana;
- principales descripciones;
- tabla ordenable de movimientos asociados.

La seleccion de widgets se guarda en `localStorage` con la clave
`solo-finanzas.analytics.widgets`, version 2. Los datos financieros no se
guardan en `localStorage`.

### Cuentas (`/accounts`)

Acepta `?account_id=<id>`, selecciona la cuenta solicitada o la primera y carga
sus cartolas y movimientos. Incluye:

- selector tipo carrusel;
- identidad institucional y acceso a importar otra cartola;
- saldo neto, ingresos, gastos y cantidad de movimientos;
- pestaña de cartolas con estado y acciones;
- pestaña de movimientos con categoria y monto;
- acceso a los movimientos de una cartola con `?statement_id=<id>`;
- eliminacion de una cartola tras consultar su impacto.

Al confirmar la eliminacion actualiza primero el estado local y luego vuelve a
consultar cartolas y movimientos. El modal informa ingresos, gastos, neto,
periodos, transferencias afectadas y si se borrara el PDF original.

### Importar PDF (`/import`)

Acepta `?account_id=<id>` para preseleccionar una cuenta importable. El flujo:

1. carga cuentas compatibles y categorias;
2. valida en cliente extension y limite de 10 MB;
3. solicita cuenta y contraseña opcional;
4. envia multipart a preview;
5. muestra periodo, paginas, proteccion, totales y errores de parseo;
6. permite cambiar tipo y categoria por fila;
7. elimina una categoria seleccionada si deja de ser compatible al cambiar tipo;
8. envia las revisiones como JSON dentro de multipart;
9. navega a los movimientos de la cartola importada.

La contraseña se conserva solo en el estado de la pagina durante el flujo.

### Movimientos (`/transactions`)

Acepta `?statement_id=<id>` para limitar la consulta a una importacion. Carga
movimientos paginando de 1.000 en 1.000 y ofrece:

- periodo;
- todos, egresos o ingresos;
- incluir/excluir transferencias internas;
- categoria, incluida sin categoria;
- cuenta;
- carga visual progresiva de 50 movimientos;
- agrupacion por fecha;
- cambio de categoria compatible con el sentido del movimiento;
- guardado en lote desde el cliente mediante solicitudes paralelas;
- barra de guardado fija cuando la accion principal sale de pantalla;
- exportacion de lo visible a un archivo Markdown local.

La exportacion no es CSV/Excel y no persiste cambios pendientes antes de
descargar; refleja la categoria elegida en borrador.

### Configuracion (`/settings`)

Acepta `?new_account=1` para abrir el formulario de creacion. Muestra cantidad
de cuentas, cuentas con parser y moneda base, tarjetas de resumen y tabla
detallada. Permite crear, editar y eliminar cuentas.

El formulario valida nombre y exactamente cuatro digitos cuando el identificador
se informa. El backend rechaza la eliminacion si la cuenta tiene cartolas o
movimientos relacionados.

### Categorias y 404

`/categories` redirige a `/transactions`. La API de categorias y reglas esta
preparada, pero la UI dedicada no esta implementada. La pagina 404 permite
volver al dashboard.

## Servicios HTTP

| Servicio | Responsabilidad |
| --- | --- |
| `AccountService` | CRUD de cuentas. |
| `CategoryService` | Listar/crear categorias y CRUD parcial de reglas. |
| `DashboardService` | Obtener resumen por periodo. |
| `StatementService` | Cartolas, impacto, eliminacion, preview e importacion multipart. |
| `TransactionService` | Listar, crear y recategorizar movimientos. |

[`apiClient.ts`](../frontend/src/lib/apiClient.ts) usa `VITE_API_URL` o
`/api/v1`, configura `Accept: application/json` y expone metodos tipados
`get`, `post`, `postForm`, `patch`, `put` y `delete`.

## Tipos compartidos

[`src/types.ts`](../frontend/src/types.ts) replica enums y esquemas del backend,
ademas de labels de institucion y parser. No existe generacion automatica desde
OpenAPI; cualquier cambio de contrato debe actualizar Python y TypeScript.

## Componentes y diseño

- `ui.tsx`: `PageIntro`, `Panel`, `StatCard`, `Button`, `Tag`, `EmptyState` y
  `StatusNotice`.
- `EChart.tsx`: registra solo barras, lineas, torta, grilla, tooltip, leyenda y
  renderer Canvas; observa cambios de tamaño y destruye la instancia al desmontar.
- `AccountFormModal.tsx`: formulario reutilizable con previsualizacion visual.
- `DeleteStatementModal.tsx`: confirmacion accesible del impacto de eliminacion.
- `InstitutionLogo.tsx`: assets por banco y fallback de iniciales.
- `icons.tsx`: iconos SVG propios y adaptadores de iconos.
- `LoadingState` y `ErrorState`: estados de carga/error consistentes.

Tailwind define una paleta clara basada en papel, verde, arcilla y rojo. Las
clases `surface-card`, `surface-card-soft`, `eyebrow` y `subtle-divider` forman
el vocabulario visual base. El ancho de contenido principal se limita a 1.280 px
y el layout responde desde 320 px.

## Hooks y utilidades

- `useDashboard(periodMonth)`: gestiona carga, error y cancelacion logica al
  cambiar de periodo.
- `useFormatCurrency()`: formatea enteros como CLP en locale `es-CL`.
- `parseLocalDate()`: construye la fecha desde sus partes para evitar el cambio
  de dia que puede producir UTC al parsear `YYYY-MM-DD` directamente.

## Consideraciones de rendimiento

- Analisis, Configuracion y algunas vistas cargan todo el historial con
  paginacion; el costo crece linealmente.
- El backend devuelve listas sin total de pagina, por lo que el cliente termina
  cuando recibe menos de 1.000 filas.
- Movimientos limita el render a bloques de 50, pero mantiene todos los datos en
  memoria.
- Las actualizaciones de categoria se envian en paralelo, no en un endpoint
  transaccional de lote; un fallo puede producir guardado parcial.

