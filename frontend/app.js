const state = { service: null, master: null, slot: null, step: 1 };
const $ = (id) => document.getElementById(id);
const stepTitles = { 1: "Услуга", 2: "Мастер", 3: "Время", 4: "Данные" };
const SECTIONS = [1, 2, 3, 4, 5];

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

let suppressPush = false;
let firstShow = true;

function show(step) {
  state.step = step;
  SECTIONS.forEach((n) => $("step-" + n).classList.toggle("hidden", n !== step));
  $("back").classList.toggle("hidden", step === 1 || step === 5);
  if (step === 4) renderReview();
  renderProgress();
  if (firstShow) {
    history.replaceState({ step }, "", "#step-" + step);
    firstShow = false;
  } else if (!suppressPush) {
    history.pushState({ step }, "", "#step-" + step);
  }
  suppressPush = false;
}

window.addEventListener("popstate", (e) => {
  const step = e.state && SECTIONS.includes(e.state.step) ? e.state.step : 1;
  suppressPush = true;
  show(step);
});

function renderReview() {
  const when = new Date(`${$("date").value}T${state.slot}`);
  $("booking-review").innerHTML = [
    ["Услуга", esc(state.service.title), `${state.service.price} ₽ · ${state.service.duration_minutes} мин`],
    ["Мастер", esc(state.master.name), esc(state.master.specialty)],
    ["Время", when.toLocaleDateString("ru-RU", { day: "numeric", month: "long" }), when.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })],
  ].map(([k, a, b]) => `
    <div class="flex items-center justify-between gap-4 py-2.5 border-b border-slate-100 last:border-0">
      <span class="text-xs font-semibold uppercase tracking-wider text-slate-400">${k}</span>
      <span class="text-right"><span class="font-semibold">${a}</span> <span class="text-slate-500 text-sm">· ${b}</span></span>
    </div>`).join("");
}

function renderProgress() {
  $("progress").innerHTML = Object.entries(stepTitles).map(([n, title]) => {
    const done = +n < state.step, active = +n === state.step;
    const dot = done ? "✓" : n;
    const cls = done ? "bg-emerald-500 text-white"
      : active ? "bg-rose-600 text-white"
      : "bg-slate-200 text-slate-500";
    return `<li class="flex items-center gap-2">
      <span class="w-7 h-7 rounded-full ${cls} grid place-items-center font-semibold">${dot}</span>
      <span class="${active ? "text-slate-900 font-semibold" : ""}">${title}</span>
      <span class="mx-2 w-8 sm:w-12 h-px bg-slate-300"></span>
    </li>`;
  }).join("");
}

async function api(path) {
  const res = await fetch("/api" + path);
  if (!res.ok) throw new Error(await res.json().then((e) => e.detail || "Ошибка"));
  return res.json();
}

function masterCard(m, selected, onclick) {
  const el = document.createElement("button");
  el.className = "fade-in text-left p-5 rounded-3xl border bg-white transition duration-150 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-200/50 hover:-translate-y-0.5 " +
    (selected ? "border-rose-500 ring-2 ring-rose-200" : "border-slate-200");

  const wrap = document.createElement("div");
  wrap.className = "flex items-center gap-4";

  const initials = m.name.trim().split(/\s+/).map((w) => w[0]).slice(0, 2).join("").toUpperCase();
  if (m.photo_url) {
    const img = document.createElement("img");
    img.src = m.photo_url;
    img.alt = m.name;
    img.className = "w-16 h-16 rounded-full object-cover bg-slate-100 shrink-0";
    img.onerror = () => {
      const fb = document.createElement("div");
      fb.className = "w-16 h-16 rounded-full bg-rose-100 text-rose-600 grid place-items-center font-bold text-lg shrink-0";
      fb.textContent = initials;
      img.replaceWith(fb);
    };
    wrap.appendChild(img);
  } else {
    const fb = document.createElement("div");
    fb.className = "w-16 h-16 rounded-full bg-rose-100 text-rose-600 grid place-items-center font-bold text-lg shrink-0";
    fb.textContent = initials;
    wrap.appendChild(fb);
  }

  const info = document.createElement("div");
  info.innerHTML =
    `<p class="font-semibold">${esc(m.name)}</p>` +
    `<p class="text-sm text-slate-500 mt-0.5">${esc(m.specialty)}</p>` +
    `<p class="text-sm mt-1.5">` +
      `<span class="text-amber-500">★</span> ` +
      `<span class="font-semibold">${m.rating ?? "—"} </span>` +
      (m.experience_years != null ? `<span class="text-slate-400">· стаж ${esc(m.experience_years)} ${m.experience_years % 10 === 1 && m.experience_years % 100 !== 11 ? "год" : (m.experience_years % 10 >= 2 && m.experience_years % 10 <= 4 && ![12,13,14].includes(m.experience_years) ? "года" : "лет")}</span>` : "") +
    `</p>`;
  wrap.appendChild(info);
  el.appendChild(wrap);

  const works = (m.services || []).slice(0, 3);
  if (works.length) {
    const chips = document.createElement("div");
    chips.className = "mt-4 flex flex-wrap gap-2";
    works.forEach((s) => {
      const chip = document.createElement("span");
      chip.className = "text-xs font-medium bg-slate-100 text-slate-600 rounded-full px-3 py-1";
      chip.textContent = `${s.title} · ${s.price.toLocaleString("ru-RU")} ₽`;
      chips.appendChild(chip);
    });
    el.appendChild(chips);
  }
  el.onclick = onclick;
  return el;
}

async function loadServices() {
  const services = await api("/services");
  const box = $("services");
  box.innerHTML = "";
  services.forEach((s) => {
    const el = document.createElement("button");
    el.className = "fade-in text-left p-5 rounded-3xl border bg-white transition duration-150 hover:border-rose-400 hover:shadow-lg hover:shadow-rose-200/50 hover:-translate-y-0.5 " +
      (state.service?.id === s.id ? "border-rose-500 ring-2 ring-rose-200" : "border-slate-200");
    el.innerHTML = `<p class="font-semibold">${esc(s.title)}</p><p class="text-sm text-slate-500 mt-1.5">${s.price} ₽ · ${s.duration_minutes} мин</p>`;
    el.onclick = () => { state.service = s; loadMasters(); };
    box.appendChild(el);
  });
}

async function loadMasters() {
  show(2);
  const box = $("masters");
  box.innerHTML = `<p class="text-sm text-slate-400">Загрузка…</p>`;
  $("masters-empty").classList.add("hidden");
  const masters = await api(`/masters?service_id=${state.service.id}`);
  box.innerHTML = "";
  if (!masters.length) { $("masters-empty").classList.remove("hidden"); return; }
  masters.forEach((m) => box.appendChild(masterCard(
    m,
    state.master?.id === m.id,
    () => { state.master = m; initDate(); },
  )));
}

function initDate() {
  const input = $("date");
  input.min = new Date().toISOString().slice(0, 10);
  input.value = input.min;
  show(3);
  input.onchange = loadSlots;
  loadSlots();
}

async function loadSlots() {
  const box = $("slots");
  box.innerHTML = "";
  $("slots-empty").classList.add("hidden");
  if (!$("date").value) return;
  const slots = await api(`/slots?master_id=${state.master.id}&service_id=${state.service.id}&date=${$("date").value}`);
  if (!slots.length) { $("slots-empty").classList.remove("hidden"); return; }
  slots.forEach((t) => {
    const b = document.createElement("button");
    b.className = "fade-in py-2.5 rounded-2xl border text-sm font-semibold bg-white transition hover:border-rose-400 hover:bg-rose-50 " +
      (state.slot === t ? "border-rose-500 ring-2 ring-rose-200 bg-rose-50 text-rose-700" : "border-slate-200");
    b.textContent = t;
    b.onclick = () => { state.slot = t; loadSlots(); show(4); };
    box.appendChild(b);
  });
}

const phoneInput = $("phone");
phoneInput.addEventListener("input", () => {
  let d = phoneInput.value.replace(/\D/g, "");
  if (d.startsWith("8")) d = "7" + d.slice(1);
  if (d && !d.startsWith("7")) d = "7" + d;
  d = d.slice(0, 11);
  let out = "";
  if (d.length > 0) out = "+7";
  if (d.length > 1) out += " (" + d.slice(1, 4);
  if (d.length >= 5) out += ") " + d.slice(4, 7);
  if (d.length >= 8) out += "-" + d.slice(7, 9);
  if (d.length >= 10) out += "-" + d.slice(9, 11);
  phoneInput.value = out;
});

function phoneComplete() {
  return phoneInput.value.replace(/\D/g, "").length === 11;
}

const icsEscape = (s) => String(s).replace(/\\/g, "\\\\").replace(/[,;]/g, (c) => "\\" + c).replace(/\n/g, "\\n");

function downloadIcs() {
  const start = new Date(`${$("date").value}T${state.slot}`);
  const end = new Date(start.getTime() + state.service.duration_minutes * 60000);
  const fmt = (d) => d.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const ics = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Harmony//Booking//RU", "BEGIN:VEVENT",
    "UID:" + Date.now() + "@salon-harmony",
    "DTSTAMP:" + fmt(new Date()),
    "DTSTART:" + fmt(start),
    "DTEND:" + fmt(end),
    "SUMMARY:" + icsEscape(state.service.title + " — салон «Гармония»"),
    "DESCRIPTION:" + icsEscape(`Мастер: ${state.master.name}. Клиент: ${$("name").value.trim()}. Адрес: ул. Цветочная, 12`),
    "LOCATION:" + icsEscape("г. Москва, ул. Цветочная, 12"),
    "BEGIN:VALARM", "TRIGGER:-PT2H", "ACTION:DISPLAY", "DESCRIPTION:Скоро запись в салон", "END:VALARM",
    "END:VEVENT", "END:VCALENDAR",
  ].join("\r\n");
  const blob = new Blob([ics], { type: "text/calendar;charset=utf-8" });
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = "harmony-appointment.ics";
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(a.href);
}

$("ics").onclick = downloadIcs;

$("form").onsubmit = async (e) => {
  e.preventDefault();
  const err = $("form-error");
  err.classList.add("hidden");
  if (!phoneComplete()) {
    err.textContent = "Введите номер телефона полностью: +7 (XXX) XXX-XX-XX";
    err.classList.remove("hidden");
    phoneInput.focus();
    return;
  }
  try {
    const ap = await fetch("/api/appointments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        client_name: $("name").value.trim(),
        client_phone: $("phone").value.trim(),
        master_id: state.master.id,
        service_id: state.service.id,
        start_time: `${$("date").value}T${state.slot}:00`,
      }),
    });
    if (!ap.ok) throw new Error((await ap.json()).detail || "Не удалось создать запись");
    $("summary").innerHTML = [
      ["Услуга", `${esc(state.service.title)} · ${state.service.price} ₽`],
      ["Мастер", esc(state.master.name)],
      ["Дата и время", new Date(`${$("date").value}T${state.slot}`).toLocaleString("ru-RU", { day: "numeric", month: "long", hour: "2-digit", minute: "2-digit" })],
      ["Клиент", esc($("name").value.trim())],
    ].map(([k, v]) => `<div class="flex justify-between gap-4"><span class="text-slate-500">${k}</span><span class="font-medium text-right">${v}</span></div>`).join("");
    show(5);
  } catch (ex) {
    err.textContent = typeof ex.message === "string" ? ex.message : "Ошибка сети";
    err.classList.remove("hidden");
  }
};

$("again").onclick = () => {
  Object.assign(state, { service: null, master: null, slot: null });
  $("form").reset();
  loadServices();
  show(1);
};

$("back").onclick = () => show(Math.max(1, state.step - 1));

loadServices().then(() => show(1));
