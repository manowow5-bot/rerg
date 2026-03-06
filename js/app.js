(function () {
  const AUTH_KEY = "x7_auth";
  const USER_KEY = "x7_user";
  const USERS_KEY = "x7_users";
  const AUTH_USER_KEY = "x7_auth_user";
  const RESET_KEY = "x7_reset";
  const WALLET_CODES_KEY = "x7_wallet_codes";
  const PRODUCT_KEYS_KEY = "x7_product_keys";
  const PURCHASE_HISTORY_KEY = "x7_purchase_history";
  const GLOBAL_CHAT_KEY = "x7_global_chat";
  const LOGIN_GUARD_KEY = "x7_login_guard";
  const AFTER_LOGIN_REDIRECT_KEY = "x7_after_login_redirect";
  const ADMIN_EMAILS = ["admin@x7sebaspanel.com", "sebastianarsia@gmail.com", "manowow5@gmail.com"];
  const CLOUD_AUTH_API_KEY = "AIzaSyDoMnlTZVdd9ulkZlGjGUwXzKtmlnUCfXc";
  const CLOUD_ENFORCE_CLIENT_ACCOUNTS = true;
  const CLOUD_AUTH_BASE_URL = "https://identitytoolkit.googleapis.com/v1/accounts:";
  const page = document.body.getAttribute("data-page");
  const PRODUCT_PLAN_KEYS = ["1d", "7d", "15d", "30d", "perm"];
  const MAX_LOGIN_ATTEMPTS = 5;
  const LOGIN_LOCK_MS = 5 * 60 * 1000;
  const GLOBAL_CHAT_MAX_MESSAGES = 120;
  const GLOBAL_CHAT_MAX_TEXT_LENGTH = 400;
  const MESSAGE_TIMEOUT_MS = 3000;
  const messageTimers = {};

  function toLoginPath() {
    if (page === "login" || page === "recover" || page === "register") return "./login.html";
    if (page === "profile" || page === "user-keys" || page === "global-chat") return "../auth/login.html";
    return "./pages/auth/login.html";
  }

  function isAuthPage() {
    return page === "login" || page === "recover" || page === "register";
  }

  function setAfterLoginRedirect() {
    if (isAuthPage()) return;
    try {
      localStorage.setItem(AFTER_LOGIN_REDIRECT_KEY, window.location.href);
    } catch (error) {
      // noop
    }
  }

  function consumeAfterLoginRedirect() {
    const raw = String(localStorage.getItem(AFTER_LOGIN_REDIRECT_KEY) || "").trim();
    if (!raw) return "";

    localStorage.removeItem(AFTER_LOGIN_REDIRECT_KEY);

    try {
      const target = new URL(raw, window.location.href);
      if (window.location.protocol === "file:") {
        return target.href;
      }
      if (target.origin === window.location.origin) {
        return target.href;
      }
      return "";
    } catch (error) {
      return "";
    }
  }

  const defaultUser = {
    email: "admin@x7sebaspanel.com",
    password: "123456",
    fullName: "Administrador X7",
    username: "x7admin",
    whatsapp: "+52 962 140 6226",
    bio: "Panel principal de Store de x7sebaspanel",
    avatarUrl: "",
    balance: 1500
  };

  function toBalanceValue(value) {
    const parsed = Number(value);
    if (!Number.isFinite(parsed) || parsed < 0) return 0;
    return parsed;
  }

  function randomSalt() {
    if (typeof crypto !== "undefined" && crypto.getRandomValues) {
      const bytes = new Uint8Array(16);
      crypto.getRandomValues(bytes);
      return Array.from(bytes).map(function (b) {
        return b.toString(16).padStart(2, "0");
      }).join("");
    }
    return String(Date.now()) + String(Math.random()).slice(2);
  }

  function fallbackHash(text) {
    const value = String(text || "");
    let hash = 2166136261;
    for (let i = 0; i < value.length; i += 1) {
      hash ^= value.charCodeAt(i);
      hash = Math.imul(hash, 16777619);
    }
    const unsigned = (hash >>> 0).toString(16).padStart(8, "0");
    return unsigned.repeat(8).slice(0, 64);
  }

  function isCloudAuthEnabled() {
    return Boolean(String(CLOUD_AUTH_API_KEY || "").trim());
  }

  function requiresCloudClientAccounts() {
    return CLOUD_ENFORCE_CLIENT_ACCOUNTS;
  }

  function canFallbackToLocalAuth(errorCode) {
    const code = String(errorCode || "").trim().toUpperCase();
    return code === "CONFIGURATION_NOT_FOUND"
      || code === "OPERATION_NOT_ALLOWED"
      || code === "INVALID_API_KEY"
      || code === "API_KEY_INVALID"
      || code === "PROJECT_NOT_FOUND";
  }

  function parseCloudAuthError(errorCode) {
    const code = String(errorCode || "").trim().toUpperCase();
    if (code === "EMAIL_EXISTS") return "Ese correo ya está registrado.";
    if (code === "EMAIL_NOT_FOUND") return "No existe una cuenta con ese correo.";
    if (code === "INVALID_PASSWORD") return "Correo o contraseña incorrectos.";
    if (code === "USER_DISABLED") return "Esta cuenta está deshabilitada.";
    if (code === "WEAK_PASSWORD") return "La contraseña es demasiado débil.";
    if (code === "TOO_MANY_ATTEMPTS_TRY_LATER") return "Demasiados intentos. Inténtalo de nuevo más tarde.";
    if (code === "CONFIGURATION_NOT_FOUND") return "Firebase no está configurado correctamente en este proyecto.";
    if (code === "OPERATION_NOT_ALLOWED") return "Activa Email/Password en Firebase Authentication.";
    return "No se pudo completar la autenticación en la nube.";
  }

  async function cloudAuthRequest(action, payload) {
    if (!isCloudAuthEnabled()) {
      return { ok: false, error: "Cloud auth no configurado." };
    }

    try {
      const url = CLOUD_AUTH_BASE_URL + action + "?key=" + encodeURIComponent(CLOUD_AUTH_API_KEY);
      const response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json"
        },
        body: JSON.stringify(payload || {})
      });

      const data = await response.json();
      if (!response.ok) {
        const errorCode = (((data || {}).error || {}).message || "");
        return { ok: false, error: parseCloudAuthError(errorCode), code: errorCode };
      }

      return { ok: true, data: data };
    } catch (error) {
      return { ok: false, error: "No hay conexión con el servicio de autenticación." };
    }
  }

  async function cloudSignUp(email, password) {
    return cloudAuthRequest("signUp", {
      email: normalizeEmail(email),
      password: String(password || ""),
      returnSecureToken: true
    });
  }

  async function cloudSignIn(email, password) {
    return cloudAuthRequest("signInWithPassword", {
      email: normalizeEmail(email),
      password: String(password || ""),
      returnSecureToken: true
    });
  }

  async function cloudSendPasswordReset(email) {
    return cloudAuthRequest("sendOobCode", {
      requestType: "PASSWORD_RESET",
      email: normalizeEmail(email)
    });
  }

  async function cloudUpdateProfile(idToken, displayName) {
    const safeToken = String(idToken || "").trim();
    const safeName = String(displayName || "").trim();
    if (!safeToken || !safeName) {
      return { ok: false, error: "Datos incompletos para actualizar perfil." };
    }

    return cloudAuthRequest("update", {
      idToken: safeToken,
      displayName: safeName,
      returnSecureToken: true
    });
  }

  function bytesToHex(buffer) {
    return Array.from(new Uint8Array(buffer)).map(function (byte) {
      return byte.toString(16).padStart(2, "0");
    }).join("");
  }

  async function hashPasswordWithSalt(password, salt) {
    const payload = String(salt || "") + ":" + String(password || "");
    if (typeof crypto === "undefined" || !crypto.subtle || typeof TextEncoder === "undefined") {
      return fallbackHash(payload);
    }

    try {
      const encoded = new TextEncoder().encode(payload);
      const digest = await crypto.subtle.digest("SHA-256", encoded);
      return bytesToHex(digest);
    } catch (error) {
      return fallbackHash(payload);
    }
  }

  function hasPasswordHash(user) {
    return Boolean((user || {}).passwordHash) && Boolean((user || {}).passwordSalt);
  }

  async function buildPasswordSecurityFields(password, existingSalt) {
    const salt = String(existingSalt || randomSalt());
    const hash = await hashPasswordWithSalt(password, salt);
    return {
      password: "",
      passwordSalt: salt,
      passwordHash: hash
    };
  }

  async function verifyUserPassword(user, plainPassword) {
    if (!user) return false;

    if (hasPasswordHash(user)) {
      const computed = await hashPasswordWithSalt(plainPassword, user.passwordSalt);
      return computed === user.passwordHash;
    }

    return String(plainPassword || "") === String(user.password || "");
  }

  function getLoginGuardState() {
    const raw = localStorage.getItem(LOGIN_GUARD_KEY);
    if (!raw) return {};
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return {};
      return parsed;
    } catch (error) {
      localStorage.removeItem(LOGIN_GUARD_KEY);
      return {};
    }
  }

  function setLoginGuardState(state) {
    localStorage.setItem(LOGIN_GUARD_KEY, JSON.stringify(state || {}));
  }

  function getEmailLoginGuard(email) {
    const all = getLoginGuardState();
    const normalized = normalizeEmail(email);
    const record = all[normalized] || { attempts: 0, lockUntil: 0 };
    const now = Date.now();

    if (Number(record.lockUntil || 0) > now) {
      return { attempts: Number(record.attempts || 0), lockUntil: Number(record.lockUntil || 0) };
    }

    if (Number(record.lockUntil || 0) <= now && Number(record.attempts || 0) !== 0) {
      all[normalized] = { attempts: 0, lockUntil: 0 };
      setLoginGuardState(all);
    }

    return { attempts: 0, lockUntil: 0 };
  }

  function recordLoginFailure(email) {
    const all = getLoginGuardState();
    const normalized = normalizeEmail(email);
    const prev = all[normalized] || { attempts: 0, lockUntil: 0 };
    const attempts = Number(prev.attempts || 0) + 1;
    const lockUntil = attempts >= MAX_LOGIN_ATTEMPTS ? Date.now() + LOGIN_LOCK_MS : 0;

    all[normalized] = { attempts: attempts, lockUntil: lockUntil };
    setLoginGuardState(all);
    return all[normalized];
  }

  function clearLoginFailures(email) {
    const all = getLoginGuardState();
    const normalized = normalizeEmail(email);
    if (all[normalized]) {
      delete all[normalized];
      setLoginGuardState(all);
    }
  }

  function generateResetCode() {
    return String(Math.floor(100000 + Math.random() * 900000));
  }

  function savePendingReset(data) {
    localStorage.setItem(RESET_KEY, JSON.stringify(data || {}));
  }

  function getPendingReset() {
    const raw = localStorage.getItem(RESET_KEY);
    if (!raw) return null;
    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return null;
      return parsed;
    } catch (error) {
      localStorage.removeItem(RESET_KEY);
      return null;
    }
  }

  function clearPendingReset() {
    localStorage.removeItem(RESET_KEY);
  }

  function normalizeUser(user) {
    return {
      ...defaultUser,
      ...user,
      email: normalizeEmail((user || {}).email || defaultUser.email),
      balance: toBalanceValue((user || {}).balance)
    };
  }

  function normalizeEmail(email) {
    return String(email || "").trim().toLowerCase();
  }

  function normalizeUsername(username) {
    return String(username || "").trim().toLowerCase();
  }

  function escapeHtml(value) {
    return String(value || "")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/\"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function isAdminEmail(email) {
    const normalizedEmail = normalizeEmail(email);
    return ADMIN_EMAILS.some(function (adminEmail) {
      return normalizeEmail(adminEmail) === normalizedEmail;
    });
  }

  function isAdminUser(user) {
    return isAdminEmail((user || {}).email);
  }

  function getUsers() {
    const storedUsers = localStorage.getItem(USERS_KEY);
    if (storedUsers) {
      try {
        const parsed = JSON.parse(storedUsers);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const normalizedUsers = parsed.map(function (user) {
            return normalizeUser(user);
          });
          localStorage.setItem(USERS_KEY, JSON.stringify(normalizedUsers));
          return normalizedUsers;
        }
      } catch (error) {
        localStorage.removeItem(USERS_KEY);
      }
    }

    let initialUser = defaultUser;
    const legacyUserRaw = localStorage.getItem(USER_KEY);
    if (legacyUserRaw) {
      try {
        initialUser = { ...defaultUser, ...JSON.parse(legacyUserRaw) };
      } catch (error) {
        initialUser = defaultUser;
      }
    }

    const initialUsers = [normalizeUser(initialUser)];
    localStorage.setItem(USERS_KEY, JSON.stringify(initialUsers));
    localStorage.setItem(USER_KEY, JSON.stringify(initialUsers[0]));
    return initialUsers;
  }

  function setUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  // Funciones para Firestore - Wallet Codes en la nube
  function isFirestoreAvailable() {
    return typeof window.db !== "undefined" && window.db !== null;
  }

  async function getWalletCodesFromFirestore() {
    if (!isFirestoreAvailable()) {
      console.warn("Firestore no disponible, usando localStorage");
      return getWalletCodesLocal();
    }

    try {
      const snapshot = await window.db.collection("walletCodes").orderBy("createdAt", "desc").get();
      const codes = [];
      snapshot.forEach(function (doc) {
        codes.push({ id: doc.id, ...doc.data() });
      });
      return codes;
    } catch (error) {
      console.error("Error leyendo códigos de Firestore:", error);
      return getWalletCodesLocal();
    }
  }

  function getWalletCodesLocal() {
    const raw = localStorage.getItem(WALLET_CODES_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      localStorage.removeItem(WALLET_CODES_KEY);
      return [];
    }
  }

  function getWalletCodes() {
    return getWalletCodesLocal();
  }

  function setWalletCodes(codes) {
    localStorage.setItem(WALLET_CODES_KEY, JSON.stringify(codes));
  }

  function getEmptyProductInventory() {
    return {
      "1d": [],
      "7d": [],
      "15d": [],
      "30d": [],
      perm: []
    };
  }

  function normalizePlanKey(plan) {
    const value = String(plan || "").trim().toLowerCase();
    if (!PRODUCT_PLAN_KEYS.includes(value)) return "";
    return value;
  }

  function getProductInventory() {
    const raw = localStorage.getItem(PRODUCT_KEYS_KEY);
    const fallback = getEmptyProductInventory();
    if (!raw) return fallback;

    try {
      const parsed = JSON.parse(raw);
      if (!parsed || typeof parsed !== "object") return fallback;

      PRODUCT_PLAN_KEYS.forEach(function (plan) {
        const value = parsed[plan];
        fallback[plan] = Array.isArray(value)
          ? value.map(function (item) {
              return String(item || "").trim();
            }).filter(Boolean)
          : [];
      });

      return fallback;
    } catch (error) {
      localStorage.removeItem(PRODUCT_KEYS_KEY);
      return fallback;
    }
  }

  function setProductInventory(inventory) {
    const normalized = getEmptyProductInventory();
    PRODUCT_PLAN_KEYS.forEach(function (plan) {
      normalized[plan] = Array.isArray((inventory || {})[plan])
        ? inventory[plan].map(function (item) {
            return String(item || "").trim();
          }).filter(Boolean)
        : [];
    });
    localStorage.setItem(PRODUCT_KEYS_KEY, JSON.stringify(normalized));
  }

  function addProductKeys(plan, rawKeys, actorUser) {
    if (!isAdminUser(actorUser)) {
      return { ok: false, error: "No tienes permiso para cargar keys." };
    }

    const planKey = normalizePlanKey(plan);
    if (!planKey) {
      return { ok: false, error: "Plan inválido." };
    }

    const lines = String(rawKeys || "")
      .split(/\r?\n/g)
      .map(function (line) {
        return line.trim();
      })
      .filter(Boolean);

    if (!lines.length) {
      return { ok: false, error: "Ingresa al menos una key válida." };
    }

    const inventory = getProductInventory();
    inventory[planKey] = inventory[planKey].concat(lines);
    setProductInventory(inventory);

    return { ok: true, added: lines.length, available: inventory[planKey].length };
  }

  function getProductKeyStock(plan) {
    const planKey = normalizePlanKey(plan);
    if (!planKey) return 0;
    const inventory = getProductInventory();
    return inventory[planKey].length;
  }

  function deliverProductKey(plan) {
    const planKey = normalizePlanKey(plan);
    if (!planKey) {
      return { ok: false, error: "Plan inválido." };
    }

    const inventory = getProductInventory();
    if (!inventory[planKey].length) {
      return { ok: false, error: "No hay keys disponibles para este plan." };
    }

    const key = inventory[planKey].shift();
    setProductInventory(inventory);
    return { ok: true, key: key, remaining: inventory[planKey].length };
  }

  function restoreDeliveredKey(plan, key) {
    const planKey = normalizePlanKey(plan);
    if (!planKey || !key) return;
    const inventory = getProductInventory();
    inventory[planKey].unshift(String(key));
    setProductInventory(inventory);
  }

  function getPurchaseHistory() {
    const raw = localStorage.getItem(PURCHASE_HISTORY_KEY);
    if (!raw) return [];
    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return parsed;
    } catch (error) {
      localStorage.removeItem(PURCHASE_HISTORY_KEY);
      return [];
    }
  }

  function setPurchaseHistory(items) {
    localStorage.setItem(PURCHASE_HISTORY_KEY, JSON.stringify(Array.isArray(items) ? items : []));
  }

  function getGlobalChatMessages() {
    const raw = localStorage.getItem(GLOBAL_CHAT_KEY);
    if (!raw) return [];

    try {
      const parsed = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];

      return parsed.map(function (item) {
        return {
          id: String((item || {}).id || ""),
          email: normalizeEmail((item || {}).email),
          username: String((item || {}).username || "Usuario").trim(),
          text: String((item || {}).text || "").trim(),
          createdAt: Number((item || {}).createdAt || 0)
        };
      }).filter(function (item) {
        return Boolean(item.id) && Boolean(item.text) && Number.isFinite(item.createdAt);
      });
    } catch (error) {
      localStorage.removeItem(GLOBAL_CHAT_KEY);
      return [];
    }
  }

  function setGlobalChatMessages(messages) {
    localStorage.setItem(GLOBAL_CHAT_KEY, JSON.stringify(Array.isArray(messages) ? messages : []));
  }

  function addGlobalChatMessage(rawText, actorUser) {
    const text = String(rawText || "").trim();
    if (!text) {
      return { ok: false, error: "Escribe un mensaje antes de enviar." };
    }

    if (!actorUser || !actorUser.email) {
      return { ok: false, error: "Tu sesión no es válida." };
    }

    const normalizedText = text.slice(0, GLOBAL_CHAT_MAX_TEXT_LENGTH);
    const username = String(actorUser.username || actorUser.fullName || "Usuario").trim() || "Usuario";
    const messages = getGlobalChatMessages();

    messages.push({
      id: "msg-" + Date.now().toString(36) + "-" + Math.floor(Math.random() * 100000).toString(36),
      email: normalizeEmail(actorUser.email),
      username: username,
      text: normalizedText,
      createdAt: Date.now()
    });

    const trimmed = messages.slice(-GLOBAL_CHAT_MAX_MESSAGES);
    setGlobalChatMessages(trimmed);
    return { ok: true };
  }

  function registerProductPurchase(entry) {
    const history = getPurchaseHistory();
    history.unshift({
      email: normalizeEmail((entry || {}).email),
      product: String((entry || {}).product || ""),
      duration: String((entry || {}).duration || ""),
      key: String((entry || {}).key || ""),
      priceText: String((entry || {}).priceText || ""),
      purchasedAt: Date.now()
    });
    setPurchaseHistory(history);
  }

  function getUserPurchaseHistory(email) {
    const userEmail = normalizeEmail(email);
    return getPurchaseHistory().filter(function (item) {
      return normalizeEmail(item.email) === userEmail;
    });
  }

  async function createWalletCode(amount, creatorEmail) {
    const generatedCode = "X7-" + Date.now().toString(36).toUpperCase() + "-" + Math.floor(100 + Math.random() * 900);
    const newCode = {
      code: generatedCode,
      amount: toBalanceValue(amount),
      createdBy: normalizeEmail(creatorEmail),
      createdAt: Date.now(),
      redeemed: false,
      redeemedBy: "",
      redeemedAt: 0
    };

    if (isFirestoreAvailable()) {
      try {
        await window.db.collection("walletCodes").add(newCode);
        console.log("✅ Código guardado en Firestore (nube):", generatedCode);
        newCode._savedInCloud = true;
        return newCode;
      } catch (error) {
        console.error("❌ Error guardando en Firestore:", error);
        console.warn("Guardando en localStorage como respaldo...");
      }
    } else {
      console.warn("⚠️ Firestore no disponible. Código solo en este teléfono.");
    }

    // Fallback a localStorage si Firestore no está disponible
    const codes = getWalletCodesLocal();
    codes.unshift(newCode);
    setWalletCodes(codes);
    newCode._savedInCloud = false;
    return newCode;
  }

  function copyTextToClipboard(text) {
    const value = String(text || "");
    if (!value) return Promise.resolve(false);

    if (navigator.clipboard && typeof navigator.clipboard.writeText === "function") {
      return navigator.clipboard.writeText(value).then(function () {
        return true;
      }).catch(function () {
        return false;
      });
    }

    try {
      const tempInput = document.createElement("textarea");
      tempInput.value = value;
      tempInput.setAttribute("readonly", "");
      tempInput.style.position = "fixed";
      tempInput.style.left = "-9999px";
      document.body.appendChild(tempInput);
      tempInput.select();
      const copied = document.execCommand("copy");
      document.body.removeChild(tempInput);
      return Promise.resolve(Boolean(copied));
    } catch (error) {
      return Promise.resolve(false);
    }
  }

  async function redeemWalletCode(inputCode, redeemerEmail) {
    const code = String(inputCode || "").trim().toUpperCase();

    if (isFirestoreAvailable()) {
      try {
        const snapshot = await window.db.collection("walletCodes")
          .where("code", "==", code)
          .limit(1)
          .get();

        if (!snapshot.empty) {
          const doc = snapshot.docs[0];
          const codeData = doc.data();

          if (codeData.redeemed) {
            return { ok: false, error: "Este código ya fue canjeado." };
          }

          await doc.ref.update({
            redeemed: true,
            redeemedBy: normalizeEmail(redeemerEmail),
            redeemedAt: Date.now()
          });

          console.log("Código canjeado en Firestore:", code);
          return {
            ok: true,
            amount: toBalanceValue(codeData.amount),
            code: codeData.code
          };
        }

        // Si Firestore está disponible pero no encontró el código,
        // intentar respaldo local antes de marcarlo como inválido.
        console.warn("Código no encontrado en Firestore, intentando localStorage:", code);
      } catch (error) {
        console.error("Error canjeando en Firestore, intentando localStorage:", error);
      }
    }

    // Fallback a localStorage si Firestore no está disponible
    const codes = getWalletCodesLocal();
    const index = codes.findIndex(function (item) {
      return String(item.code || "").toUpperCase() === code;
    });

    if (index === -1) {
      return { ok: false, error: "Código inválido." };
    }

    if (codes[index].redeemed) {
      return { ok: false, error: "Este código ya fue canjeado." };
    }

    codes[index] = {
      ...codes[index],
      redeemed: true,
      redeemedBy: normalizeEmail(redeemerEmail),
      redeemedAt: Date.now()
    };
    setWalletCodes(codes);

    return {
      ok: true,
      amount: toBalanceValue(codes[index].amount),
      code: codes[index].code
    };
  }

  async function getPendingCodesByCreator(email) {
    const creatorEmail = normalizeEmail(email);

    if (isFirestoreAvailable()) {
      try {
        const snapshot = await window.db.collection("walletCodes")
          .where("createdBy", "==", creatorEmail)
          .where("redeemed", "==", false)
          .orderBy("createdAt", "desc")
          .get();

        const codes = [];
        snapshot.forEach(function (doc) {
          codes.push({ id: doc.id, ...doc.data() });
        });
        return codes;
      } catch (error) {
        console.error("Error obteniendo códigos pendientes de Firestore:", error);
      }
    }

    // Fallback a localStorage
    return getWalletCodesLocal().filter(function (item) {
      return normalizeEmail(item.createdBy) === creatorEmail && !item.redeemed;
    });
  }

  function canGenerateCodes(user) {
    return isAdminUser(user);
  }

  function findUserByEmail(email) {
    const normalized = normalizeEmail(email);
    return getUsers().find(function (user) {
      return normalizeEmail(user.email) === normalized;
    }) || null;
  }

  function findUserByUsername(username) {
    const normalized = normalizeUsername(username);
    return getUsers().find(function (user) {
      return normalizeUsername(user.username) === normalized;
    }) || null;
  }

  async function resetUserPasswordByUsername(targetUsername, newPassword, actorUser) {
    if (!isAdminUser(actorUser)) {
      return { ok: false, error: "No tienes permiso para cambiar contraseñas." };
    }

    const user = findUserByUsername(targetUsername);
    if (!user) {
      return { ok: false, error: "No se encontró ese usuario registrado." };
    }

    if (isAdminUser(user)) {
      return { ok: false, error: "No puedes cambiar contraseñas de administradores." };
    }

    if (String(newPassword || "").length < 6) {
      return { ok: false, error: "La contraseña debe tener al menos 6 caracteres." };
    }

    const passwordFields = await buildPasswordSecurityFields(newPassword, user.passwordSalt);
    const updated = updateCurrentUser({ ...user, ...passwordFields }, user.email, false);
    if (!updated) {
      return { ok: false, error: "No se pudo actualizar la contraseña." };
    }

    return { ok: true, username: user.username };
  }

  function deleteNormalUserByUsername(targetUsername, actorUser) {
    if (!isAdminUser(actorUser)) {
      return { ok: false, error: "No tienes permiso para eliminar usuarios." };
    }

    const normalizedTarget = normalizeUsername(targetUsername);
    if (!normalizedTarget) {
      return { ok: false, error: "Usuario inválido." };
    }

    const users = getUsers();
    const index = users.findIndex(function (item) {
      return normalizeUsername(item.username) === normalizedTarget;
    });

    if (index === -1) {
      return { ok: false, error: "No se encontró ese usuario registrado." };
    }

    if (isAdminUser(users[index])) {
      return { ok: false, error: "No puedes eliminar administradores." };
    }

    const removedUsername = users[index].username;
    users.splice(index, 1);
    setUsers(users);
    return { ok: true, username: removedUsername };
  }

  function setAuthenticatedUser(email) {
    localStorage.setItem(AUTH_KEY, "1");
    localStorage.setItem(AUTH_USER_KEY, normalizeEmail(email));
  }

  function getAuthenticatedEmail() {
    return normalizeEmail(localStorage.getItem(AUTH_USER_KEY));
  }

  function getCurrentUser() {
    const authEmail = getAuthenticatedEmail();
    if (!authEmail) return null;
    return findUserByEmail(authEmail);
  }

  function updateCurrentUser(updatedUser, previousEmail, syncAuth) {
    const users = getUsers();
    const currentEmail = normalizeEmail(previousEmail || updatedUser.email);
    const index = users.findIndex(function (user) {
      return normalizeEmail(user.email) === currentEmail;
    });
    if (index === -1) return false;

    users[index] = {
      ...users[index],
      ...updatedUser,
      email: normalizeEmail(updatedUser.email)
    };
    setUsers(users);
    localStorage.setItem(USER_KEY, JSON.stringify(users[index]));
    if (syncAuth !== false) {
      setAuthenticatedUser(users[index].email);
    }
    return true;
  }

  async function createUser(user) {
    const email = normalizeEmail(user.email);
    if (findUserByEmail(email)) return false;

    const users = getUsers();
    const passwordFields = await buildPasswordSecurityFields(user.password);
    const newUser = {
      fullName: user.fullName || "",
      username: user.username || email.split("@")[0],
      email,
      ...passwordFields,
      whatsapp: user.whatsapp || "+52 962 140 6226",
      bio: user.bio || "",
      avatarUrl: user.avatarUrl || "",
      balance: toBalanceValue(user.balance)
    };
    users.push(newUser);
    setUsers(users);
    return true;
  }

  async function ensureLocalUserFromEmail(email, plainPassword, fullName, whatsapp) {
    const normalizedEmail = normalizeEmail(email);
    let user = findUserByEmail(normalizedEmail);
    if (user) {
      const resolvedName = String(fullName || "").trim();
      if (resolvedName && resolvedName !== String(user.fullName || "").trim()) {
        const updated = { ...user, fullName: resolvedName };
        updateCurrentUser(updated, user.email, false);
        return updated;
      }
      return user;
    }

    const users = getUsers();
    const passwordFields = await buildPasswordSecurityFields(plainPassword);
    const username = normalizedEmail.split("@")[0] || "usuario";
    user = {
      fullName: String(fullName || username).trim(),
      username: String(username).trim(),
      email: normalizedEmail,
      ...passwordFields,
      whatsapp: String(whatsapp || "+52 962 140 6226").trim(),
      bio: "",
      avatarUrl: "",
      balance: 0
    };
    users.push(user);
    setUsers(users);
    return user;
  }

  function getUser() {
    const current = getCurrentUser();
    if (current) {
      localStorage.setItem(USER_KEY, JSON.stringify(current));
      return current;
    }
    const users = getUsers();
    const firstUser = users[0] || defaultUser;
    localStorage.setItem(USER_KEY, JSON.stringify(firstUser));
    return firstUser;
  }

  function setUser(user) {
    updateCurrentUser(user, getAuthenticatedEmail());
  }

  function setMessage(id, text, type) {
    const element = document.getElementById(id);
    if (!element) return;

    if (messageTimers[id]) {
      clearTimeout(messageTimers[id]);
      delete messageTimers[id];
    }

    element.textContent = text;
    element.classList.remove("success", "error");
    if (type) element.classList.add(type);

    if (text) {
      messageTimers[id] = setTimeout(function () {
        element.textContent = "";
        element.classList.remove("success", "error");
        delete messageTimers[id];
      }, MESSAGE_TIMEOUT_MS);
    }
  }

  function requireAuth() {
    if (localStorage.getItem(AUTH_KEY) !== "1" || !getCurrentUser()) {
      setAfterLoginRedirect();
      window.location.href = toLoginPath();
      return false;
    }
    return true;
  }

  function setupLogout() {
    const logoutBtn = document.getElementById("logoutBtn");
    if (!logoutBtn) return;

    logoutBtn.addEventListener("click", function (event) {
      event.preventDefault();
      localStorage.removeItem(AUTH_KEY);
      localStorage.removeItem(AUTH_USER_KEY);
      window.location.href = toLoginPath();
    });
  }

  function initLogin() {
    const form = document.getElementById("loginForm");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();
      const email = normalizeEmail(form.email.value);
      const password = form.password.value;
      const loginGuard = getEmailLoginGuard(email);

      if (loginGuard.lockUntil > Date.now()) {
        const remainingSeconds = Math.ceil((loginGuard.lockUntil - Date.now()) / 1000);
        setMessage("loginMessage", "Demasiados intentos. Espera " + remainingSeconds + " segundos e inténtalo de nuevo.", "error");
        return;
      }

      if (!isCloudAuthEnabled() && requiresCloudClientAccounts()) {
        setMessage("loginMessage", "Login deshabilitado: configura Firebase para usar la cuenta en cualquier telefono.", "error");
        return;
      }

      let usedLocalFallback = false;
      if (isCloudAuthEnabled()) {
        const cloudLogin = await cloudSignIn(email, password);
        const cloudFallbackAllowed = canFallbackToLocalAuth(cloudLogin.code) && !requiresCloudClientAccounts();

        if (!cloudLogin.ok && !cloudFallbackAllowed) {
          const failure = recordLoginFailure(email);
          if (failure.lockUntil > Date.now()) {
            setMessage("loginMessage", "Cuenta bloqueada temporalmente por seguridad. Intenta en 5 minutos.", "error");
            return;
          }
          if (canFallbackToLocalAuth(cloudLogin.code) && requiresCloudClientAccounts()) {
            setMessage("loginMessage", "Firebase no esta listo. El login entre telefonos requiere configurar Authentication (Email/Password).", "error");
          } else {
            setMessage("loginMessage", cloudLogin.error, "error");
          }
          return;
        }

        if (cloudLogin.ok) {
          const cloudName = String((((cloudLogin || {}).data || {}).displayName) || "").trim();
          const localUser = await ensureLocalUserFromEmail(email, password, cloudName);
          clearLoginFailures(email);
          setAuthenticatedUser(localUser.email);
          localStorage.setItem(USER_KEY, JSON.stringify(localUser));
          setMessage("loginMessage", "Login correcto. Redirigiendo...", "success");
          setTimeout(function () {
            const redirectTarget = consumeAfterLoginRedirect();
            window.location.href = redirectTarget || "../../index.html";
          }, 600);
          return;
        }

        usedLocalFallback = cloudFallbackAllowed;
      }

      const localUser = findUserByEmail(email);
      const validLocalPassword = await verifyUserPassword(localUser, password);
      if (!localUser || !validLocalPassword) {
        const failure = recordLoginFailure(email);
        if (failure.lockUntil > Date.now()) {
          setMessage("loginMessage", "Cuenta bloqueada temporalmente por seguridad. Intenta en 5 minutos.", "error");
          return;
        }
        setMessage("loginMessage", "Correo o contraseña incorrectos.", "error");
        return;
      }

      clearLoginFailures(email);
      setAuthenticatedUser(localUser.email);
      localStorage.setItem(USER_KEY, JSON.stringify(localUser));
      if (usedLocalFallback) {
        setMessage("loginMessage", "Firebase no está configurado. Iniciaste sesión en modo local.", "success");
      } else {
        setMessage("loginMessage", "Login correcto. Redirigiendo...", "success");
      }
      setTimeout(function () {
        const redirectTarget = consumeAfterLoginRedirect();
        window.location.href = redirectTarget || "../../index.html";
      }, 600);
    });
  }

  function initRegister() {
    if (localStorage.getItem(AUTH_KEY) === "1" && getCurrentUser()) {
      window.location.href = "../../index.html";
      return;
    }

    const form = document.getElementById("registerForm");
    if (!form) return;

    form.addEventListener("submit", async function (event) {
      event.preventDefault();

      const fullName = form.fullName.value.trim();
      const email = normalizeEmail(form.registerEmail.value);
      const whatsapp = form.registerWhatsapp.value.trim();
      const password = form.registerPassword.value;
      const confirmPassword = form.confirmRegisterPassword.value;

      if (!fullName || !email || !whatsapp) {
        setMessage("registerMessage", "Completa todos los campos obligatorios.", "error");
        return;
      }

      if (password.length < 6) {
        setMessage("registerMessage", "La contraseña debe tener al menos 6 caracteres.", "error");
        return;
      }

      if (password !== confirmPassword) {
        setMessage("registerMessage", "Las contraseñas no coinciden.", "error");
        return;
      }

      if (!isCloudAuthEnabled() && requiresCloudClientAccounts()) {
        setMessage("registerMessage", "Registro deshabilitado: configura Firebase para guardar clientes en la nube.", "error");
        return;
      }

      let usedLocalFallback = false;
      if (isCloudAuthEnabled()) {
        const cloudSignUpResult = await cloudSignUp(email, password);
        const cloudFallbackAllowed = canFallbackToLocalAuth(cloudSignUpResult.code) && !requiresCloudClientAccounts();

        if (!cloudSignUpResult.ok && !cloudFallbackAllowed) {
          if (canFallbackToLocalAuth(cloudSignUpResult.code) && requiresCloudClientAccounts()) {
            setMessage("registerMessage", "Firebase no esta listo. Activa Authentication (Email/Password) para registrar clientes entre telefonos.", "error");
            return;
          }
          setMessage("registerMessage", cloudSignUpResult.error, "error");
          return;
        }

        if (cloudSignUpResult.ok) {
          await cloudUpdateProfile(((cloudSignUpResult || {}).data || {}).idToken, fullName);
        }

        usedLocalFallback = !cloudSignUpResult.ok && cloudFallbackAllowed;
      }

      if (findUserByEmail(email)) {
        setMessage("registerMessage", "Ese correo ya está registrado.", "error");
        return;
      }

      const created = await createUser({
        fullName: fullName,
        email: email,
        whatsapp: whatsapp,
        password: password,
        balance: 0
      });

      if (!created) {
        setMessage("registerMessage", "No se pudo registrar el usuario.", "error");
        return;
      }

      if (usedLocalFallback) {
        setMessage("registerMessage", "Firebase no está configurado. Registro creado en modo local.", "success");
      } else {
        setMessage("registerMessage", "Registro exitoso. Ahora puedes iniciar sesión.", "success");
      }
      form.reset();
      setTimeout(function () {
        window.location.href = "./login.html";
      }, 700);
    });
  }

  function initRecover() {
    const sendCodeForm = document.getElementById("sendCodeForm");
    const resetForm = document.getElementById("resetForm");
    if (!sendCodeForm || !resetForm) return;

    resetForm.style.display = "none";
    sendCodeForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const email = normalizeEmail(sendCodeForm.recoverEmail.value);
      if (!email) {
        setMessage("recoverMessage", "Ingresa un correo válido.", "error");
        return;
      }

      const phone = String(sendCodeForm.phone.value || "").trim();

      if (!isCloudAuthEnabled() && requiresCloudClientAccounts()) {
        setMessage("recoverMessage", "Recuperacion deshabilitada: configura Firebase para cuentas entre telefonos.", "error");
        return;
      }

      if (isCloudAuthEnabled()) {
        const result = await cloudSendPasswordReset(email);
        if (result.ok) {
          setMessage("recoverMessage", "Te enviamos un correo para restablecer tu contraseña.", "success");
          return;
        }

        const cloudFallbackAllowed = canFallbackToLocalAuth(result.code) && !requiresCloudClientAccounts();
        if (!cloudFallbackAllowed) {
          if (canFallbackToLocalAuth(result.code) && requiresCloudClientAccounts()) {
            setMessage("recoverMessage", "Firebase no esta listo. La recuperacion entre telefonos requiere Authentication (Email/Password).", "error");
            return;
          }
          setMessage("recoverMessage", result.error, "error");
          return;
        }
      }

      const localUser = findUserByEmail(email);
      if (!localUser) {
        setMessage("recoverMessage", "No existe una cuenta local con ese correo.", "error");
        return;
      }

      const code = generateResetCode();
      const expiresAt = Date.now() + (10 * 60 * 1000);
      savePendingReset({
        email: email,
        code: code,
        expiresAt: expiresAt
      });

      resetForm.style.display = "grid";
      resetForm.setAttribute("data-reset-email", email);
      const phoneDigits = phone.replace(/\D/g, "");
      const text = "Hola, necesito recuperar mi cuenta. Correo: " + email + " | Código: " + code;
      const whatsappUrl = phoneDigits
        ? "https://wa.me/" + encodeURIComponent(phoneDigits) + "?text=" + encodeURIComponent(text)
        : "https://wa.me/?text=" + encodeURIComponent(text);
      window.open(whatsappUrl, "_blank", "noopener,noreferrer");

      setMessage("recoverMessage", "Firebase no está configurado. Código generado en modo local y enviado a WhatsApp.", "success");
    });

    resetForm.addEventListener("submit", async function (event) {
      event.preventDefault();
      const pending = getPendingReset();
      if (!pending) {
        setMessage("recoverMessage", "Primero solicita un código de recuperación.", "error");
        return;
      }

      if (Number(pending.expiresAt || 0) < Date.now()) {
        clearPendingReset();
        setMessage("recoverMessage", "El código expiró. Solicita uno nuevo.", "error");
        return;
      }

      const email = normalizeEmail(String(resetForm.getAttribute("data-reset-email") || pending.email || ""));
      const otp = String(resetForm.otp.value || "").trim();
      const newPassword = String(resetForm.newPassword.value || "");
      const confirmPassword = String(resetForm.confirmPassword.value || "");

      if (!otp || otp !== String(pending.code || "")) {
        setMessage("recoverMessage", "Código inválido.", "error");
        return;
      }

      if (newPassword.length < 6) {
        setMessage("recoverMessage", "La contraseña debe tener al menos 6 caracteres.", "error");
        return;
      }

      if (newPassword !== confirmPassword) {
        setMessage("recoverMessage", "Las contraseñas no coinciden.", "error");
        return;
      }

      const user = findUserByEmail(email);
      if (!user) {
        setMessage("recoverMessage", "No existe una cuenta local con ese correo.", "error");
        return;
      }

      const passwordFields = await buildPasswordSecurityFields(newPassword, user.passwordSalt);
      const updated = updateCurrentUser({ ...user, ...passwordFields }, user.email, false);
      if (!updated) {
        setMessage("recoverMessage", "No se pudo actualizar la contraseña.", "error");
        return;
      }

      clearPendingReset();
      resetForm.reset();
      setMessage("recoverMessage", "Contraseña actualizada en modo local. Ya puedes iniciar sesión.", "success");
      setTimeout(function () {
        window.location.href = "./login.html";
      }, 700);
    });
  }

  function initDashboard() {
    if (!requireAuth()) return;

    setupLogout();

    let user = getCurrentUser();
    const welcomeName = document.getElementById("welcomeName");
    if (welcomeName) {
      welcomeName.textContent = "Bienvenido, " + (user.fullName || user.username);
    }

    const availableBalance = document.getElementById("availableBalance");
    function renderBalance() {
      if (!availableBalance) return;
      const formatted = new Intl.NumberFormat("es-MX", {
        style: "currency",
        currency: "MXN"
      }).format(toBalanceValue(user.balance));
      availableBalance.textContent = formatted;
    }
    renderBalance();

    const generateCodeForm = document.getElementById("generateCodeForm");
    const generateCodeCard = document.getElementById("generateCodeCard");
    const generatedCodeMessage = document.getElementById("generatedCodeMessage");
    const myCodesList = document.getElementById("myCodesList");
    const redeemCodeForm = document.getElementById("redeemCodeForm");
    const buyProductButtons = document.querySelectorAll(".buy-product-btn");
    const stockNodes = document.querySelectorAll(".stock-value");
    const defaultPurchaseMessageId = "purchaseMessage";
    const adminKeysCard = document.getElementById("adminKeysCard");
    const adminKeysForm = document.getElementById("adminKeysForm");
    const userKeysCard = document.getElementById("userKeysCard");
    const userKeysList = document.getElementById("userKeysList");
    const adminPasswordCard = document.getElementById("adminPasswordCard");
    const adminPasswordForm = document.getElementById("adminPasswordForm");
    const adminUsersCard = document.getElementById("adminUsersCard");
    const adminUsersCount = document.getElementById("adminUsersCount");
    const adminUsersList = document.getElementById("adminUsersList");
    const adminUsersMessage = document.getElementById("adminUsersMessage");
    const userCanGenerateCodes = canGenerateCodes(user);
    const userIsAdmin = isAdminUser(user);

    if (generateCodeCard && !userCanGenerateCodes) {
      generateCodeCard.style.display = "none";
    }

    if (adminPasswordCard && !userIsAdmin) {
      adminPasswordCard.style.display = "none";
    }

    if (adminUsersCard && !userIsAdmin) {
      adminUsersCard.style.display = "none";
    }

    if (adminKeysCard && !userIsAdmin) {
      adminKeysCard.style.display = "none";
    }

    if (userKeysCard && userIsAdmin) {
      userKeysCard.style.display = "none";
    }

    function renderProductStock() {
      if (!stockNodes.length) return;
      stockNodes.forEach(function (node) {
        const plan = String(node.getAttribute("data-plan") || "");
        node.textContent = String(getProductKeyStock(plan));
      });
    }

    function renderUserPurchasedKeys() {
      if (!userKeysList || userIsAdmin) return;

      const history = getUserPurchaseHistory(user.email).slice(0, 20);
      if (!history.length) {
        userKeysList.innerHTML = "<li>Aún no tienes keys compradas.</li>";
        return;
      }

      userKeysList.innerHTML = history.map(function (item) {
        const product = escapeHtml(item.product || "x7sebaspanel para pc");
        const duration = escapeHtml(item.duration || "");
        const keyValue = escapeHtml(item.key || "");
        const priceText = escapeHtml(item.priceText || "");
        return "<li><strong>" + product + "</strong> · " + duration + " · " + priceText + "<br><strong>Key:</strong> " + keyValue + " <button type=\"button\" class=\"user-key-copy-btn\" data-key=\"" + keyValue + "\">Copiar</button></li>";
      }).join("");
    }

    if (userKeysList) {
      userKeysList.addEventListener("click", function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest(".user-key-copy-btn");
        if (!button) return;

        const keyValue = String(button.getAttribute("data-key") || "");
        if (!keyValue) return;

        copyTextToClipboard(keyValue).then(function (copied) {
          if (copied) {
            setMessage("userKeysMessage", "Key copiada: " + keyValue, "success");
          } else {
            setMessage("userKeysMessage", "No se pudo copiar automáticamente. Key: " + keyValue, "error");
          }
        });
      });
    }

    function renderAdminUsersSection() {
      if (!userIsAdmin || !adminUsersList || !adminUsersCount) return;

      const normalUsers = getUsers().filter(function (item) {
        return !isAdminUser(item);
      });

      adminUsersCount.textContent = String(normalUsers.length);

      if (!normalUsers.length) {
        adminUsersList.innerHTML = "<li>No hay usuarios registrados.</li>";
        return;
      }

      adminUsersList.innerHTML = normalUsers.slice(0, 12).map(function (item) {
        const username = escapeHtml(item.username || "sin-usuario");
        const email = escapeHtml(item.email || "sin-correo");
        return "<li class=\"admin-user-item\"><div><strong>Usuario:</strong> " + username + "</div><div><strong>Correo:</strong> " + email + "</div><button type=\"button\" class=\"admin-delete-btn\" data-username=\"" + username + "\">Eliminar</button></li>";
      }).join("");
    }

    if (adminUsersList) {
      adminUsersList.addEventListener("click", function (event) {
        const target = event.target;
        if (!(target instanceof HTMLElement)) return;
        const button = target.closest(".admin-delete-btn");
        if (!button) return;

        const username = String(button.getAttribute("data-username") || "").trim();
        if (!username) return;

        const result = deleteNormalUserByUsername(username, user);
        if (!result.ok) {
          setMessage("adminUsersMessage", result.error, "error");
          return;
        }

        setMessage("adminUsersMessage", "Usuario eliminado: " + result.username, "success");
        renderAdminUsersSection();
      });
    }

    async function renderMyCodes() {
      if (!myCodesList) return;
      const pendingCodes = await getPendingCodesByCreator(user.email);
      if (!pendingCodes.length) {
        myCodesList.innerHTML = "<li>No tienes códigos pendientes.</li>";
        return;
      }

      myCodesList.innerHTML = pendingCodes.slice(0, 6).map(function (item) {
        const amount = new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN"
        }).format(toBalanceValue(item.amount));
        return "<li><strong>" + item.code + "</strong> · " + amount + "</li>";
      }).join("");
    }

    if (generateCodeForm) {
      generateCodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!userCanGenerateCodes) {
          setMessage("generatedCodeMessage", "No tienes permiso para generar códigos.", "error");
          return;
        }

        const amount = Number(generateCodeForm.codeAmount.value);

        if (!Number.isFinite(amount) || amount <= 0) {
          setMessage("generatedCodeMessage", "Ingresa un monto válido para generar el código.", "error");
          return;
        }

        try {
          const created = await createWalletCode(amount, user.email);
          const amountText = new Intl.NumberFormat("es-MX", {
            style: "currency",
            currency: "MXN"
          }).format(toBalanceValue(created.amount));

          const cloudStatus = created._savedInCloud 
            ? "(guardado en nube ✅)" 
            : "(solo en este teléfono ⚠️)";

          copyTextToClipboard(created.code).then(function (copied) {
            if (generatedCodeMessage) {
              const copyStatus = copied ? "copiado" : "cópialo manualmente";
              setMessage("generatedCodeMessage", "Código generado: " + created.code + " por " + amountText + " " + cloudStatus + " (" + copyStatus + ")", "success");
            }
          });

          generateCodeForm.reset();
          await renderMyCodes();
        } catch (error) {
          console.error("Error generando código:", error);
          setMessage("generatedCodeMessage", "Error al generar código. Revisa la consola (F12).", "error");
        }
      });
    }

    if (redeemCodeForm) {
      redeemCodeForm.addEventListener("submit", async function (event) {
        event.preventDefault();
        const code = String(redeemCodeForm.redeemCode.value || "").trim();

        if (!code) {
          setMessage("redeemCodeMessage", "Ingresa un código para canjear.", "error");
          return;
        }

        const result = await redeemWalletCode(code, user.email);
        if (!result.ok) {
          setMessage("redeemCodeMessage", result.error, "error");
          return;
        }

        user = {
          ...user,
          balance: toBalanceValue(user.balance) + toBalanceValue(result.amount)
        };
        updateCurrentUser(user, user.email);
        renderBalance();
        await renderMyCodes();

        const amountText = new Intl.NumberFormat("es-MX", {
          style: "currency",
          currency: "MXN"
        }).format(toBalanceValue(result.amount));
        setMessage("redeemCodeMessage", "Canje exitoso: " + result.code + " (+" + amountText + ")", "success");
        redeemCodeForm.reset();
      });
    }

    if (buyProductButtons.length) {
      buyProductButtons.forEach(function (button) {
        button.addEventListener("click", function () {
          const purchaseMessageId = String(button.getAttribute("data-message-id") || defaultPurchaseMessageId);
          const product = String(button.getAttribute("data-product") || "x7sebaspanel para pc");
          const duration = String(button.getAttribute("data-duration") || "");
          const plan = String(button.getAttribute("data-plan") || "");
          const priceText = String(button.getAttribute("data-price") || "");
          const price = Number(priceText.replace(/[^0-9.]/g, ""));

          if (!Number.isFinite(price) || price <= 0) {
            setMessage(purchaseMessageId, "No se pudo procesar la compra: precio inválido.", "error");
            return;
          }

          const stock = getProductKeyStock(plan);
          if (stock <= 0) {
            setMessage(purchaseMessageId, "No hay keys disponibles para " + product + " (" + duration + ").", "error");
            return;
          }

          const currentBalance = toBalanceValue(user.balance);
          if (currentBalance < price) {
            setMessage(purchaseMessageId, "Saldo insuficiente para comprar " + product + " (" + duration + ").", "error");
            return;
          }

          const delivery = deliverProductKey(plan);
          if (!delivery.ok) {
            setMessage(purchaseMessageId, delivery.error, "error");
            renderProductStock();
            return;
          }

          const updatedUser = {
            ...user,
            balance: toBalanceValue(currentBalance - price)
          };

          const updatedOk = updateCurrentUser(updatedUser, user.email);
          if (!updatedOk) {
            restoreDeliveredKey(plan, delivery.key);
            setMessage(purchaseMessageId, "No se pudo completar la compra. Inténtalo nuevamente.", "error");
            renderProductStock();
            return;
          }

          user = updatedUser;
          renderBalance();
          renderProductStock();

          registerProductPurchase({
            email: user.email,
            product: product,
            duration: duration,
            key: delivery.key,
            priceText: priceText
          });
          renderUserPurchasedKeys();

          copyTextToClipboard(delivery.key).then(function (copied) {
            if (copied) {
              setMessage(purchaseMessageId, "Compra exitosa: " + product + " (" + duration + ") por " + priceText + ". Key: " + delivery.key + " (copiada). Quedan " + delivery.remaining + ".", "success");
            } else {
              setMessage(purchaseMessageId, "Compra exitosa: " + product + " (" + duration + ") por " + priceText + ". Key: " + delivery.key + ". Quedan " + delivery.remaining + ".", "success");
            }
          });
        });
      });
    }

    if (adminKeysForm) {
      adminKeysForm.addEventListener("submit", function (event) {
        event.preventDefault();

        if (!userIsAdmin) {
          setMessage("adminKeysMessage", "No tienes permiso para cargar keys.", "error");
          return;
        }

        const plan = String(adminKeysForm.adminPlan.value || "");
        const keysInput = String(adminKeysForm.adminKeysInput.value || "");
        const result = addProductKeys(plan, keysInput, user);

        if (!result.ok) {
          setMessage("adminKeysMessage", result.error, "error");
          return;
        }

        setMessage("adminKeysMessage", "Keys cargadas: " + result.added + ". Disponibles ahora: " + result.available + ".", "success");
        adminKeysForm.reset();
        renderProductStock();
      });
    }

    if (adminPasswordForm) {
      adminPasswordForm.addEventListener("submit", async function (event) {
        event.preventDefault();

        if (!userIsAdmin) {
          setMessage("adminPasswordMessage", "No tienes permiso para esta acción.", "error");
          return;
        }

        const targetUsername = String(adminPasswordForm.targetUsername.value || "").trim();
        const newPassword = adminPasswordForm.adminNewPassword.value;
        const confirmPassword = adminPasswordForm.adminConfirmPassword.value;

        if (!targetUsername) {
          setMessage("adminPasswordMessage", "Ingresa el usuario registrado.", "error");
          return;
        }

        if (newPassword !== confirmPassword) {
          setMessage("adminPasswordMessage", "Las contraseñas no coinciden.", "error");
          return;
        }

        const result = await resetUserPasswordByUsername(targetUsername, newPassword, user);
        if (!result.ok) {
          setMessage("adminPasswordMessage", result.error, "error");
          return;
        }

        setMessage("adminPasswordMessage", "Contraseña actualizada para el usuario: " + result.username, "success");
        adminPasswordForm.reset();
        renderAdminUsersSection();
      });
    }

    renderMyCodes();
    renderAdminUsersSection();
    renderProductStock();
    renderUserPurchasedKeys();

    window.addEventListener("storage", function (event) {
      if (event.key === AUTH_KEY || event.key === AUTH_USER_KEY) {
        if (localStorage.getItem(AUTH_KEY) !== "1" || !getCurrentUser()) {
          window.location.href = toLoginPath();
          return;
        }
      }

      if (event.key === USERS_KEY || event.key === AUTH_USER_KEY) {
        const refreshedUser = getCurrentUser();
        if (refreshedUser) {
          user = refreshedUser;
          if (welcomeName) {
            welcomeName.textContent = "Bienvenido, " + (user.fullName || user.username);
          }
          renderBalance();
          renderAdminUsersSection();
          renderUserPurchasedKeys();
        }
      }

      if (event.key === PRODUCT_KEYS_KEY) {
        renderProductStock();
      }

      if (event.key === PURCHASE_HISTORY_KEY) {
        renderUserPurchasedKeys();
      }

      if (event.key === WALLET_CODES_KEY) {
        renderMyCodes();
      }
    });
  }

  function initProfile() {
    if (!requireAuth()) return;

    setupLogout();

    const form = document.getElementById("profileForm");
    if (!form) return;

    let user = getCurrentUser();
    form.fullName.value = user.fullName || "";
    form.username.value = user.username || "";
    form.profileEmail.value = user.email || "";
    form.profileWhatsapp.value = user.whatsapp || "+52 962 140 6226";
    form.bio.value = user.bio || "";
    form.avatarUrl.value = user.avatarUrl || "";

    form.addEventListener("submit", function (event) {
      event.preventDefault();

      const newEmail = normalizeEmail(form.profileEmail.value);
      const emailInUse = getUsers().some(function (item) {
        return normalizeEmail(item.email) === newEmail && normalizeEmail(item.email) !== normalizeEmail(user.email);
      });

      if (emailInUse) {
        setMessage("profileMessage", "Ese correo ya está en uso por otra cuenta.", "error");
        return;
      }

      const updated = {
        ...user,
        fullName: form.fullName.value.trim(),
        username: form.username.value.trim(),
        email: newEmail,
        whatsapp: form.profileWhatsapp.value.trim(),
        bio: form.bio.value.trim(),
        avatarUrl: form.avatarUrl.value.trim()
      };

      updateCurrentUser(updated, user.email);
      user = updated;
      setMessage("profileMessage", "Perfil actualizado correctamente.", "success");
    });
  }

  function initUserKeys() {
    if (!requireAuth()) return;

    setupLogout();

    let user = getCurrentUser();
    const userKeysList = document.getElementById("userKeysList");
    if (!userKeysList) return;

    function renderUserPurchasedKeys() {
      const history = getUserPurchaseHistory(user.email).slice(0, 50);
      if (!history.length) {
        userKeysList.innerHTML = "<li>Aún no tienes keys compradas.</li>";
        return;
      }

      userKeysList.innerHTML = history.map(function (item) {
        const product = escapeHtml(item.product || "x7sebaspanel para pc");
        const duration = escapeHtml(item.duration || "");
        const keyValue = escapeHtml(item.key || "");
        const priceText = escapeHtml(item.priceText || "");
        return "<li><strong>" + product + "</strong> · " + duration + " · " + priceText + "<br><strong>Key:</strong> " + keyValue + " <button type=\"button\" class=\"user-key-copy-btn\" data-key=\"" + keyValue + "\">Copiar</button></li>";
      }).join("");
    }

    userKeysList.addEventListener("click", function (event) {
      const target = event.target;
      if (!(target instanceof HTMLElement)) return;
      const button = target.closest(".user-key-copy-btn");
      if (!button) return;

      const keyValue = String(button.getAttribute("data-key") || "");
      if (!keyValue) return;

      copyTextToClipboard(keyValue).then(function (copied) {
        if (copied) {
          setMessage("userKeysMessage", "Key copiada: " + keyValue, "success");
        } else {
          setMessage("userKeysMessage", "No se pudo copiar automáticamente. Key: " + keyValue, "error");
        }
      });
    });

    window.addEventListener("storage", function (event) {
      if (event.key === AUTH_KEY || event.key === AUTH_USER_KEY) {
        if (localStorage.getItem(AUTH_KEY) !== "1" || !getCurrentUser()) {
          window.location.href = toLoginPath();
          return;
        }
      }

      if (event.key === USERS_KEY || event.key === AUTH_USER_KEY) {
        const refreshedUser = getCurrentUser();
        if (refreshedUser) {
          user = refreshedUser;
        }
      }

      if (event.key === PURCHASE_HISTORY_KEY || event.key === USERS_KEY || event.key === AUTH_USER_KEY) {
        renderUserPurchasedKeys();
      }
    });

    renderUserPurchasedKeys();
  }

  function initGlobalChat() {
    if (!requireAuth()) return;

    setupLogout();

    const user = getCurrentUser();
    const chatWelcomeName = document.getElementById("chatWelcomeName");
    const chatMessages = document.getElementById("globalChatMessages");
    const chatForm = document.getElementById("globalChatForm");

    if (chatWelcomeName) {
      chatWelcomeName.textContent = "Conectado: " + (user.fullName || user.username || user.email);
    }

    if (!chatMessages || !chatForm) return;

    function formatChatDate(value) {
      const date = new Date(Number(value || 0));
      if (Number.isNaN(date.getTime())) return "Fecha inválida";
      return new Intl.DateTimeFormat("es-MX", {
        day: "2-digit",
        month: "2-digit",
        year: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      }).format(date);
    }

    function renderGlobalChat(scrollToBottom) {
      const messages = getGlobalChatMessages();
      if (!messages.length) {
        chatMessages.innerHTML = "<p class=\"chat-empty\">Aún no hay mensajes. Sé el primero en escribir.</p>";
        return;
      }

      const html = messages.map(function (item) {
        const author = escapeHtml(item.username || "Usuario");
        const messageText = escapeHtml(item.text || "");
        const timeLabel = escapeHtml(formatChatDate(item.createdAt));
        return "<article class=\"chat-item\"><div class=\"chat-item-header\"><span class=\"chat-item-user\">" + author + "</span><span>" + timeLabel + "</span></div><p class=\"chat-item-text\">" + messageText + "</p></article>";
      }).join("");

      chatMessages.innerHTML = html;

      if (scrollToBottom) {
        chatMessages.scrollTop = chatMessages.scrollHeight;
      }
    }

    chatForm.addEventListener("submit", function (event) {
      event.preventDefault();
      const value = String(chatForm.globalChatInput.value || "");
      const result = addGlobalChatMessage(value, user);

      if (!result.ok) {
        setMessage("globalChatMessage", result.error, "error");
        return;
      }

      chatForm.reset();
      renderGlobalChat(true);
      setMessage("globalChatMessage", "Mensaje enviado al chat global.", "success");
    });

    window.addEventListener("storage", function (event) {
      if (event.key === GLOBAL_CHAT_KEY) {
        renderGlobalChat(false);
      }
    });

    renderGlobalChat(true);
  }

  getUsers();

  if (page === "login") initLogin();
  if (page === "register") initRegister();
  if (page === "recover") initRecover();
  if (page === "dashboard") initDashboard();
  if (page === "profile") initProfile();
  if (page === "user-keys") initUserKeys();
  if (page === "global-chat") initGlobalChat();
})();
