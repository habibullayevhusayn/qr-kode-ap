(() => {
  "use strict";

  const HISTORY_KEY = "yoz-qr-history-v1";
  const REMINDER_ENABLED_KEY = "yoz-reminder-enabled";
  const REMINDER_DUE_KEY = "yoz-reminder-due";
  const PROMPT_SEEN_KEY = "yoz-notification-prompt-seen";
  const TWO_HOURS_MS = 2 * 60 * 60 * 1000;
  const REMINDER_TEST_INTERVAL_MS = null; // TEST ONLY: set to 15_000 to test reminders; keep null for the standard 2-hour interval.
  const REMINDER_INTERVAL_MS = REMINDER_TEST_INTERVAL_MS ?? TWO_HOURS_MS;
  const REMINDER_INTERVAL_LABEL = REMINDER_TEST_INTERVAL_MS === null
    ? "Har 2 soatda"
    : `Test rejimi: har ${Math.round(REMINDER_TEST_INTERVAL_MS / 1000)} soniyada`;
  const REMINDER_CHECK_MS = 30_000;

  const elements = {
    form: document.getElementById("qr-form"),
    label: document.getElementById("qr-label"),
    content: document.getElementById("qr-content"),
    formError: document.getElementById("form-error"),
    resultCard: document.getElementById("result-card"),
    qrCode: document.getElementById("qr-code"),
    resultLabel: document.getElementById("result-label"),
    resultContent: document.getElementById("result-content"),
    download: document.getElementById("download-qr"),
    backdrop: document.getElementById("sheet-backdrop"),
    sheet: document.getElementById("bottom-sheet"),
    sheetTitle: document.getElementById("sheet-title"),
    sheetKicker: document.getElementById("sheet-kicker"),
    historyPanel: document.getElementById("history-panel"),
    settingsPanel: document.getElementById("settings-panel"),
    historyList: document.getElementById("history-list"),
    emptyHistory: document.getElementById("empty-history"),
    notificationPrompt: document.getElementById("notification-prompt"),
    notificationStatus: document.getElementById("notification-status"),
    reminderNote: document.getElementById("reminder-note"),
    notificationToggle: document.getElementById("notification-toggle"),
    toast: document.getElementById("toast")
  };

  let toastTimeout;
  let lastFocusedElement;

  function nativeBridge() {
    const capacitor = window.Capacitor;
    if (!capacitor) return null;
    if (capacitor.Plugins && capacitor.Plugins.NativeBridge) return capacitor.Plugins.NativeBridge;
    if (typeof capacitor.registerPlugin === "function") return capacitor.registerPlugin("NativeBridge");
    return null;
  }

  function isNativeApp() {
    const capacitor = window.Capacitor;
    if (!capacitor) return false;
    return Boolean(
      (typeof capacitor.isNativePlatform === "function" && capacitor.isNativePlatform()) ||
      (capacitor.Plugins && capacitor.Plugins.NativeBridge)
    );
  }

  function showToast(message) {
    elements.toast.textContent = message;
    elements.toast.classList.add("visible");
    window.clearTimeout(toastTimeout);
    toastTimeout = window.setTimeout(() => elements.toast.classList.remove("visible"), 2800);
  }

  function getHistory() {
    const stored = localStorage.getItem(HISTORY_KEY);
    if (!stored) return [];
    try {
      const entries = JSON.parse(stored);
      if (!Array.isArray(entries)) throw new TypeError("QR tarixi ro‘yxat bo‘lishi kerak.");
      return entries.filter(entry =>
        entry && typeof entry.id === "string" &&
        typeof entry.label === "string" &&
        typeof entry.content === "string" &&
        typeof entry.createdAt === "string"
      );
    } catch (error) {
      console.error("QR tarixi o‘qilmadi:", error);
      showToast("Saqlangan QR tarixi o‘qilmadi.");
      return [];
    }
  }

  function saveHistory(entries) {
    try {
      localStorage.setItem(HISTORY_KEY, JSON.stringify(entries));
      return true;
    } catch (error) {
      console.error("QR tarixini saqlab bo‘lmadi:", error);
      showToast("Brauzer xotirasi to‘ldi. Eski QR kodlarni o‘chirib ko‘ring.");
      return false;
    }
  }

  function drawQr(target, content, size) {
    if (typeof window.QRCode !== "function") {
      throw new Error("QR kutubxonasi yuklanmadi. Internetga ulanishni tekshiring.");
    }
    target.replaceChildren();
    new window.QRCode(target, {
      text: content,
      width: size,
      height: size,
      colorDark: "#17142b",
      colorLight: "#ffffff",
      correctLevel: window.QRCode.CorrectLevel.H
    });

    const canvas = target.querySelector("canvas");
    const image = target.querySelector("img");
    if (image) {
      image.alt = "QR kod";
      image.width = size;
      image.height = size;
    }
    if (canvas) {
      canvas.setAttribute("aria-hidden", "true");
      return canvas.toDataURL("image/png");
    }
    if (image && image.src.startsWith("data:image/")) return image.src;
    throw new Error("QR kodni yaratib bo‘lmadi. Boshqa matn bilan urinib ko‘ring.");
  }

  function makeId() {
    if (window.crypto && typeof window.crypto.randomUUID === "function") return window.crypto.randomUUID();
    return `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
  }

  function makeFilename(label) {
    const safeName = label.toLowerCase().replace(/[^a-z0-9_-]+/g, "-").replace(/^-|-$/g, "");
    return `${safeName || "yoz-qr"}.png`;
  }

  function showEntry(entry, shouldSave) {
    elements.formError.textContent = "";
    elements.content.classList.remove("invalid");
    elements.content.setAttribute("aria-invalid", "false");
    try {
      const dataUrl = drawQr(elements.qrCode, entry.content, 200);
      elements.resultLabel.textContent = entry.label;
      elements.resultContent.textContent = entry.content;
      elements.download.href = dataUrl;
      elements.download.download = makeFilename(entry.label);
      elements.resultCard.classList.remove("hidden");

      if (shouldSave) {
        const history = getHistory();
        history.unshift(entry);
        if (!saveHistory(history)) return false;
      }
      return true;
    } catch (error) {
      console.error("QR yaratishda xatolik:", error);
      elements.formError.textContent = error.message || "QR kod yaratilmadi.";
      return false;
    }
  }

  function generateFromForm() {
    const content = elements.content.value.trim();
    const label = elements.label.value.trim() || "Nomsiz QR";
    if (!content) {
      elements.formError.textContent = "QR kodga aylantirish uchun matn yoki havola kiriting.";
      elements.content.classList.add("invalid");
      elements.content.setAttribute("aria-invalid", "true");
      elements.content.focus();
      return;
    }
    const entry = { id: makeId(), label, content, createdAt: new Date().toISOString() };
    if (showEntry(entry, true)) {
      elements.content.blur();
      elements.resultCard.scrollIntoView({ behavior: "smooth", block: "nearest" });
      renderHistory();
      showToast("QR kod yaratildi va saqlandi.");
    }
  }

  function formatDate(value) {
    const date = new Date(value);
    if (Number.isNaN(date.getTime())) return "Sana noma’lum";
    return new Intl.DateTimeFormat("uz-UZ", {
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }).format(date);
  }

  function createActionButton(action, label, icon, isDelete = false) {
    const button = document.createElement("button");
    button.type = "button";
    button.className = `small-action${isDelete ? " delete" : ""}`;
    button.dataset.action = action;
    button.setAttribute("aria-label", label);
    button.title = label;
    button.innerHTML = icon;
    return button;
  }

  const reuseIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 12a8 8 0 0 1 13.7-5.7L20 8.5M20 4v4.5h-4.5M20 12a8 8 0 0 1-13.7 5.7L4 15.5M4 20v-4.5h4.5" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';
  const deleteIcon = '<svg viewBox="0 0 24 24" fill="none" aria-hidden="true"><path d="M4 7h16M10 11v6m4-6v6M6 7l1 13h10l1-13M9 7V4h6v3" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/></svg>';

  function renderHistory() {
    const entries = getHistory();
    elements.historyList.replaceChildren();
    elements.emptyHistory.classList.toggle("hidden", entries.length > 0);

    for (const entry of entries) {
      const item = document.createElement("article");
      item.className = "history-item";
      item.dataset.id = entry.id;

      const thumbnail = document.createElement("div");
      thumbnail.className = "history-thumb";
      thumbnail.setAttribute("aria-hidden", "true");
      try {
        drawQr(thumbnail, entry.content, 49);
      } catch (error) {
        console.error("QR miniatura yaratilmadi:", error);
        thumbnail.textContent = "QR";
      }

      const info = document.createElement("div");
      info.className = "history-info";
      const title = document.createElement("strong");
      title.textContent = entry.label;
      const content = document.createElement("span");
      content.textContent = entry.content;
      const date = document.createElement("time");
      date.className = "history-date";
      date.dateTime = entry.createdAt;
      date.textContent = formatDate(entry.createdAt);
      info.append(title, content, date);

      const actions = document.createElement("div");
      actions.className = "history-actions";
      actions.append(
        createActionButton("reuse", "QR kodni qayta ochish", reuseIcon),
        createActionButton("delete", "QR kodni o‘chirish", deleteIcon, true)
      );
      item.append(thumbnail, info, actions);
      elements.historyList.append(item);
    }
  }

  function openSheet(mode) {
    const settings = mode === "settings";
    elements.historyPanel.classList.toggle("hidden", settings);
    elements.settingsPanel.classList.toggle("hidden", !settings);
    elements.sheetTitle.textContent = settings ? "Sozlamalar" : "Mening QR kodlarim";
    elements.sheetKicker.textContent = settings ? "SIZ UCHUN MOSLANGAN" : "SIZNING KUTUBXONANGIZ";
    if (!settings) renderHistory();

    lastFocusedElement = document.activeElement;
    elements.backdrop.classList.add("visible");
    elements.sheet.classList.add("open");
    elements.sheet.setAttribute("aria-hidden", "false");
    document.body.style.overflow = "hidden";
    document.getElementById("close-sheet").focus();
  }

  function closeSheet() {
    elements.backdrop.classList.remove("visible");
    elements.sheet.classList.remove("open");
    elements.sheet.setAttribute("aria-hidden", "true");
    document.body.style.overflow = "";
    if (lastFocusedElement && typeof lastFocusedElement.focus === "function") lastFocusedElement.focus();
  }

  function setPromptVisible(visible) {
    elements.notificationPrompt.classList.toggle("visible", visible);
    elements.notificationPrompt.setAttribute("aria-hidden", String(!visible));
  }

  function notificationsAvailable() {
    return isNativeApp() || "Notification" in window;
  }

  function reminderEnabled() {
    return localStorage.getItem(REMINDER_ENABLED_KEY) === "true";
  }

  function setReminderEnabled(enabled) {
    localStorage.setItem(REMINDER_ENABLED_KEY, String(enabled));
    elements.notificationToggle.setAttribute("aria-checked", String(enabled));
    if (enabled) {
      if (!localStorage.getItem(REMINDER_DUE_KEY)) {
        localStorage.setItem(REMINDER_DUE_KEY, String(Date.now() + REMINDER_INTERVAL_MS));
      }
      elements.notificationStatus.textContent = `${REMINDER_INTERVAL_LABEL} eslatma. Sahifa ochiq bo‘lishi kerak.`;
    } else {
      localStorage.removeItem(REMINDER_DUE_KEY);
      elements.notificationStatus.textContent = "Eslatmalar o‘chirilgan.";
    }
  }

  function syncReminderSetting() {
    if (isNativeApp()) {
      const enabled = reminderEnabled();
      elements.notificationToggle.setAttribute("aria-checked", String(enabled));
      elements.reminderNote.textContent = "Eslatma telefon bildirishnomalari orqali keladi; quvvatni tejash sozlamalari vaqtini kechiktirishi mumkin.";
      elements.notificationStatus.textContent = enabled
        ? "Telefon eslatmalari har 2 soatda keladi."
        : "Telefoningizga har 2 soatda eslatma olish uchun yoqing.";
      return;
    }
    const enabled = reminderEnabled() && notificationsAvailable() && Notification.permission === "granted";
    elements.notificationToggle.setAttribute("aria-checked", String(enabled));
    elements.reminderNote.textContent = "Eslatmalar faqat sahifa ochiq turganda ishlaydi. Bildirishnoma ruxsati brauzer sozlamalariga bog‘liq.";
    if (!notificationsAvailable()) {
      elements.notificationStatus.textContent = "Bu brauzer bildirishnomalarni qo‘llab-quvvatlamaydi.";
    } else if (Notification.permission === "denied") {
      elements.notificationStatus.textContent = "Ruxsat bloklangan. Uni brauzer sozlamalaridan o‘zgartiring.";
    } else if (!enabled) {
      elements.notificationStatus.textContent = `${REMINDER_INTERVAL_LABEL} foydali eslatma oling.`;
    } else {
      elements.notificationStatus.textContent = `${REMINDER_INTERVAL_LABEL} eslatma. Sahifa ochiq bo‘lishi kerak.`;
    }
  }

  function remind() {
    if (isNativeApp()) return;
    if (!reminderEnabled() || !notificationsAvailable() || Notification.permission !== "granted") return;
    const dueAt = Number(localStorage.getItem(REMINDER_DUE_KEY));
    if (!Number.isFinite(dueAt) || Date.now() < dueAt) return;
    const reminders = [
      ["Kichik eslatma", "Yangi QR kodingiz uchun biror foydali g‘oya bormi?"],
      ["Yoz’dan salom", "Muhim havolalaringizni QR kod qilib ulashishni unutmang."],
      ["Ijod uchun tanaffus", "Keyingi loyihangiz uchun yangi QR kod yaratib ko‘ring."]
    ];
    const [title, body] = reminders[Math.floor(Math.random() * reminders.length)];
    try {
      const notification = new Notification(title, { body, tag: "yoz-qr-reminder", renotify: false });
      notification.onclick = () => {
        window.focus();
        notification.close();
      };
      localStorage.setItem(REMINDER_DUE_KEY, String(Date.now() + REMINDER_INTERVAL_MS));
    } catch (error) {
      console.error("Bildirishnoma yuborilmadi:", error);
      showToast("Bildirishnomani yuborib bo‘lmadi.");
    }
  }

  async function enableReminders() {
    if (!notificationsAvailable()) {
      showToast("Bu brauzer bildirishnomalarni qo‘llab-quvvatlamaydi.");
      return;
    }
    if (isNativeApp()) {
      const bridge = nativeBridge();
      if (!bridge || typeof bridge.requestNotifications !== "function" || typeof bridge.scheduleReminder !== "function") {
        showToast("Android eslatma xizmati topilmadi. Ilovaning yangilangan APK’sini o‘rnating.");
        return;
      }
      try {
        const permission = await bridge.requestNotifications();
        if (!permission.granted) {
          setReminderEnabled(false);
          syncReminderSetting();
          showToast("Telefon sozlamalaridan bildirishnomalarga ruxsat bering.");
          return;
        }
        await bridge.scheduleReminder();
        setReminderEnabled(true);
        setPromptVisible(false);
        localStorage.setItem(PROMPT_SEEN_KEY, "true");
        syncReminderSetting();
        showToast("Telefon eslatmalari har 2 soatga yoqildi.");
      } catch (error) {
        console.error("Android eslatmasini yoqib bo‘lmadi:", error);
        showToast(error.message || "Telefon eslatmalarini yoqib bo‘lmadi.");
      }
      return;
    }
    if (Notification.permission === "denied") {
      syncReminderSetting();
      showToast("Ruxsatni brauzer sozlamalaridan yoqing.");
      setPromptVisible(false);
      return;
    }
    try {
      const permission = Notification.permission === "granted"
        ? "granted"
        : await Notification.requestPermission();
      if (permission === "granted") {
        setReminderEnabled(true);
        setPromptVisible(false);
        localStorage.setItem(PROMPT_SEEN_KEY, "true");
        syncReminderSetting();
        showToast("Eslatmalar yoqildi.");
      } else {
        setReminderEnabled(false);
        setPromptVisible(false);
        localStorage.setItem(PROMPT_SEEN_KEY, "true");
        syncReminderSetting();
        showToast("Bildirishnoma ruxsati berilmadi.");
      }
    } catch (error) {
      console.error("Bildirishnoma ruxsatini so‘rashda xatolik:", error);
      showToast("Bildirishnoma ruxsatini so‘rab bo‘lmadi.");
    }
  }

  elements.form.addEventListener("submit", event => {
    event.preventDefault();
    generateFromForm();
  });

  elements.download.addEventListener("click", async event => {
    if (!isNativeApp()) return;
    event.preventDefault();
    const bridge = nativeBridge();
    if (!bridge || typeof bridge.saveImage !== "function") {
      showToast("Galereya xizmati topilmadi. Ilovaning yangilangan APK’sini o‘rnating.");
      return;
    }
    try {
      const dataUrl = elements.download.href;
      const separator = dataUrl.indexOf(",");
      if (separator < 0) throw new Error("QR rasm formati noto‘g‘ri.");
      await bridge.saveImage({
        base64: dataUrl.slice(separator + 1),
        filename: elements.download.download || "yoz-qr.png"
      });
      showToast("QR kod telefon galereyasidagi Pictures/Yoz QR papkasiga saqlandi.");
    } catch (error) {
      console.error("QR kodni telefon galereyasiga saqlab bo‘lmadi:", error);
      showToast(error.message || "QR kod galereyaga saqlanmadi.");
    }
  });

  elements.content.addEventListener("input", () => {
    if (!elements.content.value.trim()) return;
    elements.content.classList.remove("invalid");
    elements.content.setAttribute("aria-invalid", "false");
    elements.formError.textContent = "";
  });

  const nav = document.getElementById("bottom-nav");
  const navIndicator = document.getElementById("nav-liquid-indicator");
  const navButtons = [...document.querySelectorAll(".nav-item[data-sheet]")];
  let activeNavIndex = Math.max(0, navButtons.findIndex(button => button.classList.contains("active")));
  let navPointer = null;
  let suppressNavClickUntil = 0;

  function setNavIndicator(index, stretch = 1) {
    const button = navButtons[index];
    if (!button) return;
    const navBounds = nav.getBoundingClientRect();
    const buttonBounds = button.getBoundingClientRect();
    const indicatorWidth = navIndicator.getBoundingClientRect().width;
    const desiredLeft = buttonBounds.left + buttonBounds.width / 2 - navBounds.left - indicatorWidth / 2;
    const maxLeft = navBounds.width - indicatorWidth - 8;
    const shift = Math.max(8, Math.min(maxLeft, desiredLeft)) - 8;
    nav.style.setProperty("--nav-shift", `${shift}px`);
    nav.style.setProperty("--nav-stretch", String(stretch));
  }

  function activateNavButton(button, open = true) {
    const index = navButtons.indexOf(button);
    if (index < 0) return;
    activeNavIndex = index;
    for (const item of navButtons) {
      const active = item === button;
      item.classList.toggle("active", active);
      if (active) item.setAttribute("aria-current", "page");
      else item.removeAttribute("aria-current");
    }
    setNavIndicator(index);
    if (open) openSheet(button.dataset.sheet);
  }

  for (const button of navButtons) {
    button.addEventListener("click", () => {
      if (Date.now() < suppressNavClickUntil) return;
      activateNavButton(button);
    });
  }

  nav.addEventListener("pointerdown", event => {
    if (event.button !== undefined && event.button !== 0) return;
    navPointer = {
      id: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastTime: performance.now(),
      dragging: false
    };
  });

  document.addEventListener("pointermove", event => {
    if (!navPointer || event.pointerId !== navPointer.id) return;
    const deltaX = event.clientX - navPointer.startX;
    const deltaY = event.clientY - navPointer.startY;
    if (!navPointer.dragging && Math.abs(deltaX) > 7 && Math.abs(deltaX) > Math.abs(deltaY)) {
      navPointer.dragging = true;
      nav.classList.add("dragging");
    }
    if (!navPointer.dragging) return;

    const now = performance.now();
    const speed = Math.abs(event.clientX - navPointer.lastX) / Math.max(1, now - navPointer.lastTime);
    const stretch = Math.min(1.16, 1 + speed * 0.045);
    const navBounds = nav.getBoundingClientRect();
    const indicatorWidth = navIndicator.getBoundingClientRect().width;
    const left = event.clientX - navBounds.left - indicatorWidth / 2;
    const maxLeft = navBounds.width - indicatorWidth - 8;
    nav.style.setProperty("--nav-shift", `${Math.max(8, Math.min(maxLeft, left)) - 8}px`);
    nav.style.setProperty("--nav-stretch", String(stretch));
    navPointer.lastX = event.clientX;
    navPointer.lastTime = now;
  });

  function finishNavPointer(event) {
    if (!navPointer || event.pointerId !== navPointer.id) return;
    const pointer = navPointer;
    navPointer = null;
    nav.classList.remove("dragging");
    if (!pointer.dragging) return;

    const navBounds = nav.getBoundingClientRect();
    const localX = Math.max(0, Math.min(navBounds.width, event.clientX - navBounds.left));
    const index = localX >= navBounds.width / 2 ? 1 : 0;
    setNavIndicator(index);
    activateNavButton(navButtons[index]);
    suppressNavClickUntil = Date.now() + 450;
  }

  document.addEventListener("pointerup", finishNavPointer);
  document.addEventListener("pointercancel", finishNavPointer);
  window.addEventListener("resize", () => setNavIndicator(activeNavIndex));
  requestAnimationFrame(() => setNavIndicator(activeNavIndex));
  document.getElementById("close-sheet").addEventListener("click", closeSheet);
  elements.backdrop.addEventListener("click", closeSheet);
  document.getElementById("create-first-qr").addEventListener("click", () => {
    closeSheet();
    elements.content.focus();
    window.scrollTo({ top: 0, behavior: "smooth" });
  });

  elements.historyList.addEventListener("click", event => {
    const button = event.target.closest("button[data-action]");
    if (!button) return;
    const item = button.closest(".history-item");
    const entry = getHistory().find(saved => saved.id === item.dataset.id);
    if (!entry) {
      renderHistory();
      showToast("QR kod topilmadi.");
      return;
    }
    if (button.dataset.action === "delete") {
      if (saveHistory(getHistory().filter(saved => saved.id !== entry.id))) {
        renderHistory();
        showToast("QR kod o‘chirildi.");
      }
      return;
    }
    if (button.dataset.action === "reuse") {
      elements.label.value = entry.label;
      elements.content.value = entry.content;
      closeSheet();
      if (showEntry(entry, false)) {
        window.scrollTo({ top: 0, behavior: "smooth" });
        showToast("Saqlangan QR kod qayta ochildi.");
      }
    }
  });

  elements.notificationToggle.addEventListener("click", () => {
    if (isNativeApp() && reminderEnabled()) {
      const bridge = nativeBridge();
      if (!bridge || typeof bridge.cancelReminder !== "function") {
        showToast("Android eslatma xizmati topilmadi.");
        return;
      }
      bridge.cancelReminder()
        .then(() => {
          setReminderEnabled(false);
          syncReminderSetting();
          showToast("Telefon eslatmalari o‘chirildi.");
        })
        .catch(error => {
          console.error("Android eslatmasini o‘chirib bo‘lmadi:", error);
          showToast(error.message || "Telefon eslatmalarini o‘chirib bo‘lmadi.");
        });
      return;
    }
    if (reminderEnabled() && notificationsAvailable() && Notification.permission === "granted") {
      setReminderEnabled(false);
      syncReminderSetting();
      showToast("Eslatmalar o‘chirildi.");
    } else {
      enableReminders();
    }
  });
  document.getElementById("enable-notifications").addEventListener("click", enableReminders);
  document.getElementById("dismiss-notifications").addEventListener("click", () => {
    localStorage.setItem(PROMPT_SEEN_KEY, "true");
    setPromptVisible(false);
  });
  elements.notificationPrompt.addEventListener("click", event => {
    if (event.target === elements.notificationPrompt) {
      localStorage.setItem(PROMPT_SEEN_KEY, "true");
      setPromptVisible(false);
    }
  });

  document.addEventListener("keydown", event => {
    if (event.key === "Escape") {
      if (elements.notificationPrompt.classList.contains("visible")) setPromptVisible(false);
      else if (elements.sheet.classList.contains("open")) closeSheet();
    }
  });

  let dragStartY = null;
  const sheetHandle = document.getElementById("sheet-handle");
  sheetHandle.addEventListener("pointerdown", event => {
    dragStartY = event.clientY;
    sheetHandle.setPointerCapture(event.pointerId);
  });
  sheetHandle.addEventListener("pointerup", event => {
    if (dragStartY !== null && event.clientY - dragStartY > 55) closeSheet();
    dragStartY = null;
  });
  sheetHandle.addEventListener("pointercancel", () => { dragStartY = null; });

  function initializeLiquidNavigation() {
    const canvas = document.getElementById("nav-liquid-canvas");
    const navigation = document.getElementById("bottom-nav");
    const gl = canvas.getContext("webgl", {
      alpha: true,
      antialias: false,
      powerPreference: "low-power"
    });
    if (!gl) {
      console.warn("WebGL ishlamayapti; navbar CSS shisha uslubida ko‘rsatiladi.");
      return;
    }

    const vertexSource = `
      attribute vec2 position;
      void main() {
        gl_Position = vec4(position, 0.0, 1.0);
      }
    `;
    const fragmentSource = `
      precision mediump float;
      uniform vec2 uResolution;
      uniform float uTime;
      uniform vec2 uPointer;
      uniform float uPointerActive;

      vec3 glassScene(vec2 uv) {
        float drift = sin(uTime * 0.34 + uv.x * 4.0) * 0.025;
        vec3 color = mix(vec3(0.055, 0.045, 0.12), vec3(0.13, 0.10, 0.23), clamp(uv.y + drift, 0.0, 1.0));
        float leftGlow = exp(-dot((uv - vec2(0.2, 0.24)) * vec2(1.2, 1.7), (uv - vec2(0.2, 0.24)) * vec2(1.2, 1.7)) * 9.0);
        float rightGlow = exp(-dot((uv - vec2(0.83, 0.78)) * vec2(1.4, 1.8), (uv - vec2(0.83, 0.78)) * vec2(1.4, 1.8)) * 10.0);
        float ribbon = exp(-abs(uv.y - 0.5 - sin(uv.x * 5.2 + uTime * 0.22) * 0.12) * 17.0);
        color += vec3(0.25, 0.19, 0.46) * leftGlow;
        color += vec3(0.36, 0.16, 0.39) * rightGlow;
        color += vec3(0.18, 0.17, 0.28) * ribbon * 0.48;
        return color;
      }

      void main() {
        vec2 uv = gl_FragCoord.xy / uResolution;
        vec2 aspect = vec2(uResolution.x / uResolution.y, 1.0);
        vec2 delta = (uv - uPointer) * aspect;
        float distanceToPointer = length(delta);
        float lens = exp(-distanceToPointer * distanceToPointer * 38.0) * uPointerActive;
        vec2 direction = normalize(delta + vec2(0.0001));
        vec2 warpedUv = clamp(uv + direction * lens * 0.085, 0.0, 1.0);
        vec3 color = mix(glassScene(uv), glassScene(warpedUv), lens * 0.9);
        float upperSheen = exp(-abs(uv.y - 0.91) * 21.0) * 0.12;
        float lowerEdge = exp(-abs(uv.y - 0.02) * 35.0) * 0.1;
        color += vec3(0.78, 0.72, 1.0) * (upperSheen + lowerEdge);
        gl_FragColor = vec4(color, 0.78);
      }
    `;

    function compileShader(type, source) {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("WebGL shader yaratilmadi.");
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        const message = gl.getShaderInfoLog(shader) || "Noma’lum shader xatosi.";
        gl.deleteShader(shader);
        throw new Error(message);
      }
      return shader;
    }

    let vertexShader;
    let fragmentShader;
    let program;
    let animationFrame = 0;
    let pointer = [0.5, 0.5];
    let pointerActive = 0;
    let lastFrameTime = 0;
    const reducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)");

    try {
      vertexShader = compileShader(gl.VERTEX_SHADER, vertexSource);
      fragmentShader = compileShader(gl.FRAGMENT_SHADER, fragmentSource);
      program = gl.createProgram();
      if (!program) throw new Error("WebGL program yaratilmadi.");
      gl.attachShader(program, vertexShader);
      gl.attachShader(program, fragmentShader);
      gl.linkProgram(program);
      if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        throw new Error(gl.getProgramInfoLog(program) || "WebGL program ulanmagan.");
      }
      gl.useProgram(program);

      const buffer = gl.createBuffer();
      if (!buffer) throw new Error("WebGL buffer yaratilmadi.");
      gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
      const position = gl.getAttribLocation(program, "position");
      gl.enableVertexAttribArray(position);
      gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);

      const resolutionLocation = gl.getUniformLocation(program, "uResolution");
      const timeLocation = gl.getUniformLocation(program, "uTime");
      const pointerLocation = gl.getUniformLocation(program, "uPointer");
      const pointerActiveLocation = gl.getUniformLocation(program, "uPointerActive");
      const startTime = performance.now();

      function resizeCanvas() {
        const bounds = navigation.getBoundingClientRect();
        const pixelRatio = Math.min(window.devicePixelRatio || 1, 2);
        const width = Math.max(1, Math.round(bounds.width * pixelRatio));
        const height = Math.max(1, Math.round(bounds.height * pixelRatio));
        if (canvas.width !== width || canvas.height !== height) {
          canvas.width = width;
          canvas.height = height;
        }
        gl.viewport(0, 0, width, height);
        gl.uniform2f(resolutionLocation, width, height);
        if (reducedMotion.matches) drawFrame(performance.now(), true);
      }

      function drawFrame(now) {
        gl.clearColor(0, 0, 0, 0);
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(timeLocation, reducedMotion.matches ? 0 : (now - startTime) / 1000);
        gl.uniform2f(pointerLocation, pointer[0], pointer[1]);
        gl.uniform1f(pointerActiveLocation, pointerActive);
        gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
      }

      function scheduleFrame() {
        if (!animationFrame && !document.hidden && !reducedMotion.matches) {
          animationFrame = window.requestAnimationFrame(now => {
            animationFrame = 0;
            if (now - lastFrameTime >= 1000 / 30) {
              lastFrameTime = now;
              drawFrame(now);
            }
            scheduleFrame();
          });
        } else if (reducedMotion.matches) {
          drawFrame(performance.now());
        }
      }

      navigation.addEventListener("pointermove", event => {
        const bounds = canvas.getBoundingClientRect();
        pointer = [
          Math.max(0, Math.min(1, (event.clientX - bounds.left) / bounds.width)),
          1 - Math.max(0, Math.min(1, (event.clientY - bounds.top) / bounds.height))
        ];
        pointerActive = 1;
        scheduleFrame();
      });
      navigation.addEventListener("pointerleave", () => {
        pointerActive = 0;
        scheduleFrame();
      });
      document.addEventListener("visibilitychange", () => {
        if (document.hidden && animationFrame) {
          window.cancelAnimationFrame(animationFrame);
          animationFrame = 0;
        } else {
          scheduleFrame();
        }
      });
      window.addEventListener("resize", resizeCanvas);
      if ("ResizeObserver" in window) new window.ResizeObserver(resizeCanvas).observe(navigation);
      resizeCanvas();
      scheduleFrame();
      if (vertexShader) gl.deleteShader(vertexShader);
      if (fragmentShader) gl.deleteShader(fragmentShader);
    } catch (error) {
      if (animationFrame) window.cancelAnimationFrame(animationFrame);
      console.error("Navbar WebGL effekti ishga tushmadi; CSS shisha foni ishlatiladi:", error);
    }
  }

  initializeLiquidNavigation();
  syncReminderSetting();
  window.setInterval(remind, REMINDER_CHECK_MS);
  document.addEventListener("visibilitychange", () => {
    if (!document.hidden) remind();
  });
  const canOfferReminderPrompt = isNativeApp() ||
    ("Notification" in window && Notification.permission !== "denied");
  if (
    canOfferReminderPrompt &&
    localStorage.getItem(REMINDER_ENABLED_KEY) === null &&
    localStorage.getItem(PROMPT_SEEN_KEY) !== "true"
  ) {
    window.setTimeout(() => setPromptVisible(true), 700);
  }
})();
