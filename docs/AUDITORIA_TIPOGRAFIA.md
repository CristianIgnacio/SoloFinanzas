# Auditoría de tipografía — SoloFinanzas

Fecha: 15 de octubre de 2026. Revisión sin modificar la interfaz.

## Aplicación posterior de las recomendaciones

La auditoría original se conserva debajo como referencia del estado anterior. Después de su aprobación se aplicaron estos cambios:

- Títulos de página compartidos: 30 px en móvil, 36 px desde 640 px y 40 px desde 1024 px. Descripciones de 16–18 px.
- Títulos de modales: 20–24 px. Etiquetas y ayudas funcionales ampliadas; navegación inferior a 12 px.
- Fechas, categorías, ayudas de cuentas e importación a 14 px. Campos de Efectivo a 16 px en móvil.
- Indicadores monetarios de 20–36 px según el ancho de su contenedor, sin dividir los importes. Los resúmenes de cuentas e importación dan más espacio a cifras largas.
- Dashboard: columnas que dependen del espacio disponible, paneles en dos columnas desde pantallas más amplias y filtros que pueden cambiar de fila.
- Portada pública: se conserva su escala de presentación. Se armonizan Acceso, Ayuda y Privacidad con los títulos compartidos.

Validación: compilación de producción y 46 pruebas existentes de navegador aprobadas; comprobación adicional de nueve pantallas a 320, 390, 768, 1024 y 1440 px con datos simulados, incluidos importes largos y negativos. Se comprobaron desbordes de página y cifras completas en los indicadores. Se revisaron capturas de Dashboard, Cuentas, Categorías, crear cuenta e importación. Las modificaciones finales del resumen de importación también superaron sus pruebas de escritorio.

Siguen fuera de esta comprobación la certificación de accesibilidad, Safari/dispositivos físicos y la ampliación de texto al 200 %. Se mantiene la cadena de fuentes existente; la auditoría de carga de fuentes sigue siendo una observación independiente.

## Evaluación general

La base es legible, pero la escala no es uniforme. En móvil hay demasiadas etiquetas funcionales entre 10 y 12 px. En escritorio, algunos títulos y cifras crecen demasiado para el espacio disponible. Conviene aumentar los textos pequeños y moderar los grandes, conservando la estética actual.

## Alcance y método

- Medición de estilos calculados en Chromium local con datos simulados: Dashboard, Cuentas, Movimientos, Importar, Análisis, Categorías, Perfil, portada pública, Privacidad y Ayuda.
- Anchos de 320, 390, 1024 y 1440 px; alturas de 900 px y comprobación adicional de Dashboard a 1024 × 768.
- Acceso público medido a 320, 390 y 1440 px; modal de crear cuenta medido a 390 y 1440 px.
- Inspección de capturas seleccionadas y del código de componentes compartidos, tablas, gráficos y modales.
- Las variantes de errores, importación con resultados y otros modales se revisaron en código; no se recorrieron todos sus estados en navegador durante esta auditoría.
- No equivale a una comprobación completa de accesibilidad, contraste, zoom al 200 % ni a pruebas en dispositivos físicos o Safari.

## Hallazgos por prioridad

### Alta: cifras del Dashboard partidas en PC pequeño

A 1024 px, las tarjetas de indicadores muestran cifras de 48 px en tres columnas junto a la barra lateral. Con el importe de prueba `$1.487.500`, el texto se parte como `$1.487.5` y `00`. Esto dificulta leer correctamente un dato financiero principal.

Referencias: `frontend/src/components/ui.tsx:119` y `frontend/src/pages/Dashboard.tsx:819`.

Recomendación: ajustar el tamaño al espacio real de la tarjeta y retrasar las tres columnas si hace falta. Mantener el importe completo en una línea sin ocultarlo ni cortar dígitos. Probar también cifras mayores y negativas.

Hallazgo de distribución relacionado: a ese mismo ancho, los filtros «Todos / Ingresos / Gastos» llegan aproximadamente a x=1164, excediendo el viewport de 1024 px. Deben poder redistribuirse; reducir solo la letra no resuelve el problema de fondo. Referencia: `frontend/src/pages/Dashboard.tsx:1090`.

### Alta: navegación móvil de 10 px

Las etiquetas inferiores «Inicio», «Movs.», «Análisis», «Cuentas» y «Más» usan 10 px. Son navegación principal, por lo que no conviene tratarlas como texto accesorio. Los iconos ayudan, pero no sustituyen su legibilidad.

Referencia: `frontend/src/router/RootLayout.tsx:218` y `:235`.

Recomendación: 12–13 px, conservando espacio suficiente para las cinco opciones.

### Media: títulos de página inconsistentes

Tamaños calculados con configuración de texto predeterminada del navegador:

| Pantalla | Móvil, 390 px | PC, 1440 px |
| --- | ---: | ---: |
| Dashboard | 36 px | 60 px |
| Mis cuentas | 30 px | 60 px |
| Movimientos | 24 px | 40 px |
| Importar cartola | 30 px | 60 px |
| Análisis | 36 px | 60 px |
| Categorías | 36 px | 60 px |
| Perfil | 36 px | 60 px |
| Portada pública | 48 px | 72 px |
| Acceso | 36 px | 36 px |
| Ayuda / Privacidad | 36 px | 36 px |

Los títulos de 60 px resultan desproporcionados para pantallas de trabajo, especialmente a 1024 px. Su diferencia con los 40 px de Movimientos hace que cambie la escala visual al navegar. El componente compartido también eleva las descripciones a 21,6 px desde 768 px.

Referencias: `frontend/src/components/ui.tsx:39`, `:43` y `frontend/src/pages/Transactions.tsx:500`.

Recomendación: títulos de aplicación de 28–32 px en móvil y 36–40 px en PC; descripciones de 16–18 px. La portada puede mantener una escala mayor por su función de presentación.

### Media: datos y ayudas demasiado pequeños en móvil

| Zona | Tamaño actual | Evaluación |
| --- | --- | --- |
| Fechas que agrupan movimientos | 11 px en móvil | Son contexto importante; subir a 13–14 px. |
| Cuenta y categoría de un movimiento | 12 px | Mejorar a 13–14 px según el espacio. |
| Etiquetas del resumen de cuentas | 12 px | Preferir 14 px. |
| Aclaración de variación frente a saldo bancario | 12 px | Es información relevante; preferir 14 px. |
| Pasos de importación | 10,4 px en móvil | Preferir 12–14 px. |
| Ayudas de contraseña y archivo | 12 px | Preferir 14 px cuando explican cómo proceder. |
| Indicadores del resumen de Análisis | 11,2 px | Preferir 12–14 px, especialmente si están en mayúsculas. |

Referencias: `Transactions.tsx:602`, `AccountActivitySummary.tsx:53`, `ImportStatements.tsx:318`, `:368` y `Analytics.tsx:1644`.

Las cifras del resumen móvil de cuentas quedan en aproximadamente 16 px a 320 px y 17,94 px a 390 px. Se leen, pero destacan poco para ser los datos principales. Objetivo orientativo: 20–24 px, verificando importes largos antes de aumentar el tamaño.

### Media: modales con escalas diferentes

Crear cuenta tiene título de 18 px en móvil y 20 px en PC, etiquetas de 14 px y campos de 16 px en móvil / 14 px en PC. Los campos móviles están bien dimensionados. Las ayudas de 12 px y subtítulos/estados de 10,4 px merecen aumentar.

En cambio, el código de los modales de Efectivo utiliza títulos de 30 px, y los de categorías y eliminar cartola llegan a 36 px. La diferencia entre 18 y 36 px es excesiva para diálogos del mismo producto.

Además, los campos de registrar movimiento en Efectivo heredan los 14 px de sus etiquetas; conviene fijar 16 px en móvil como en crear cuenta e importar.

Referencias: `AccountFormModal.tsx:124`, `:159`, `CashMovementFormModal.tsx:103`, `CashLinkModal.tsx:25`, `DeleteStatementModal.tsx:68`, `Categories.tsx:116`.

Recomendación: títulos de modal de 20–24 px; etiquetas y ayudas de 14 px; campos de 16 px en móvil y 14–16 px en escritorio.

### Baja: textos decorativos y consistencia de fuente

Las tarjetas bancarias incluyen textos de 9,6 px. Los de la ilustración de análisis son también pequeños. Conviene distinguir estos detalles decorativos de instrucciones o estados funcionales: pueden mantenerse discretos si la información importante está disponible en texto legible fuera de la ilustración.

Se declara Geist como primera fuente, pero no se encontró su carga mediante `@font-face` o un recurso de fuente en el código revisado. El resultado depende de las fuentes instaladas, con Aptos, Segoe UI y sans-serif como alternativas. Esto puede variar las métricas entre Windows y móvil. Conviene escoger explícitamente una fuente de sistema o servir la fuente deseada.

## Elementos que funcionan bien

- Texto principal generalmente entre 14 y 18 px; lectura de Ayuda y Privacidad a 16 px.
- Campos de crear cuenta e importar a 16 px en móvil.
- Subtítulos de panel de Análisis a 24 px, con una jerarquía clara.
- Descripción e importe de Movimientos a 15 px en móvil: razonablemente legibles; se podría pasar a 16 px al armonizar.
- No se observó desborde horizontal de página en las pantallas muestreadas a 320, 390 y 1440 px con los datos utilizados. Esto no descarta recortes internos ni problemas con otros datos.

## Escala propuesta

| Uso | Móvil | PC |
| --- | ---: | ---: |
| Título de página de aplicación | 28–32 px | 36–40 px |
| Título de sección / modal | 20–24 px | 20–28 px |
| Texto principal | 16 px | 16 px |
| Etiquetas y ayudas relevantes | 14 px | 14 px |
| Campos de formulario | 16 px | 14–16 px |
| Navegación inferior | 12–13 px | No aplica |
| Metadatos breves | 12–13 px | 12–14 px |
| Importes principales | 20–30 px | 28–40 px, según espacio |

Estos tamaños son una recomendación de diseño, no mínimos obligatorios de WCAG. El criterio de accesibilidad relevante exige poder ampliar el texto hasta el 200 % sin perder contenido o funcionalidad; esa comprobación queda pendiente de una revisión específica. Fuente: [W3C — Resize Text](https://www.w3.org/WAI/WCAG21/Understanding/resize-text).

Orden recomendado: corregir cifras y filtros a 1024 px; aumentar navegación y ayudas importantes; unificar títulos y modales; revisar importes largos, zoom y gráficos al aplicar la nueva escala.
