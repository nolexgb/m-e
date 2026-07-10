import { CONFIG } from "./config.js";

let projects = [];
let dates = [];
let filteredProjects = [];
let filteredDates = [];
let map;
let markersLayer;
let charts = {};

const $ = id => document.getElementById(id);

const fields = {
  search: $("searchInput"),
  province: $("provinceFilter"),
  sector: $("sectorFilter"),
  donor: $("donorFilter"),
  status: $("statusFilter"),
  semaforo: $("semaforoFilter"),
  milestone: $("milestoneFilter"),
  dateAlert: $("dateAlertFilter")
};

init();

async function init() {
  $("syncStatus").textContent = "Cargando datos…";

  try {
    projects = await loadCsv(CONFIG.PROJECTS_CSV_URL || CONFIG.SAMPLE_PROJECTS, normalizeProject);
    dates = await loadCsv(CONFIG.KEY_DATES_CSV_URL || CONFIG.SAMPLE_KEY_DATES, normalizeDate);

    initMap();
    buildFilters();
    applyFilters();

    $("syncStatus").textContent = CONFIG.PROJECTS_CSV_URL
      ? "Datos sincronizados con Drive"
      : "Modo demo: conecta Drive en config.js";

    $("syncStatus").classList.add("ok");
  } catch (err) {
    console.error(err);
    $("syncStatus").textContent = "Error al cargar CSV";
    $("syncStatus").classList.add("error");
  }
}

function loadCsv(url, normalizer) {
  return new Promise((resolve, reject) => {
    Papa.parse(url, {
      download: true,
      header: true,
      skipEmptyLines: true,
      complete: res => resolve(res.data.map(normalizer).filter(Boolean)),
      error: reject
    });
  });
}

function clean(v) {
  return (v ?? "").toString().trim();
}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;

  const s = String(v)
    .replace(/€/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(s) || 0;
}

function pct(v) {
  const n = num(v);
  return n > 1 ? n / 100 : n;
}

function dateValue(v) {
  const d = new Date(v);
  return isNaN(d) ? null : d;
}

function normalizeProject(r) {
  const p = {
    code: clean(r.codigo_proyecto),
    name: clean(r.nombre_proyecto),
    province: clean(r.provincia),
    district: clean(r.distrito),
    sector: clean(r.sector),
    donor: clean(r.donante),
    status: clean(r.estado_proyecto),
    semaforo: clean(r.semaforo_auto),
    budget: num(r.presupuesto_total),
    spent: num(r.presupuesto_ejecutado),
    tech: pct(r.porcentaje_avance_tecnico),
    fin: pct(r.porcentaje_ejecucion_financiera),
    beneficiaries: num(r.beneficiarios_alcanzados),
    dataQuality: pct(r.calidad_datos_auto),
    lat: Number(r.lat),
    lng: Number(r.lng),
    updated: clean(r.fecha_ultima_actualizacion),
    drive: clean(r.link_carpeta_drive)
  };

  if (!p.semaforo) p.semaforo = autoSemaforo(p);

  return p.name ? p : null;
}

function normalizeDate(r) {
  const deadline = dateValue(r.fecha_limite);
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  let days = deadline ? Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)) : "";
  let alert = clean(r.alerta_fecha_auto);
  const state = clean(r.estado_hito);

  if (!alert) {
    if (state === "Entregado") alert = "Entregado";
    else if (days === "") alert = "Sin fecha";
    else if (days < 0) alert = "Vencido";
    else if (days <= 7) alert = "0-7 días";
    else if (days <= 30) alert = "8-30 días";
    else alert = "Más de 30 días";
  }

  return {
    code: clean(r.codigo_proyecto),
    project: clean(r.nombre_proyecto),
    type: clean(r.tipo_hito),
    description: clean(r.descripcion_hito),
    deadline,
    deadlineText: clean(r.fecha_limite),
    responsible: clean(r.responsable),
    state,
    days,
    alert,
    action: ["Vencido", "0-7 días", "8-30 días"].includes(alert) ? "Sí" : "No",
    evidence: clean(r.link_evidencia)
  };
}

function autoSemaforo(p) {
  if (p.fin - p.tech > 0.35) return "Naranja";
  if (p.tech < 0.15 && p.fin > 0.5) return "Rojo";
  if (p.tech < 0.35) return "Amarillo";
  return "Verde";
}

function buildFilters() {
  populate(fields.province, projects.map(p => p.province));
  populate(fields.sector, projects.map(p => p.sector));
  populate(fields.donor, projects.map(p => p.donor));
  populate(fields.status, projects.map(p => p.status));
  populate(fields.semaforo, projects.map(p => p.semaforo));
  populate(fields.milestone, dates.map(d => d.type));
  populate(fields.dateAlert, dates.map(d => d.alert));

  Object.values(fields).forEach(el => {
    el.addEventListener("input", applyFilters);
  });

  $("resetFilters").addEventListener("click", () => {
    Object.values(fields).forEach(el => {
      el.value = "";
    });

    applyFilters();
  });

  $("exportCsv").addEventListener("click", exportFilteredCsv);
}

function populate(select, values) {
  [...new Set(values.filter(Boolean))].sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function applyFilters() {
  const q = fields.search.value.toLowerCase();

  filteredProjects = projects.filter(p => {
    const text = `${p.name} ${p.province} ${p.district} ${p.sector} ${p.donor} ${p.status}`.toLowerCase();

    return (
      (!q || text.includes(q)) &&
      (!fields.province.value || p.province === fields.province.value) &&
      (!fields.sector.value || p.sector === fields.sector.value) &&
      (!fields.donor.value || p.donor === fields.donor.value) &&
      (!fields.status.value || p.status === fields.status.value) &&
      (!fields.semaforo.value || p.semaforo === fields.semaforo.value)
    );
  });

  const codes = new Set(filteredProjects.map(p => p.code));

  filteredDates = dates.filter(d => {
    return (
      codes.has(d.code) &&
      (!fields.milestone.value || d.type === fields.milestone.value) &&
      (!fields.dateAlert.value || d.alert === fields.dateAlert.value)
    );
  });

  renderAll();
}

function renderAll() {
  renderKpis();
  renderMap();
  renderCharts();
  renderTables();
}

function fmtCurrency(v) {
  return new Intl.NumberFormat(CONFIG.LOCALE || "es-ES", {
    style: "currency",
    currency: CONFIG.CURRENCY || "EUR",
    maximumFractionDigits: 0
  }).format(v || 0);
}

function fmtPct(v) {
  return new Intl.NumberFormat(CONFIG.LOCALE || "es-ES", {
    style: "percent",
    maximumFractionDigits: 0
  }).format(v || 0);
}

function fmtDate(d) {
  return d instanceof Date && !isNaN(d)
    ? d.toLocaleDateString(CONFIG.LOCALE || "es-ES")
    : "";
}

function avg(arr) {
  return arr.length ? arr.reduce((a, b) => a + b, 0) / arr.length : 0;
}

function renderKpis() {
  const totalBudget = filteredProjects.reduce((s, p) => s + p.budget, 0);
  const spent = filteredProjects.reduce((s, p) => s + p.spent, 0);
  const urgent = filteredDates.filter(d => ["Vencido", "0-7 días", "8-30 días"].includes(d.alert)).length;

  const cards = [
    ["Proyectos", filteredProjects.length, "Cartera filtrada"],
    ["Presupuesto", fmtCurrency(totalBudget), "Total registrado"],
    ["Ejecución financiera", fmtPct(totalBudget ? spent / totalBudget : 0), "Sobre presupuesto"],
    ["Avance técnico", fmtPct(avg(filteredProjects.map(p => p.tech))), "Promedio cartera"],
    ["Beneficiarios", filteredProjects.reduce((s, p) => s + p.beneficiaries, 0).toLocaleString(CONFIG.LOCALE || "es-ES"), "Alcanzados"],
    ["Fechas críticas", urgent, "Vencidas o 30 días"]
  ];

  $("kpiCards").innerHTML = cards
    .map(([title, value, sub]) => `<article class="card"><span>${title}</span><strong>${value}</strong><small>${sub}</small></article>`)
    .join("");
}

function initMap() {
  map = L.map("map").setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function renderMap() {
  markersLayer.clearLayers();

  const pts = filteredProjects.filter(p => !isNaN(p.lat) && !isNaN(p.lng));

  pts.forEach(p => {
    L.marker([p.lat, p.lng])
      .bindPopup(`
        <strong>${p.name}</strong><br>
        ${p.province}<br>
        ${p.sector}
        <hr>
        <b>Semáforo:</b> ${p.semaforo}<br>
        <b>Avance:</b> ${fmtPct(p.tech)}<br>
        <b>Presupuesto:</b> ${fmtCurrency(p.budget)}
      `)
      .addTo(markersLayer);
  });

  $("mapCount").textContent = `${pts.length} puntos`;

  if (pts.length) {
    map.fitBounds(pts.map(p => [p.lat, p.lng]), {
      padding: [32, 32]
    });
  }
}

function group(data, key, reducer = "count") {
  return data.reduce((acc, item) => {
    const k = item[key] || "Sin dato";
    acc[k] = (acc[k] || 0) + (reducer === "sumBudget" ? item.budget : 1);
    return acc;
  }, {});
}

function destroy(name) {
  if (charts[name]) charts[name].destroy();
}

function renderCharts() {
  destroy("semaforo");

  const s = group(filteredProjects, "semaforo");

  charts.semaforo = new Chart($("semaforoChart"), {
    type: "doughnut",
    data: {
      labels: Object.keys(s),
      datasets: [
        {
          data: Object.values(s)
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          position: "bottom"
        }
      },
      responsive: true
    }
  });

  destroy("sector");

  const sec = group(filteredProjects, "sector", "sumBudget");

  charts.sector = new Chart($("sectorChart"), {
    type: "bar",
    data: {
      labels: Object.keys(sec),
      datasets: [
        {
          label: "Presupuesto",
          data: Object.values(sec)
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      responsive: true
    }
  });

  destroy("dates");

  const da = group(filteredDates, "alert");

  charts.dates = new Chart($("datesChart"), {
    type: "bar",
    data: {
      labels: Object.keys(da),
      datasets: [
        {
          label: "Hitos",
          data: Object.values(da)
        }
      ]
    },
    options: {
      plugins: {
        legend: {
          display: false
        }
      },
      responsive: true
    }
  });
}

function badge(text) {
  return `<span class="badge ${String(text).toLowerCase().replaceAll(" ", "-")}">${text || "Sin dato"}</span>`;
}

function renderTables() {
  $("tableCount").textContent = `${filteredProjects.length} registros`;

  $("projectsTable").innerHTML = filteredProjects
    .map(p => `
      <tr>
        <td>${p.name}</td>
        <td>${p.province}</td>
        <td>${p.sector}</td>
        <td>${p.donor}</td>
        <td>${p.status}</td>
        <td>${badge(p.semaforo)}</td>
        <td>${fmtPct(p.tech)}</td>
        <td>${fmtPct(p.fin)}</td>
        <td>${fmtCurrency(p.budget)}</td>
      </tr>
    `)
    .join("");

  const sortedDates = [...filteredDates]
    .sort((a, b) => (a.days || 99999) - (b.days || 99999))
    .slice(0, 50);

  $("datesTable").innerHTML = sortedDates
    .map(d => `
      <tr>
        <td>${d.project}</td>
        <td>${d.type}</td>
        <td>${fmtDate(d.deadline)}</td>
        <td>${d.days}</td>
        <td>${badge(d.alert)}</td>
        <td>${d.responsible}</td>
        <td>${d.action}</td>
      </tr>
    `)
    .join("");
}

function exportFilteredCsv() {
  const headers = [
    "codigo_proyecto",
    "nombre_proyecto",
    "provincia",
    "sector",
    "donante",
    "estado",
    "semaforo",
    "avance_tecnico",
    "ejecucion_financiera",
    "presupuesto_total"
  ];

  const rows = filteredProjects.map(p => [
    p.code,
    p.name,
    p.province,
    p.sector,
    p.donor,
    p.status,
    p.semaforo,
    p.tech,
    p.fin,
    p.budget
  ]);

  const csv = [headers, ...rows]
    .map(r => r.map(v => `"${String(v ?? "").replaceAll('"', '""')}"`).join(","))
    .join("\n");

  const blob = new Blob([csv], {
    type: "text/csv;charset=utf-8"
  });

  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");

  a.href = url;
  a.download = "seguimiento_filtrado.csv";
  a.click();

  URL.revokeObjectURL(url);
}
