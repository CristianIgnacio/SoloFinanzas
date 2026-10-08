# Catálogo de productos financieros

Esta es la definición del **paso 1** para identificar lo que el usuario posee:
institución → producto financiero → cuenta del usuario → cartolas y movimientos.
La implementación canónica está en
[`backend/app/domain/account_products.py`](../backend/app/domain/account_products.py).
Los códigos son identificadores estables: una modificación del nombre comercial
no debe cambiar el código ni reasignar cuentas existentes.

El catálogo no tiene una entidad de tarjetas físicas o digitales. Una cuenta
vista, corriente o de prepago puede tener medios de pago, pero la identidad que
interesa a SoloFinanzas es la cuenta que reúne sus movimientos. Los productos
de crédito se registran aquí para planificar su futura incorporación; su deuda,
facturación e importación no están implementadas.

## Tipos

| Código | Significado |
| --- | --- |
| `corriente` | Cuenta corriente. |
| `vista` | Cuenta de depósito a la vista. |
| `ahorro` | Cuenta de ahorro. |
| `billetera_prepago` | Cuenta digital con fondos disponibles/prepagados. |
| `credito` | Producto de crédito con facturación propia; futuro. |

## Productos iniciales

| Institución | Códigos de producto | Tipos |
| --- | --- | --- |
| Banco de Chile | `banco_de_chile_cuenta_fan`, `banco_de_chile_corriente_digital`, `banco_de_chile_corriente_tradicional`, `banco_de_chile_fan_ahorro`, `banco_de_chile_visa_signature`, `banco_de_chile_visa_infinite` | Vista, corriente, ahorro, crédito |
| Santander | `banco_santander_mas_lucas`, `banco_santander_corriente_digital`, `banco_santander_ahorro`, `banco_santander_platinum_latam_pass` | Vista, corriente, ahorro, crédito |
| BancoEstado | `banco_estado_cuenta_rut`, `banco_estado_cuenta_pro`, `banco_estado_corriente_digital`, `banco_estado_visa_smart` | Vista, corriente, crédito |
| Banco Falabella | `banco_falabella_corriente`, `banco_falabella_vista`, `banco_falabella_cmr_mastercard` | Corriente, vista, crédito |
| Mercado Pago | `mercadopago_cuenta` | Billetera prepago |
| Copec Pay | `copecpay_cuenta_digital` | Billetera prepago |

BancoEstado ofrece distintas cuentas de ahorro. No se agrega una opción
genérica que mezcle productos distintos; se incorporarán variantes concretas
cuando se defina el alcance de ahorro y monedas (hoy SoloFinanzas opera en CLP).
La cuenta corriente tradicional de Banco de Chile identifica cuentas ligadas a
planes que no son la Cuenta Corriente Digital; el plan comercial no se modela
como otra cuenta. Cuenta Pro de BancoEstado es una cuenta vista. Los tres
productos añadidos después del catálogo inicial conservan sus códigos estables;
las cuentas antiguas sin producto pueden vincularse al editarlas.

## Evidencia de importación PDF

`muestra_probada` significa que hay una prueba automatizada con texto/PDF
sintético del formato correspondiente. **No garantiza** que cualquier cartola
real de ese producto funcione. Se aplica a CuentaRUT, Cuenta Corriente Falabella,
Cuenta Mercado Pago y Cuenta Digital Copec Pay.

`pendiente_verificacion` significa que falta validar una cartola del producto
concreto. Se permite analizarla con el parser actual de la institución y se
muestra un aviso para revisar los movimientos antes de confirmar. `no_soportado`
se aplica a los productos de crédito e impide la importación PDF. El frontend
informa el estado y las tres rutas PDF del backend aplican la misma restricción.
Una cuenta antigua sin producto conserva el parser de su institución, salvo si
su tipo es crédito. Las cartolas reales anonimizadas siguen siendo necesarias
para verificar cada producto pendiente.

Las muestras y límites actuales están en
[`test_pdf_importer.py`](../backend/tests/test_pdf_importer.py),
[`test_falabella_pdf_importer.py`](../backend/tests/test_falabella_pdf_importer.py) y
[`inspect_pdf_flow.md`](inspect_pdf_flow.md).

## Fuentes de nombres de producto

- [Banco de Chile: cuentas, planes y tarjetas](https://sitiospublicos.bancochile.cl/personas/productos-y-cuentas).
- [Santander: comparación de cuentas](https://banco.santander.cl/personas/planes/comparador-de-planes), [cuenta de ahorro](https://banco.santander.cl/personas/planes/cuenta-ahorro) y [Platinum LATAM Pass](https://banco.santander.cl/personas/tarjetas/puntos-y-promociones/detalles/santander-life-latam-pass/).
- [BancoEstado: productos](https://investor.bancoestado.cl/content/bancoestado-public/cl/es/home/home/centro-de-ayuda/productos.html) y [Cuenta Pro](https://investor.bancoestado.cl/content/bancoestado-public/cl/es/home/home-microempresa/productos/cuentas/cuenta-pro.html).
- [Banco Falabella: Cuenta Vista](https://www.bancofalabella.cl/cuentas/cuenta-vista) y [CMR Mastercard](https://www.bancofalabella.cl/tarjetas-credito-cmr/mastercard).
- [Mercado Pago: cuenta y tarjeta](https://www.mercadopago.cl/landing/como-pedir-tarjeta).
- [Copec Pay: Cuenta Digital](https://copecpay.cl/productos/cuenta-digital/).

Los nombres comerciales pueden cambiar. Revisar estas fuentes antes de exponer
nuevos productos en el formulario; conservar los códigos internos ya usados.

## Vinculación con cuentas

La migración `b427eac61230` agrega `accounts.product_code` opcional. Solo se
rellenan automáticamente registros cuyo nombre y tipo coinciden de manera
inequívoca con un producto de este catálogo. Los alias personalizados y tipos
ambiguos permanecen sin código. `account_last4` permanece sin cambios y no
se vincula a una tarjeta. Si alguien ingresó dígitos de una tarjeta en el
formulario anterior, tendrá que corregirlos manualmente más adelante.

El servicio de cuentas valida el código, institución y tipo en altas y ediciones.
El endpoint `GET /api/v1/account-products` entrega el catálogo al formulario.
Al crear una cuenta se elige institución, tipo de cuenta y producto. El tipo
filtra los productos de esa institución y se guarda junto con el código del
producto. El formulario muestra una tarjeta conceptual que cambia con la
selección, sin crear una entidad de tarjeta. Los productos de crédito pueden
explorarse en la vista previa, pero permanecen fuera de las nuevas altas hasta
que exista soporte para su facturación. En
edición, una cuenta antigua sin producto puede conservar esa condición si no
cambia de institución. El importador consulta el estado PDF del producto antes
de procesar el archivo.

Cuentas, Dashboard y Configuración muestran el alias elegido por el usuario,
la institución y el nombre del producto. Las cuentas heredadas sin código se
marcan como «Producto sin identificar» para no presentar su tipo antiguo como
si fuera un producto del catálogo. Los filtros de cartolas y movimientos siguen
usando `account_id`; la migración conserva esos IDs y sus relaciones.
Las tres vistas y el formulario comparten un diseño conceptual que usa la
institución, el tipo y el producto. La moneda sigue siendo CLP en el modelo,
pero no aparece como campo editable al crear una cuenta.
