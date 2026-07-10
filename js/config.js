export const CONFIG = {
  PROJECTS_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRy0Y7CeYw7QhnTtJ_qxVpniIFPUmBcCq_a2pOqInhp5NyxiVoa63woeIf2UCdc1Q/pub?gid=1935387992&single=true&output=csv",

  KEY_DATES_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRy0Y7CeYw7QhnTtJ_qxVpniIFPUmBcCq_a2pOqInhp5NyxiVoa63woeIf2UCdc1Q/pub?gid=871251858&single=true&output=csv",

  INDICATORS_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRy0Y7CeYw7QhnTtJ_qxVpniIFPUmBcCq_a2pOqInhp5NyxiVoa63woeIf2UCdc1Q/pub?gid=642155477&single=true&output=csv",

  ACTIVITIES_CSV_URL:
    "https://docs.google.com/spreadsheets/d/e/2PACX-1vRy0Y7CeYw7QhnTtJ_qxVpniIFPUmBcCq_a2pOqInhp5NyxiVoa63woeIf2UCdc1Q/pub?gid=2111078914&single=true&output=csv",

  SAMPLE_PROJECTS: "data/sample_projects.csv",
  SAMPLE_KEY_DATES: "data/sample_key_dates.csv",
  SAMPLE_INDICATORS: "data/sample_indicators.csv",
  SAMPLE_ACTIVITIES: "data/sample_activities.csv",

  MAP_CENTER: [-18.6657, 35.5296],
  MAP_ZOOM: 5,

  APP_TITLE: "Plataforma de Seguimiento M&E",
  APP_SUBTITLE: "Gestión de proyectos, indicadores, actividades, riesgos y fechas clave",

  CURRENCY: "EUR",
  LOCALE: "es-ES",

  ALERT_DAYS_CRITICAL: 7,
  ALERT_DAYS_WARNING: 30,

  DATA_STALE_DAYS: 60,

  TECHNICAL_DELAY_THRESHOLD: 20,
  FINANCIAL_DELAY_THRESHOLD: 20,

  STATUS_COLORS: {
    verde: "En curso normal",
    amarillo: "Requiere seguimiento",
    naranja: "Riesgo alto",
    rojo: "Crítico",
    gris: "Sin datos suficientes"
  }
};
