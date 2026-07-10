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
    projects = await loadCsv(CONFIG.PROJECTS_CSV_URL, normalizeProject, CONFIG.SAMPLE_PROJECTS);
    dates = await loadCsv(CONFIG.KEY_DATES_CSV_URL, normalizeDate, CONFIG.SAMPLE_KEY_DATES);

    initMap();
    buildFilters();
    applyFilters();

    $("syncStatus").textContent = "Datos cargados correctamente";
    $("syncStatus").classList.remove("error");
    $("syncStatus").classList.add("ok");
  } catch (err) {
    console.error(err);
    $("syncStatus").textContent = "Error al cargar CSV";
    $("syncStatus").classList.remove("ok");
    $("syncStatus").classList.add("error");
  }
}

async function loadCsv(url, normalizer, fallbackUrl = "") {
  const finalUrl = url || fallbackUrl;

  try {
    const response = await fetch(finalUrl);

    if (!response.ok) {
      throw new Error("CSV no disponible");
    }

    const text = await response.text();

    if (!text || text.toLowerCase().includes("<html")) {
      throw new Error("La URL no devuelve CSV");
    }

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true
    });

    return parsed.data.map(normalizer).filter(Boolean);
  } catch (error) {
    if (!fallbackUrl || finalUrl === fallbackUrl) {
      throw error;
    }

    const response = await fetch(fallbackUrl);

    if (!response.ok) {
      throw error;
    }

    const text = await response.text();

    const parsed = Papa.parse(text, {
      header: true,
      skipEmptyLines: true
    });

    return parsed.data.map(normalizer).filter(Boolean);
  }
}

function clean(v) {
  return (v ?? "").toString().trim();
}

function lower(v) {
  return clean(v).toLowerCase();
}

function num(v) {
  if (v === null || v === undefined || v === "") return 0;

  const s = String(v)
    .replace(/€/g, "")
    .replace(/%/g, "")
    .replace(/\s/g, "")
    .replace(/\./g, "")
    .replace(",", ".");

  return Number(s) || 0;
}

function pct(v) {
  const n = num(v);
  return n > 1 ? n / 100 : n;
}

function get(r, keys) {
  for (const key of keys) {
    if (r[key] !== undefined && r[key] !== null && r[key] !== "") {
      return r[key];
    }
  }

  return "";
}

function dateValue(v) {
  if (!v) return null;

  const raw = clean(v);

  if (!raw) return null;

  const parts = raw.split(/[\/\-]/);

  if (parts.length === 3) {
    const a = Number(parts[0]);
    const b = Number(parts[1]);
    const c = Number(parts[2]);

    if (a > 1900) {
      const d = new Date(a, b - 1, c);
      return isNaN(d) ? null : d;
    }

    if (c > 1900) {
      const d = new Date(c, b - 1, a);
      return isNaN(d) ? null : d;
    }
  }

  const d = new Date(raw);
  return isNaN(d) ? null : d;
}

function normalizeProject(r) {
  const p = {
    code: clean(get(r, ["codigo_proyecto", "Código Proyecto", "codigo", "Código", "code"])),
    name: clean(get(r, ["nombre_proyecto", "Nombre Proyecto", "proyecto", "Proyecto", "name"])),
    province: clean(get(r, ["provincia", "Provincia"])),
    district: clean(get(r, ["distrito", "Distrito"])),
    sector: clean(get(r, ["sector", "Sector"])),
    donor: clean(get(r, ["donante", "Donante"])),
    status: clean(get(r, ["estado_proyecto", "Estado Proyecto", "estado", "Estado"])),
    semaforo: clean(get(r, ["semaforo_auto", "Semáforo Auto", "semaforo", "Semáforo"])),
    budget: num(get(r, ["presupuesto_total", "Presupuesto Total", "presupuesto", "Presupuesto"])),
    spent: num(get(r, ["presupuesto_ejecutado", "Presupuesto Ejecutado", "ejecutado", "Ejecutado"])),
    tech: pct(get(r, ["porcentaje_avance_tecnico", "Porcentaje Avance Técnico", "avance_tecnico", "Avance Técnico"])),
    fin: pct(get(r, ["porcentaje_ejecucion_financiera", "Porcentaje Ejecución Financiera", "ejecucion_financiera", "Ejecución Financiera"])),
    beneficiaries: num(get(r, ["beneficiarios_alcanzados", "Beneficiarios Alcanzados", "beneficiarios", "Beneficiarios"])),
    dataQuality: pct(get(r, ["calidad_datos_auto", "Calidad Datos Auto", "calidad_datos", "Calidad Datos"])),
    lat: Number(get(r, ["lat", "Lat", "latitude", "Latitude"])),
    lng: Number(get(r, ["lng", "Lng", "lon", "Lon", "longitude", "Longitude"])),
    updated: clean(get(r, ["fecha_ultima_actualizacion", "Fecha Última Actualización", "fecha_actualizacion", "Fecha Actualización"])),
    drive: clean(get(r, ["link_carpeta_drive", "Link Carpeta Drive", "drive", "Drive"]))
  };

  if (!p.semaforo) p.semaforo = autoSemaforo(p);
  if (!p.code) p.code = slug(p.name);

  return p.name ? p : null;
}

function normalizeDate(r) {
  const deadline = dateValue(get(r, ["fecha_limite", "Fecha Límite", "fecha", "Fecha"]));
  const today = new Date();

  today.setHours(0, 0, 0, 0);

  const days = deadline ? Math.ceil((deadline - today) / (1000 * 60 * 60 * 24)) : "";
  let alert = clean(get(r, ["alerta_fecha_auto", "Alerta Fecha Auto", "alerta", "Alerta"]));
  const state = clean(get(r, ["estado_hito", "Estado Hito", "estado", "Estado"]));

  if (!alert) {
    if (lower(state) === "entregado" || lower(state) === "finalizado" || lower(state) === "cumplido") {
      alert = "Entregado";
    } else if (days === "") {
      alert = "Sin fecha";
    } else if (days < 0) {
      alert = "Vencido";
    } else if (days <= 7) {
      alert = "0-7 días";
    } else if (days <= 30) {
      alert = "8-30 días";
    } else {
      alert = "Más de 30 días";
    }
  }

  const item = {
    code: clean(get(r, ["codigo_proyecto", "Código Proyecto", "codigo", "Código", "code"])),
    project: clean(get(r, ["nombre_proyecto", "Nombre Proyecto", "proyecto", "Proyecto", "name"])),
    type: clean(get(r, ["tipo_hito", "Tipo Hito", "tipo", "Tipo"])),
    description: clean(get(r, ["descripcion_hito", "Descripción Hito", "descripcion", "Descripción"])),
    deadline,
    deadlineText: clean(get(r, ["fecha_limite", "Fecha Límite", "fecha", "Fecha"])),
    responsible: clean(get(r, ["responsable", "Responsable"])),
    state,
    days,
    alert,
    action: ["Vencido", "0-7 días", "8-30 días"].includes(alert) ? "Sí" : "No",
    evidence: clean(get(r, ["link_evidencia", "Link Evidencia", "evidencia", "Evidencia"]))
  };

  if (!item.code) item.code = slug(item.project);

  return item.project || item.type || item.deadlineText ? item : null;
}

function slug(v) {
  return clean(v)
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

function autoSemaforo(p) {
  if (!p.tech && !p.fin && !p.budget) return "Gris";
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
    if (el) el.addEventListener("input", applyFilters);
  });

  $("resetFilters").addEventListener("click", () => {
    Object.values(fields).forEach(el => {
      if (el) el.value = "";
    });

    applyFilters();
  });

  $("exportCsv").addEventListener("click", exportFilteredCsv);
}

function populate(select, values) {
  if (!select) return;

  const first = select.querySelector("option");
  select.innerHTML = "";

  if (first) {
    select.appendChild(first);
  }

  [...new Set(values.filter(Boolean))].sort().forEach(v => {
    const o = document.createElement("option");
    o.value = v;
    o.textContent = v;
    select.appendChild(o);
  });
}

function applyFilters() {
  const q = lower(fields.search?.value);

  filteredProjects = projects.filter(p => {
    const text = `${p.name} ${p.province} ${p.district} ${p.sector} ${p.donor} ${p.status} ${p.semaforo}`.toLowerCase();

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
    const linked =
      !d.code ||
      codes.has(d.code) ||
      filteredProjects.some(p => lower(p.name) === lower(d.project));

    return (
      linked &&
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
  if (map) return;

  map = L.map("map").setView(CONFIG.MAP_CENTER, CONFIG.MAP_ZOOM);

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: "&copy; OpenStreetMap"
  }).addTo(map);

  markersLayer = L.layerGroup().addTo(map);
}

function renderMap() {
  if (!markersLayer) return;

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
  if (charts[name]) {
    charts[name].destroy();
    charts[name] = null;
  }
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
      responsive: true,
      maintainAspectRatio: false
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
      responsive: true,
      maintainAspectRatio: false
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
      responsive: true,
      maintainAspectRatio: false
    }
  });
}

function badge(text) {
  const cls = slug(text || "sin-dato");
  return `<span class="badge ${cls}">${text || "Sin dato"}</span>`;
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
    .sort((a, b) => {
      const av = typeof a.days === "number" ? a.days : 99999;
      const bv = typeof b.days === "number" ? b.days : 99999;
      return av - bv;
    })
    .slice(0, 50);

  $("datesTable").innerHTML = sortedDates
    .map(d => `
      <tr>
        <td>${d.project}</td>
        <td>${d.type}</td>
        <td>${fmtDate(d.deadline) || d.deadlineText}</td>
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
