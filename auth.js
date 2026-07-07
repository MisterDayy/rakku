const AuthApp = (function () {
  const app = document.getElementById("app");
  const client = supabaseClient;

  let cachedUser = null;
  let cachedProfile = null;
  let ready = false;
  let readyResolve;
  const readyPromise = new Promise((res) => { readyResolve = res; });

  let banChannel = null;
  let forcingLogout = false;

  async function fetchProfile(userId) {
    if (!userId) {
      cachedProfile = null;
      return null;
    }
    const { data, error } = await client.from("profiles").select("*").eq("id", userId).single();
    cachedProfile = error ? null : data;
    return cachedProfile;
  }

  function stopBanWatcher() {
    if (banChannel) {
      client.removeChannel(banChannel);
      banChannel = null;
    }
  }

  function startBanWatcher(userId) {
    stopBanWatcher();
    if (!userId) return;
    banChannel = client
      .channel(`profile-ban-watch:${userId}`)
      .on(
        "postgres_changes",
        { event: "UPDATE", schema: "public", table: "profiles", filter: `id=eq.${userId}` },
        (payload) => {
          if (payload.new?.is_banned) {
            forceBanLogout(payload.new.banned_reason);
          }
        }
      )
      .subscribe();
  }

  async function forceBanLogout(reason) {
    if (forcingLogout) return;
    forcingLogout = true;
    stopBanWatcher();
    await client.auth.signOut();
    cachedUser = null;
    cachedProfile = null;
    alert(reason ? `Akun kamu telah dibanned. Alasan: ${reason}` : "Akun kamu telah dibanned dan tidak bisa digunakan.");
    window.location.reload();
  }

  client.auth.getSession().then(async ({ data }) => {
    cachedUser = data.session?.user || null;
    if (cachedUser) {
      const profile = await fetchProfile(cachedUser.id);
      if (profile?.is_banned) {
        await client.auth.signOut();
        cachedUser = null;
        cachedProfile = null;
      } else {
        startBanWatcher(cachedUser.id);
      }
    }
    ready = true;
    readyResolve();
  });

  client.auth.onAuthStateChange(async (_event, session) => {
    cachedUser = session?.user || null;
    if (cachedUser) {
      await fetchProfile(cachedUser.id);
      startBanWatcher(cachedUser.id);
    } else {
      cachedProfile = null;
      stopBanWatcher();
    }
  });

  function getCachedUser() {
    return cachedUser;
  }

  function getCachedProfile() {
    return cachedProfile;
  }

  function getRole() {
    return cachedProfile?.role || "user";
  }

  function isStaff() {
    return getRole() === "admin" || getRole() === "moderator";
  }

  function isAdmin() {
    return getRole() === "admin";
  }

  function isReady() {
    return ready;
  }

  function waitUntilReady() {
    return readyPromise;
  }

  function loadingBlock(text) {
    return `<div class="loading"><div class="spinner"></div>${text || "Memuat..."}</div>`;
  }

  function translateAuthError(msg) {
    const m = (msg || "").toLowerCase();
    if (m.includes("invalid login credentials")) return "Email atau password salah.";
    if (m.includes("user already registered")) return "Email ini sudah terdaftar. Coba login.";
    if (m.includes("password should be at least")) return "Password minimal 6 karakter.";
    if (m.includes("unable to validate email")) return "Format email tidak valid.";
    if (m.includes("email not confirmed")) return "Email belum dikonfirmasi. Cek inbox kamu dulu.";
    return msg || "Terjadi kesalahan, coba lagi.";
  }

  function renderLogin() {
    if (window.setBottomNavActive) window.setBottomNavActive("");
    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Masuk ke Akun</div>
      <form id="loginForm" class="auth-form">
        <label for="loginEmail">Email</label>
        <input type="email" id="loginEmail" required placeholder="nama@email.com" autocomplete="email" />
        <label for="loginPassword">Password</label>
        <input type="password" id="loginPassword" required minlength="6" placeholder="Password" autocomplete="current-password" />
        <div class="auth-error" id="loginError"></div>
        <button type="submit" class="auth-submit">Masuk</button>
      </form>
      <p class="auth-switch">Belum punya akun? <a href="#" id="goRegister">Daftar di sini</a></p>
    `;

    document.getElementById("goRegister").addEventListener("click", (e) => {
      e.preventDefault();
      renderRegister();
    });

    document.getElementById("loginForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const email = document.getElementById("loginEmail").value.trim();
      const password = document.getElementById("loginPassword").value;
      const errBox = document.getElementById("loginError");
      const btn = e.target.querySelector(".auth-submit");

      errBox.textContent = "";
      btn.disabled = true;
      btn.textContent = "Memproses...";

      const { data, error } = await client.auth.signInWithPassword({ email, password });

      if (error) {
        errBox.textContent = translateAuthError(error.message);
        btn.disabled = false;
        btn.textContent = "Masuk";
        return;
      }

      cachedUser = data.user;
      const profile = await fetchProfile(data.user.id);

      if (profile?.is_banned) {
        await client.auth.signOut();
        cachedUser = null;
        cachedProfile = null;
        errBox.textContent = profile.banned_reason
          ? `Akun kamu dibanned. Alasan: ${profile.banned_reason}`
          : "Akun kamu dibanned dan tidak bisa digunakan.";
        btn.disabled = false;
        btn.textContent = "Masuk";
        return;
      }

      if (window.onAuthSuccess) window.onAuthSuccess();
    });
  }

  function renderRegister() {
    if (window.setBottomNavActive) window.setBottomNavActive("");
    app.innerHTML = `
      <div class="section-title"><span class="st-bar"></span>Buat Akun Baru</div>
      <form id="registerForm" class="auth-form">
        <label for="regUsername">Username</label>
        <input type="text" id="regUsername" required minlength="3" placeholder="Nama unik kamu" autocomplete="nickname" />
        <label for="regEmail">Email</label>
        <input type="email" id="regEmail" required placeholder="nama@email.com" autocomplete="email" />
        <label for="regPassword">Password</label>
        <input type="password" id="regPassword" required minlength="6" placeholder="Minimal 6 karakter" autocomplete="new-password" />
        <div class="auth-error" id="regError"></div>
        <button type="submit" class="auth-submit">Daftar</button>
      </form>
      <p class="auth-switch">Sudah punya akun? <a href="#" id="goLogin">Masuk di sini</a></p>
    `;

    document.getElementById("goLogin").addEventListener("click", (e) => {
      e.preventDefault();
      renderLogin();
    });

    document.getElementById("registerForm").addEventListener("submit", async (e) => {
      e.preventDefault();
      const username = document.getElementById("regUsername").value.trim();
      const email = document.getElementById("regEmail").value.trim();
      const password = document.getElementById("regPassword").value;
      const errBox = document.getElementById("regError");
      const btn = e.target.querySelector(".auth-submit");

      errBox.textContent = "";
      btn.disabled = true;
      btn.textContent = "Memproses...";

      const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: { username } },
      });

      if (error) {
        errBox.textContent = translateAuthError(error.message);
        btn.disabled = false;
        btn.textContent = "Daftar";
        return;
      }

      cachedUser = data.user;

      if (!data.session) {
        app.innerHTML = `
          <div class="section-title"><span class="st-bar"></span>Cek Email Kamu</div>
          <p class="auth-info">Link konfirmasi sudah dikirim ke <b>${email}</b>. Buka email itu dulu, baru login ke aplikasi.</p>
          <button class="auth-submit" id="backToLoginBtn" type="button">Kembali ke Login</button>
        `;
        document.getElementById("backToLoginBtn").addEventListener("click", renderLogin);
        return;
      }

      if (window.onAuthSuccess) window.onAuthSuccess();
    });
  }

  async function logout() {
    stopBanWatcher();
    await client.auth.signOut();
    cachedUser = null;
    cachedProfile = null;
  }

  return {
    renderLogin,
    renderRegister,
    logout,
    getCachedUser,
    getCachedProfile,
    getRole,
    isStaff,
    isAdmin,
    isReady,
    waitUntilReady,
  };
})();
