// Configuración de Firebase para Store de x7sebaspanel
(function () {
  try {
    // Verificar que Firebase esté cargado
    if (typeof firebase === 'undefined') {
      console.warn('Firebase SDK no cargado. Los códigos usarán localStorage.');
      window.db = null;
      return;
    }

    // Configuración del proyecto Firebase
    const firebaseConfig = {
      apiKey: "AIzaSyDoMnlTZVdd9ulkZlGjGUwXzKtmlnUCfXc",
      authDomain: "x7sebaspanel.firebaseapp.com",
      projectId: "x7sebaspanel",
      storageBucket: "x7sebaspanel.firebasestorage.app",
      messagingSenderId: "11380640205",
      appId: "1:11380640205:web:bb007307f7c4c2411b5c84"
    };

    // Inicializar Firebase solo si no está inicializado
    if (!firebase.apps.length) {
      firebase.initializeApp(firebaseConfig);
      console.log('✅ Firebase inicializado');
    }

    // Inicializar Firestore
    window.db = firebase.firestore();
    console.log('✅ Firestore listo para códigos en la nube');

    // Habilitar persistencia offline
    window.db.enablePersistence({ synchronizeTabs: true })
      .then(function() {
        console.log('✅ Persistencia offline activada');
      })
      .catch(function(err) {
        if (err.code === 'failed-precondition') {
          console.warn('⚠️ Persistencia: múltiples pestañas abiertas');
        } else if (err.code === 'unimplemented') {
          console.warn('⚠️ Persistencia: navegador no soportado');
        }
      });

  } catch (error) {
    console.error('❌ Error inicializando Firebase:', error);
    console.warn('Los códigos se guardarán solo en localStorage (no funcionarán entre teléfonos)');
    window.db = null;
  }
})();
