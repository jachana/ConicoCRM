# Usuarios, Roles y Permisos — Guía de usuario

Referencia completa para crear y gestionar usuarios, entender la jerarquía de roles y configurar permisos granulares en Conico CRM.

---

## Jerarquía de roles

Conico tiene tres roles predefinidos. Cada rol hereda un conjunto de permisos por defecto que puede ajustarse individualmente.

| Rol | Color en UI | Descripción |
|-----|------------|-------------|
| **Admin** | Verde | Acceso total a todas las funciones. Gestiona usuarios y configuración global. |
| **SubAdmin** | Amarillo | Acceso operativo completo (ventas, compras, inventario). Sin acceso a gestión de usuarios. |
| **Vendedor** | Azul | Acceso limitado al ciclo de ventas. No ve costos ni módulos administrativos. |

---

## Matriz de permisos por defecto

### Admin

Acceso total a los 17 módulos con todas las acciones. Incluye `view_all` y `admin` en todos.

### SubAdmin

| Módulo | Ver | Crear | Editar | Eliminar | Ver todo | Admin |
|--------|-----|-------|--------|----------|----------|-------|
| Catálogo | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Clientes | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Proveedores | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Empresas | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Cotizaciones | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Nota de Venta | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Facturas | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Boletas | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Guías de Despacho | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Órdenes de Compra | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Inventario | ✓ | ✓ | ✓ | ✓ | ✓ | — |
| Dashboard | ✓ | — | — | — | — | — |
| Libros | ✓ | — | — | — | — | — |
| DTE Recepción | ✓ | — | — | — | — | — |
| Tareas | ✓ | ✓ | ✓ | ✓ | — | — |
| Usuarios | — | — | — | — | — | — |
| RRHH | — | — | — | — | — | — |

### Vendedor

| Módulo | Ver | Crear | Editar | Eliminar | Ver todo |
|--------|-----|-------|--------|----------|----------|
| Catálogo | ✓ | — | — | — | — |
| Clientes | ✓ | ✓ | ✓ | — | — |
| Empresas | ✓ | — | — | — | — |
| Cotizaciones | ✓ | ✓ | ✓ | — | — |
| Nota de Venta | ✓ | ✓ | ✓ | — | — |
| Boletas | ✓ | ✓ | ✓ | — | — |
| Guías de Despacho | ✓ | ✓ | ✓ | — | — |
| Tareas | ✓ | ✓ | ✓ | ✓ | — |
| Facturas | ✓ | — | — | — | — |
| Dashboard | ✓ | — | — | — | — |
| Libros | ✓ | — | — | — | — |
| DTE Recepción | ✓ | — | — | — | — |
| Proveedores | — | — | — | — | — |
| Órdenes de Compra | — | — | — | — | — |
| Inventario | — | — | — | — | — |
| Usuarios | — | — | — | — | — |
| RRHH | — | — | — | — | — |

> Los vendedores no ven precios de costo, márgenes, ni módulos de administración.

---

## Crear un usuario

Solo los **Admins** pueden crear usuarios.

1. Menú lateral → **Configuración → Usuarios** → botón **Nuevo Usuario**.
2. Completar el formulario:

   | Campo | Descripción |
   |-------|-------------|
   | **Nombre** | Nombre completo que aparece en el sistema. |
   | **Email** | Identificador único. Se usa para iniciar sesión. |
   | **Contraseña** | Mínimo 8 caracteres. El usuario puede cambiarla después. |
   | **Rol** | `admin`, `subadmin` o `vendedor`. |

3. Click **Guardar**. El usuario puede iniciar sesión de inmediato.

---

## Editar un usuario

1. En la lista de Usuarios, click en el usuario → ícono **Editar**.
2. Campos modificables: **Nombre**, **Rol**, **Contraseña** (opcional), **Activo/Inactivo**.
3. Guardar.

### Desactivar un usuario

Cambiar **Activo** a desactivado impide que el usuario inicie sesión sin eliminar sus datos ni su historial de auditoría. Útil cuando un empleado sale de la empresa.

> **Protección del último Admin:** No se puede desactivar al último Admin activo del sistema. El sistema mostrará un error si se intenta.

---

## Permisos granulares (overrides)

Cuando el rol por defecto no se ajusta exactamente a las necesidades, se pueden configurar excepciones por usuario.

### Ejemplo de uso
- Un vendedor que excepcionalmente necesita ver los precios de costo.
- Un SubAdmin que no debe poder eliminar facturas.

### Cómo configurar

1. Lista de Usuarios → click en el usuario → botón **Permisos**.
2. Se abre la matriz de permisos: 17 módulos × acciones disponibles.
3. Los toggles en **gris** indican el valor heredado del rol.
4. Activar o desactivar un toggle crea un override específico para ese usuario.
5. Guardar.

> No se pueden configurar permisos para usuarios con rol **Admin** — siempre tienen acceso total.

### Resolución de permisos

Para cada acción sobre un módulo, el sistema aplica este orden:

1. Si el usuario es **Admin** → acceso garantizado.
2. Si existe un **override** (PermissionOverride) para ese usuario/módulo/acción → se usa ese valor.
3. Si no hay override → se usa la **matriz del rol** por defecto.

---

## Autenticación de dos factores (2FA)

El 2FA usa TOTP (contraseñas de un solo uso basadas en tiempo), compatible con Google Authenticator, Authy y similares.

### Activar 2FA

1. Ir a **Mi perfil** → sección **Seguridad** → botón **Activar 2FA**.
2. Conico muestra un código QR y un código secreto en texto.
3. Escanear el QR con la app de autenticación (Google Authenticator, Authy, etc.).
4. Ingresar el código de 6 dígitos que muestra la app para confirmar.
5. El sistema genera **10 códigos de recuperación** — guardarlos en un lugar seguro. Cada código se puede usar una sola vez si se pierde el teléfono.

> Los códigos de recuperación se muestran **solo una vez**. Si se pierden, regenerarlos antes de perder el dispositivo.

### Inicio de sesión con 2FA activo

1. Ingresar email y contraseña → el sistema solicita el **código de 6 dígitos** de la app.
2. Ingresar el código y confirmar.
3. Alternativa si no se tiene el teléfono: usar un **código de recuperación** (formato `xxxx-xxxx-xxxx`).

### Desactivar 2FA

1. **Mi perfil → Seguridad → Desactivar 2FA**.
2. Confirmar con la contraseña y un código TOTP válido (o código de recuperación).

### Regenerar códigos de recuperación

Si los códigos de recuperación se usaron o se perdieron:

1. **Mi perfil → Seguridad → Regenerar códigos de recuperación**.
2. Requiere un código TOTP válido del autenticador.
3. Los códigos anteriores quedan **inválidos** de inmediato.

---

## Recuperación de contraseña

### El usuario olvida su contraseña

1. En la pantalla de login → **¿Olvidaste tu contraseña?**
2. Ingresar el email registrado → click **Enviar**.
3. Llega un correo con un enlace de recuperación (válido por 30 minutos).
4. Abrir el enlace → ingresar nueva contraseña → confirmar.

### El Admin resetea la contraseña de otro usuario

1. Usuarios → click en el usuario → Editar.
2. Ingresar nueva contraseña en el campo **Contraseña** (dejar vacío para no cambiarla).
3. Guardar.

---

## "Ver como" (View As)

Los Admins pueden simular la sesión de otro usuario para verificar qué ve y a qué tiene acceso.

1. **Configuración → Ver como** → seleccionar un usuario de la lista.
2. La interfaz muestra lo que vería ese usuario (menú lateral, módulos, datos).
3. Para salir del modo Vista: click en el banner de aviso **"Viendo como [nombre]"** → **Salir**.

> Esta función es solo visual — no modifica datos ni registra acciones como ese usuario.

---

## Preguntas frecuentes

**¿Puedo tener más de un Admin?**
Sí, se recomienda tener al menos dos Admins activos para evitar quedarse sin acceso de administración si uno sale de la empresa.

**¿Un SubAdmin puede crear usuarios?**
No. La gestión de usuarios es exclusiva del rol Admin.

**¿Qué pasa con los datos de un usuario desactivado?**
El usuario no puede iniciar sesión, pero sus registros, documentos emitidos y auditoría permanecen intactos. Sus documentos siguen referenciando su nombre.

**¿Puedo asignar un usuario a una empresa específica?**
Sí. El campo `empresa_id` en el perfil del usuario limita su acceso a los datos de esa empresa. Útil en configuraciones multi-empresa.

**¿Cuántos intentos fallidos bloquean la cuenta?**
Conico no bloquea cuentas por intentos fallidos actualmente. El 2FA es la capa de seguridad adicional recomendada para cuentas críticas.

**¿Se puede auditar quién accedió o cambió permisos?**
Sí. El módulo de auditoría (`Configuración → Auditoría`) registra todos los cambios en usuarios y permisos, incluyendo quién hizo el cambio y cuándo.
