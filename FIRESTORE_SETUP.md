# Configuración de Firestore - Códigos de Wallet entre teléfonos

## ✅ Archivos actualizados

1. **`js/firebase-config.js`** - Configuración de Firebase y Firestore
2. **`js/app.js`** - Funciones para guardar/canjear códigos en la nube
3. **Todos los HTML** - Scripts de Firebase SDK agregados

## 🔧 Pasos finales para activar Firestore

### Paso 1: Activa Firestore Database

1. Ve a `https://console.firebase.google.com/`
2. Entra a tu proyecto **x7sebaspanel**
3. En el menú lateral, pulsa **Firestore Database**
4. Pulsa **Crear base de datos**
5. Selecciona **Comenzar en modo de producción**
6. Elige ubicación: **us-central1** (o la más cercana)
7. Pulsa **Habilitar**

### Paso 2: Configura las reglas de seguridad

1. En Firestore Database, ve a la pestaña **Reglas**
2. Reemplaza todo el contenido con esto:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    
    // Reglas para wallet codes
    match /walletCodes/{codeId} {
      // Cualquiera autenticado puede leer códigos
      allow read: if request.auth != null;
      
      // Solo admins pueden crear códigos
      allow create: if request.auth != null 
        && request.auth.token.email in [
          'admin@x7sebaspanel.com',
          'sebastianarsia@gmail.com',
          'manowow5@gmail.com'
        ];
      
      // Solo se puede actualizar para canjear (cambiar redeemed a true)
      allow update: if request.auth != null
        && resource.data.redeemed == false
        && request.resource.data.redeemed == true;
      
      // Solo admins pueden eliminar
      allow delete: if request.auth != null 
        && request.auth.token.email in [
          'admin@x7sebaspanel.com',
          'sebastianarsia@gmail.com',
          'manowow5@gmail.com'
        ];
    }
  }
}
```

3. Pulsa **Publicar**

### Paso 3: Crea índices para búsquedas rápidas

1. En Firestore Database, ve a la pestaña **Índices**
2. Pulsa **Crear índice**
3. Configura así:
   - **Colección:** `walletCodes`
   - **Campo 1:** `createdBy` - Ascendente
   - **Campo 2:** `redeemed` - Ascendente  
   - **Campo 3:** `createdAt` - Descendente
4. Pulsa **Crear**

## 🧪 Prueba de funcionamiento

### Prueba 1: Generar código
1. Abre `index.html` en un navegador
2. Inicia sesión con admin: `admin@x7sebaspanel.com` / `123456`
3. En la sección "Generar código de saldo", ingresa un monto (ej: 100)
4. Pulsa **Generar código**
5. Debes ver mensaje: `Código generado en Firestore: X7-...`

### Prueba 2: Canjear en otro teléfono
1. Copia el código generado
2. Abre la página en **otro teléfono o navegador**
3. Inicia sesión con cualquier usuario (o crea uno nuevo)
4. En "Canjear código", pega el código
5. Pulsa **Canjear**
6. Debe decir: `Canje exitoso` y sumar el saldo

### Prueba 3: Verificar sincronización
1. En el primer dispositivo, recarga la página
2. El código que canjeaste debe aparecer como "canjeado" (desaparecer de pendientes)
3. En Firestore Console, ve a **Datos** y verás la colección `walletCodes`

## 📊 Verificar en Firebase Console

1. Ve a **Firestore Database > Datos**
2. Verás la colección `walletCodes`
3. Cada código tiene:
   - `code`: el código único
   - `amount`: monto del código
   - `createdBy`: email del admin que lo creó
   - `redeemed`: si ya fue canjeado (true/false)
   - `redeemedBy`: email de quien lo canjeó
   - `createdAt`: timestamp de creación

## ⚠️ Solución de problemas

### "Firestore no disponible"
- Revisa la consola del navegador (F12)
- Verifica que los scripts de Firebase se carguen correctamente
- Asegúrate de haber activado Firestore en Firebase Console

### "Error de permisos"
- Verifica que las reglas de seguridad estén publicadas
- Asegúrate de estar autenticado con Firebase Auth

### Los códigos siguen siendo locales
- Abre la consola (F12) y busca: `Firebase y Firestore inicializados correctamente`
- Si no aparece, revisa que `firebase-config.js` se esté cargando

## 🎯 Resultado final

✅ Los códigos generados por admin se guardan en Firestore (nube)
✅ Cualquier usuario puede canjear desde cualquier teléfono
✅ Los códigos canjeados se marcan automáticamente
✅ Sincronización en tiempo real entre dispositivos
