# Store de x7sebaspanel

Sitio web estático con:
- Login
- Registro de usuarios
- Recuperación de contraseña por código de WhatsApp (modo demo)
- Panel principal
- Edición de perfil
- Chat global entre clientes

## Estructura

- `index.html` → Dashboard
- `pages/auth/login.html` → Login
- `pages/auth/register.html` → Registro
- `pages/auth/recover.html` → Recuperación
- `pages/profile/edit-profile.html` → Editar perfil
- `pages/profile/my-keys.html` → Mis keys compradas
- `pages/profile/global-chat.html` → Chat global
- `css/styles.css` → Estilos
- `js/app.js` → Lógica frontend

## Credenciales demo

- Correo: admin@x7sebaspanel.com
- Contraseña: 123456

## Usuarios en cualquier dispositivo

Esta app ahora exige autenticacion en la nube para cuentas de clientes.
Si Firebase no esta configurado correctamente, el registro/login de clientes se bloquea para evitar cuentas solo locales.

Para que un usuario registrado pueda iniciar sesion en cualquier dispositivo:

1. Crea un proyecto en Firebase.
2. Habilita **Authentication > Sign-in method > Email/Password**.
3. Copia tu **Web API Key**.
4. En `js/app.js`, coloca la clave en:
	- `const CLOUD_AUTH_API_KEY = "TU_API_KEY";`

Con eso:
- Registro y login funcionan entre dispositivos.
- Recuperación de contraseña se hace por correo (Firebase).

## Cómo usar

1. Abre `pages/auth/login.html` en el navegador.
2. Si no tienes cuenta, entra a `register.html` y regístrate.
3. Inicia sesión con tu usuario registrado (o la cuenta demo).
4. Si olvidas tu contraseña, entra a `recover.html`.
5. Genera el código y completa el formulario para actualizar contraseña.

## Diseño

El frontend usa una estética cyber oscura inspirada en tiendas gaming modernas.

## WhatsApp en modo demo

La recuperación genera un código local y abre WhatsApp hacia soporte:
- +52 962 140 6226

Para producción se recomienda backend real con API oficial (Twilio o Meta WhatsApp Cloud API), validación server-side, rate limit y expiración segura del OTP en base de datos.

## Bot de Telegram para ventas con entrega automática

Se agregó un módulo independiente en `bot-telegram/` para vender productos digitales por Telegram con entrega automática de keys y compra solo con saldo interno.

- Documentación: `bot-telegram/README.md`
- Código principal: `bot-telegram/src/index.js`
- Catálogo: `bot-telegram/data/products.json`
- Stock de keys: `bot-telegram/data/stock.json`
- Registro de pedidos: `bot-telegram/data/orders.json`
