# Seguridad y limitaciones

## Clasificacion actual

SoloFinanzas es una herramienta personal local, no un servicio listo para
internet. Procesa informacion financiera y conserva cartolas originales, por lo
que incluso en local debe tratarse como un repositorio de datos sensibles.

## Riesgos actuales

### Sin autenticacion ni aislamiento

Cualquier proceso o persona con acceso a la API puede leer y modificar todos los
datos. No hay usuarios, sesiones, roles, propiedad de registros ni auditoria.

### API y CORS no sustituyen seguridad

CORS limita navegadores, no clientes directos. Aunque los origenes tengan una
lista, un proceso local puede llamar la API. No expongas el puerto 8000 a una red
no confiable.

### Datos en texto claro

SQLite y PDFs se guardan sin cifrado de aplicacion. La contraseña de un PDF no se
persiste, pero el archivo desencriptable y sus datos extraidos quedan en disco.
La proteccion depende del sistema operativo, cifrado de disco y permisos.

### Archivos subidos

Se valida extension, tamaño, capacidad de apertura e institucion textual. No hay
antivirus, sandbox de parser, rate limiting ni cuotas por usuario. Las librerias
PDF deben mantenerse actualizadas y el servicio no debe aceptar archivos de
origen no confiable cuando esta expuesto.

### Mensajes y logs

Errores de librerias PDF pueden incorporarse al detalle HTTP y el importador
contiene salida de diagnostico del texto extraido en el flujo actual. La salida
de consola puede incluir informacion financiera; no la compartas ni la retengas
sin proteccion. Antes de despliegue se debe retirar toda impresion de contenido
y definir logging estructurado con redaccion.

## Limitaciones funcionales

- Solo CLP y montos enteros.
- Sin OCR; PDFs escaneados no funcionan.
- Dependencia fuerte de layouts y textos bancarios.
- Solo cinco instituciones registradas.
- Sin sincronizacion bancaria.
- Sin edicion completa o borrado individual de transacciones.
- Sin UI completa para categorias/reglas.
- Sin exportacion CSV/Excel ni backup/restauracion desde UI.
- Sin presupuestos, recurrencias, metas o patrimonio.
- Sin migraciones versionadas.
- Sin pruebas automatizadas del frontend.

## Limitaciones tecnicas

### Escalabilidad

- SQLite limita escrituras concurrentes.
- La reconstruccion de transferencias recorre todos los movimientos.
- Algunas pantallas descargan todo el historial al navegador.
- Varias actualizaciones de categoria se ejecutan como requests independientes.
- Los listados API no devuelven total ni cursor.

### Integridad y validacion

- `account_type` es texto libre en backend.
- checksum por cuenta y fingerprint no tienen restricciones unicas en base;
  dependen de logica de servicio.
- crear transacciones manuales exige un `statement_id`, pero no hay un flujo UI
  que cree una cartola manual coherente.
- el endpoint para limpiar una categoria usa un nullable en query parameter sin
  una representacion de null acordada con el cliente.
- reglas duplicadas pueden crearse por API.

### Tiempo y calendario

Los feriados estan codificados solo para 2025 y 2026. En años no incluidos se
consideran habiles todos los lunes a viernes, lo que puede cambiar deteccion de
transferencias.

### Consistencia visual/funcional

- version del pie es texto manual y puede no coincidir con `package.json` o la
  version FastAPI;
- campana, usuario, Privacidad y Soporte son elementos sin accion;
- `/categories` es una redireccion, no un administrador;
- el dashboard llama saldo a la suma historica de movimientos por cuenta, no a
  un saldo bancario conciliado.

## Requisitos antes de publicar en internet

Como minimo:

1. autenticacion robusta y autorizacion por usuario;
2. columna de propietario y aislamiento en cada consulta;
3. HTTPS, gestion de secretos y configuracion por entorno;
4. PostgreSQL y migraciones versionadas;
5. cifrado de respaldos y politica de retencion/borrado de PDFs;
6. validacion endurecida, antivirus/sandbox de archivos y limites de tasa;
7. logs sin datos financieros, auditoria y monitoreo;
8. pruebas de seguridad, dependencias y CI;
9. cabeceras de seguridad y politica CORS exacta;
10. estrategia de respaldo, restauracion y respuesta a incidentes;
11. terminos, privacidad y consentimiento aplicables al contexto legal.

## Buenas practicas para uso local

- usa cifrado de disco y una cuenta de sistema protegida;
- no sincronices `backend/data` a nubes sin cifrado;
- respalda con la API detenida;
- no agregues PDFs, bases, `.env` o logs a Git;
- anonimiza muestras antes de convertirlas en fixtures;
- actualiza dependencias con pruebas;
- limita FastAPI a loopback (`127.0.0.1`) mientras no haya seguridad adicional;
- revisa la consola antes de compartir capturas o diagnosticos.

## Prioridades recomendadas

### Alta

- retirar impresiones de texto PDF y revisar sanitizacion de errores;
- backup/restauracion y exportacion estructurada;
- migraciones versionadas;
- CRUD seguro de transacciones y categorias;
- pruebas frontend y CI;
- resolver contratos nullable y operaciones en lote atomicas.

### Media

- paginacion con totales y agregaciones en backend;
- calendario mantenible por año;
- busqueda y filtros guardados;
- accesibilidad y acciones de navegacion incompletas;
- version unica generada desde metadata.

