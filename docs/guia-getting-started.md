# Guía de inicio: Configuración inicial de Conico

Esta guía cubre los pasos necesarios para activar una empresa nueva en Conico: datos empresariales, logo, cuentas bancarias, folios CAF, usuarios, roles y autenticación de dos factores.

---

## 1. Datos de la empresa

Ve a **Configuración** (`/configuracion`) → pestaña **General**.

Completa los campos de la sección **Empresa**:

| Campo | Descripción | Ejemplo |
|---|---|---|
| Nombre empresa | Razón social completa | Distribuidora Pérez SpA |
| RUT empresa | Con guion, sin puntos | 76.543.210-K |
| Dirección | Dirección fiscal | Av. Providencia 1234, Santiago |

Haz clic en **Guardar** al final de la sección. Los datos aparecen en encabezados de facturas y boletas.

---

## 2. Logo de la empresa

En la misma pestaña **General**, desplázate hasta la sección **Logo de la empresa**.

1. Haz clic en **Subir logo**.
2. Selecciona una imagen en formato PNG o JPG (recomendado: fondo blanco, mínimo 200 × 200 px).
3. El logo aparece en la previsualización y en los PDFs de documentos.

Para reemplazarlo, haz clic en **Reemplazar**. Para eliminarlo, usa el botón con ícono de papelera.

---

## 3. Datos bancarios

La sección **Datos bancarios** registra la cuenta principal de la empresa para que aparezca en documentos de cobro.

| Campo | Descripción |
|---|---|
| Banco | Nombre del banco (ej. Banco Estado) |
| Tipo de cuenta | Cuenta corriente, vista, ahorro |
| N° de cuenta | Número sin espacios |
| Nombre titular | Nombre tal como aparece en el banco |

Guarda con el botón al pie de la sección.

> **Nota:** Los bancos disponibles en menús desplegables (ej. al registrar pagos) se gestionan más abajo en la misma página.

---

## 4. Folios CAF (Documentos tributarios)

Los folios CAF son archivos XML que el SII emite para autorizar la emisión de documentos tributarios electrónicos (facturas, boletas, guías de despacho, etc.).

Ve a **Migración inicial** (`/migracion-inicial`) → pestaña **Folios CAF**.

### Cómo obtener un CAF

1. Accede al [portal del SII](https://misiir.sii.cl/).
2. En el menú **Documentos tributarios electrónicos**, elige **Solicitar folios**.
3. Selecciona el tipo de documento (ej. Factura Electrónica = tipo 33).
4. Descarga el archivo XML resultante.

### Subir el CAF a Conico

1. En la pestaña **Folios CAF**, haz clic en **Subir CAF**.
2. Arrastra el archivo XML o selecciónalo desde el explorador.
3. El sistema valida el archivo automáticamente: muestra el tipo de documento, rango de folios y fecha de vencimiento.
4. Los folios quedan activos de inmediato.

Repite el proceso para cada tipo de documento que necesites emitir:
- **33** — Factura electrónica
- **39** — Boleta electrónica
- **41** — Boleta no afecta
- **52** — Guía de despacho
- **56** — Nota de débito
- **61** — Nota de crédito

---

## 5. Usuarios y roles

Ve a **Usuarios** (`/usuarios`).

### Crear un usuario

1. Haz clic en **Nuevo usuario**.
2. Completa nombre, correo electrónico y contraseña inicial.
3. Asigna un rol:

| Rol | Acceso |
|---|---|
| **Vendedor** | Módulos de ventas, clientes, cotizaciones y notas de venta |
| **Subadmin** | Todo lo anterior más inventario, reportes y órdenes de compra |
| **Admin** | Acceso completo incluyendo configuración, usuarios y migración |

4. Haz clic en **Crear**.

El usuario recibe las credenciales y puede iniciar sesión de inmediato.

### Editar o desactivar un usuario

Haz clic en el usuario en la tabla para editar nombre, rol o contraseña. Para revocar acceso, desactiva el interruptor **Activo** — el usuario no puede iniciar sesión pero sus datos se conservan.

### Previsualizar como otro usuario

En **Configuración → General**, la sección **Vista previa de rol** permite ver la interfaz como la vería un usuario con un rol específico, sin cambiar tus propios datos ni permisos.

---

## 6. Autenticación de dos factores (2FA)

El 2FA añade una capa de seguridad: además de la contraseña, se requiere un código de seis dígitos generado por una app como Google Authenticator o Authy.

En **Configuración → General**, desplázate hasta la sección **Autenticación de dos factores**:

1. Haz clic en **Activar 2FA**.
2. Escanea el código QR con tu app de autenticación.
3. Ingresa el código de seis dígitos para confirmar.
4. Guarda los códigos de recuperación en un lugar seguro — son de uso único y permiten acceder si pierdes tu dispositivo.

Se recomienda activar 2FA para todos los usuarios con rol **Admin** o **Subadmin**.

---

## Orden recomendado de configuración

```
1. Datos empresa + logo        → /configuracion
2. Datos bancarios             → /configuracion
3. Subir folios CAF            → /migracion-inicial (pestaña Folios CAF)
4. Crear usuarios y asignar roles → /usuarios
5. Activar 2FA                 → /configuracion
```

Una vez completados estos pasos, la empresa está lista para emitir documentos tributarios y operar en Conico.

---

## Solución de problemas frecuentes

| Problema | Causa probable | Solución |
|---|---|---|
| CAF rechazado | RUT del CAF no coincide con el RUT configurado | Verifica el RUT en Configuración y vuelve a descargar el CAF del SII |
| Logo no aparece en PDFs | Formato no soportado | Usa PNG o JPG sin transparencia |
| Usuario no puede iniciar sesión | Cuenta desactivada | Activa el interruptor **Activo** en Usuarios |
| No hay documentos disponibles | Sin folios CAF vigentes | Solicita y sube nuevos CAFs antes de emitir |
