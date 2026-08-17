# Guia de extension

## Antes de cambiar codigo

Identifica que capa es dueña del cambio:

| Necesidad | Capa principal |
| --- | --- |
| Nuevo campo persistido | Modelo, migracion, esquema, servicio, tipo TS y UI. |
| Nueva regla financiera | Servicio backend y pruebas. |
| Nuevo endpoint | Ruta, esquema, servicio, pruebas y servicio frontend. |
| Nueva pantalla | Router, pagina, componentes y servicio existente/nuevo. |
| Nueva institucion PDF | Enums/mapas, perfil parser, UI, assets y pruebas. |
| Nuevo indicador | Preferentemente servicio backend; UI solo presenta. |

Evita implementar la misma regla de forma independiente en ambos lados. El
backend debe ser la autoridad de validacion; el frontend puede anticiparla para
mejor experiencia.

## Agregar una institucion o parser

La guia exhaustiva esta en [`../arci.md`](../arci.md). Resumen minimo:

1. agregar `InstitutionCode` en backend;
2. agregar `ParserKey` y el mapa institucion-parser;
3. crear `TabularParserProfile` con marcadores y reglas reales;
4. registrar perfil, validador y parser;
5. replicar enums, mapa y labels en `frontend/src/types.ts`;
6. agregar logo o verificar fallback;
7. actualizar lista de instituciones y docs;
8. agregar pruebas positivas, negativas, de signo, layout y totales;
9. probar un PDF real anonimizado.

No agregues un banco solo al selector. Sin perfil completo, la cuenta se puede
crear pero la importacion fallara o, peor, interpretara montos incorrectos.

## Agregar una categoria o regla predeterminada

- Añade la categoria en `DEFAULT_CATEGORIES` antes de cualquier regla que la use.
- Usa un nombre estable: las reglas se vinculan por nombre durante la siembra.
- Define `CategoryType` compatible.
- Añade reglas en `DEFAULT_CATEGORIZATION_RULES` con keywords concretas.
- Recuerda que una prioridad mayor gana; a igualdad gana la keyword mas larga.
- La siembra no modifica reglas existentes ni elimina catalogos retirados.
- Para datos ya importados, usa el script de recategorizacion primero en dry-run.

Prueba que el keyword no coincida dentro de otra palabra y que categorias
incompatibles dejen el movimiento sin categoria.

## Agregar un endpoint

1. define o reutiliza esquema en `backend/app/schemas/`;
2. implementa negocio en `backend/app/services/`;
3. agrega ruta delgada en `backend/app/api/routes/`;
4. incluye el router en `app/main.py` si es un modulo nuevo;
5. traduce excepciones conocidas a codigos HTTP consistentes;
6. agrega pruebas de servicio y/o ruta;
7. actualiza tipos y servicio HTTP del frontend;
8. documenta metodo, entrada, respuesta y errores en `06-api-rest.md`.

Prefiere body JSON para actualizaciones estructuradas. Varios PATCH actuales usan
query parameters por herencia; no es necesario repetir ese patron en recursos
nuevos.

## Agregar una tabla o columna

Ademas del modelo SQLModel:

- diseña una migracion para bases existentes;
- revisa claves foraneas y estrategia de borrado;
- actualiza esquemas publicos solo si el campo debe exponerse;
- actualiza `frontend/src/types.ts`;
- considera indices para filtros reales;
- prueba base nueva y actualizada;
- actualiza `05-modelo-de-datos.md`.

No uses solamente `create_all`: no altera columnas existentes.

## Agregar una pantalla

1. crea la pagina en `frontend/src/pages/` y exportala en `pages/index.ts`;
2. agrega la ruta en `router/index.tsx`;
3. agrega navegacion en `RootLayout.tsx` si debe ser visible;
4. encapsula HTTP en `src/services/`;
5. reutiliza componentes de `ui.tsx` y estados comunes;
6. contempla carga, error, vacio, exito y vista movil;
7. usa `parseLocalDate` para fechas sin hora;
8. ejecuta build y documenta la seccion.

Si una vista necesita todos los movimientos, evalua antes un endpoint agregado o
paginacion con totales. Repetir la carga completa en el navegador no escala.

## Agregar un widget analitico

- agrega un ID estable a `WIDGET_OPTIONS`;
- deriva datos con `useMemo` a partir del conjunto filtrado;
- usa un tipo soportado por `EChart.tsx` o registra el modulo ECharts necesario;
- incrementa `WIDGET_STORAGE_VERSION` si cambia la semantica almacenada;
- define comportamiento sin datos;
- verifica filtros de transferencias y signo de gastos;
- considera mover calculos costosos al backend.

## Cambiar contratos compartidos

No hay generacion automatica. Busca todas las representaciones:

- enum/modelo/esquema Python;
- ruta y servicio;
- `frontend/src/types.ts`;
- servicio HTTP frontend;
- componentes que formatean o comparan valores;
- pruebas y documentacion.

Una mejora futura recomendable es generar tipos TypeScript desde OpenAPI o
validarlos en CI.

## Criterio de terminado

- regla de negocio vive en la capa correcta;
- datos existentes tienen ruta de migracion o reparacion;
- errores son legibles y no exponen informacion sensible;
- backend tests y frontend build pasan;
- se probaron estados vacio/error y layout responsivo;
- contratos y docs se actualizaron;
- ningun PDF o base real se agrego a Git.

