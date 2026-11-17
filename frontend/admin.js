"use strict";

const API = "/api/admin";
const STATUS_LABELS = { pending: "Ожидается", completed: "Завершена", cancelled: "Отменена" };

const $ = (id) => document.getElementById(id);

function authHeaders() {
  return { "Authorization": "Bearer " + localStorage.getItem("admin_token"), "Content-Type": "application/json" };
}

function handleAuth(res) {
  if (res.status === 401) {
    localStorage.removeItem("admin_token");
    $("panel-view").classList.add("hidden");
    $("login-view").classList.remove("hidden");
    throw new Error("unauthorized");
  }
  return res;
}

async function api(path, options = {}) {
  const res = await handleAuth(fetch(API + path, { ...options, headers: authHeaders() }));
  if (!res.ok) {
    const body = await res.json().catch(() => ({}));
    throw new Error(body.detail || "Ошибка сервера");
  }
  return res.json();
}

function showLoginError(text) {
  const box = $("login-error");
  box.textContent = text;
  box.classList.remove("hidden");
}

function showMsg(id, text, ok) {
  const box = $(id);
  box.textContent = text;
  box.className = "rounded-2xl p-4 text-sm " + (ok
    ? "bg-emerald-50 border border-emerald-200 text-emerald-700"
    : "bg-red-50 border border-red-200 text-red-700");
  box.classList.remove("hidden");
}

async function login(e) {
  e.preventDefault();
  try {
    const res = await fetch(API + "/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: $("login").value.trim(), password: $("password").value }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      showLoginError(typeof body.detail === "string" ? body.detail : "Неверный логин или пароль");
      return;
    }
    const data = await res.json();
    localStorage.setItem("admin_token", data.access_token);
    openPanel();
  } catch (err) {
    showLoginError("Ошибка соединения с сервером");
  }
}

async function openPanel() {
  $("login-view").classList.add("hidden");
  $("panel-view").classList.remove("hidden");
  await Promise.all([loadStats(), loadAppointments(), loadCatalog()]);
}

async function loadStats() {
  try {
    const s = await api("/stats");
    $("stat-revenue").textContent = s.revenue_completed.toLocaleString("ru-RU") + " ₽";
    $("stat-month").textContent = s.appointments_this_month;
    $("stat-upcoming").textContent = s.active_upcoming;
  } catch (_) {}
}

async function loadAppointments() {
  const date = $("date-filter").value;
  const qs = date ? "?date=" + date : "";
  try {
    const rows = await api("/appointments" + qs);
    renderAppointments(rows);
  } catch (_) {}
}

function statusBadge(status) {
  const styles = {
    pending: "bg-amber-100 text-amber-700",
    completed: "bg-emerald-100 text-emerald-700",
    cancelled: "bg-slate-200 text-slate-500",
  };
  const badge = document.createElement("span");
  badge.className = "inline-block px-2.5 py-1 rounded-full text-xs font-semibold " + (styles[status] || "bg-slate-100 text-slate-600");
  badge.textContent = STATUS_LABELS[status] || status;
  return badge;
}

function actionButton(appointmentId, label, newStatus) {
  const btn = document.createElement("button");
  btn.className = "text-xs font-semibold px-3 py-1.5 rounded-full border transition hover:opacity-80 " +
    (newStatus === "completed" ? "border-emerald-300 text-emerald-700" : "border-slate-300 text-slate-500");
  btn.textContent = label;
  btn.addEventListener("click", () => changeStatus(appointmentId, newStatus));
  return btn;
}

function editButton(row) {
  const btn = document.createElement("button");
  btn.className = "text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-300 text-slate-600 transition hover:opacity-80";
  btn.textContent = "Изменить";
  btn.addEventListener("click", () => openEdit(row));
  return btn;
}

function deleteButton(id) {
  const btn = document.createElement("button");
  btn.className = "text-xs font-semibold px-3 py-1.5 rounded-full border border-red-200 text-red-600 transition hover:opacity-80";
  btn.textContent = "Удалить";
  btn.addEventListener("click", () => {
    if (confirm("Удалить запись? Действие необратимо.")) deleteAppointment(id);
  });
  return btn;
}

function renderAppointments(rows) {
  const tbody = $("appointments-body");
  tbody.textContent = "";
  $("appointments-empty").classList.toggle("hidden", rows.length > 0);
  for (const row of rows) {
    const tr = document.createElement("tr");

    const cells = [
      new Date(row.start_at).toLocaleString("ru-RU", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" }),
      row.client_name || "—",
      row.client_phone,
      row.master_name,
      row.service_title,
      row.price.toLocaleString("ru-RU") + " ₽",
    ];
    for (const value of cells) {
      const td = document.createElement("td");
      td.className = "py-3 pr-4 whitespace-nowrap";
      td.textContent = value;
      tr.appendChild(td);
    }

    const statusTd = document.createElement("td");
    statusTd.className = "py-3 pr-4";
    statusTd.appendChild(statusBadge(row.status));
    tr.appendChild(statusTd);

    const actionsTd = document.createElement("td");
    actionsTd.className = "py-3 flex gap-2 flex-wrap";
    if (row.status === "pending") {
      actionsTd.appendChild(actionButton(row.id, "Завершить", "completed"));
      actionsTd.appendChild(actionButton(row.id, "Отменить", "cancelled"));
    }
    actionsTd.appendChild(editButton(row));
    actionsTd.appendChild(deleteButton(row.id));
    tr.appendChild(actionsTd);
    tbody.appendChild(tr);
  }
}

async function changeStatus(id, status) {
  try {
    await api("/appointments/" + id, { method: "PATCH", body: JSON.stringify({ status }) });
    await Promise.all([loadStats(), loadAppointments()]);
  } catch (err) {
    if (err.message !== "unauthorized") alert(err.message);
  }
}

let CATALOG = { services: [], masters: [] };
let editingId = null;

async function loadCatalog() {
  const [services, masters] = await Promise.all([
    fetch("/api/services").then((r) => r.json()),
    fetch("/api/masters").then((r) => r.json()),
  ]);
  CATALOG = { services, masters };

  const box = $("master-services");
  box.textContent = "";
  for (const service of services) {
    const label = document.createElement("label");
    label.className = "flex items-center gap-2 bg-slate-50 border border-slate-200 rounded-full px-3 py-1.5 cursor-pointer";
    const cb = document.createElement("input");
    cb.type = "checkbox";
    cb.value = service.id;
    cb.className = "accent-slate-900";
    const span = document.createElement("span");
    span.textContent = service.title;
    label.append(cb, span);
    box.appendChild(label);
  }

  const serviceSel = $("edit-service");
  const masterSel = $("edit-master");
  serviceSel.textContent = "";
  masterSel.textContent = "";
  for (const s of services) {
    const opt = document.createElement("option");
    opt.value = s.id;
    opt.textContent = s.title + " · " + s.price.toLocaleString("ru-RU") + " ₽";
    serviceSel.appendChild(opt);
  }
  for (const m of masters) {
    const opt = document.createElement("option");
    opt.value = m.id;
    opt.textContent = m.name + " — " + m.specialty;
    masterSel.appendChild(opt);
  }
}

async function createMaster(e) {
  e.preventDefault();
  const payload = {
    name: $("master-name").value.trim(),
    specialty: $("master-specialty").value.trim(),
    phone: $("master-phone").value.trim() || null,
    service_ids: [...$("master-services").querySelectorAll("input:checked")].map((cb) => Number(cb.value)),
  };
  try {
    await api("/masters", { method: "POST", body: JSON.stringify(payload) });
    $("master-form").reset();
    showMsg("master-msg", "Мастер добавлен", true);
  } catch (err) {
    if (err.message === "unauthorized") return;
    showMsg("master-msg", err.message, false);
  }
}

async function createService(e) {
  e.preventDefault();
  const payload = {
    title: $("service-title").value.trim(),
    price: Number($("service-price").value),
    duration_minutes: Number($("service-duration").value),
    description: $("service-description").value.trim() || null,
  };
  try {
    await api("/services", { method: "POST", body: JSON.stringify(payload) });
    $("service-form").reset();
    $("service-duration").value = "60";
    showMsg("service-msg", "Услуга добавлена", true);
  } catch (err) {
    if (err.message === "unauthorized") return;
    showMsg("service-msg", err.message, false);
  }
}

function logout() {
  localStorage.removeItem("admin_token");
  $("panel-view").classList.add("hidden");
  $("login-view").classList.remove("hidden");
}

function openEdit(row) {
  editingId = row.id;
  const d = new Date(row.start_at);
  $("edit-name").value = row.client_name === "Без имени" ? "" : row.client_name;
  $("edit-phone").value = row.client_phone;
  $("edit-service").value = String(CATALOG.services.find((s) => s.title === row.service_title)?.id ?? "");
  $("edit-master").value = String(CATALOG.masters.find((m) => m.name === row.master_name)?.id ?? "");
  $("edit-date").value = d.toISOString().slice(0, 10);
  $("edit-time").value = String(d.getHours()).padStart(2, "0") + ":" + String(d.getMinutes()).padStart(2, "0");
  $("edit-status").value = row.status;
  $("edit-msg").classList.add("hidden");
  $("edit-modal").classList.remove("hidden");
}

function closeEdit() {
  $("edit-modal").classList.add("hidden");
  editingId = null;
}

async function saveEdit() {
  if (editingId === null) return;
  const masterId = Number($("edit-master").value);
  const serviceId = Number($("edit-service").value);
  const service = CATALOG.services.find((s) => s.id === serviceId);
  const master = CATALOG.masters.find((m) => m.id === masterId);
  if (!service || !master) {
    showMsg("edit-msg", "Выберите услугу и мастера", false);
    return;
  }
  const allowed = master.services ? master.services.map((s) => s.id) : [];
  if (allowed.length && !allowed.includes(serviceId)) {
    showMsg("edit-msg", "Мастер не оказывает выбранную услугу", false);
    return;
  }
  const payload = {
    client_name: $("edit-name").value.trim(),
    client_phone: $("edit-phone").value.trim(),
    master_id: masterId,
    service_id: serviceId,
    start_time: $("edit-date").value + "T" + $("edit-time").value + ":00",
    status: $("edit-status").value,
  };
  try {
    await api("/appointments/" + editingId, { method: "PATCH", body: JSON.stringify(payload) });
    closeEdit();
    await Promise.all([loadStats(), loadAppointments()]);
  } catch (err) {
    if (err.message === "unauthorized") return;
    showMsg("edit-msg", err.message, false);
  }
}

async function deleteAppointment(id) {
  try {
    await api("/appointments/" + id, { method: "DELETE" });
    await Promise.all([loadStats(), loadAppointments()]);
  } catch (err) {
    if (err.message !== "unauthorized") alert(err.message);
  }
}

$("login-form").addEventListener("submit", login);
$("edit-close").addEventListener("click", closeEdit);
$("edit-cancel").addEventListener("click", closeEdit);
$("edit-save").addEventListener("click", saveEdit);
$("edit-modal").addEventListener("click", (e) => { if (e.target === $("edit-modal")) closeEdit(); });

$("logout").addEventListener("click", logout);
$("date-filter").addEventListener("change", loadAppointments);
$("clear-filter").addEventListener("click", () => { $("date-filter").value = ""; loadAppointments(); });
$("master-form").addEventListener("submit", createMaster);
$("service-form").addEventListener("submit", createService);

if (localStorage.getItem("admin_token")) openPanel();
