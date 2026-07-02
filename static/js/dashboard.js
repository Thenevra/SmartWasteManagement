/* ===========================================================================
   Smart Waste Management System — Dashboard Client Logic
   ---------------------------------------------------------------------------
   Responsibilities:
   1. Poll the Flask API every REFRESH_INTERVAL_MS and re-render:
      - bin cards grid
      - summary strip counts
      - alerts rail
      - map markers
   2. Fetch + render Chart.js graphs (city trend + status donut)
   3. Fetch + render the optimized collection route
   4. Fetch + render AI fill-level predictions
   5. Handle bin-card click -> modal with per-bin history chart + prediction

   All data comes from JSON endpoints under /api/* — see app.py.
   =========================================================================== */

const REFRESH_INTERVAL_MS = 8000; // auto-refresh every 8 seconds (within 5-10s requirement)

// ---- Module-level state ----------------------------------------------------
let map = null;
let markers = {};          // bin_id -> Leaflet marker
let cityTrendChart = null;
let statusDonutChart = null;
let binDetailChart = null;
let currentBinsCache = [];
let refreshTimer = null;

// ===========================================================================
// INIT
// ===========================================================================
document.addEventListener("DOMContentLoaded", () => {
  startClock();
  initMap();
  initCharts();
  refreshAll();                       // initial load
  
  // Clear any existing timer before setting new one
  if (refreshTimer) clearInterval(refreshTimer);
  refreshTimer = setInterval(refreshAll, REFRESH_INTERVAL_MS);

  // Event listeners
  document.getElementById("recalcRouteBtn").addEventListener("click", loadRoute);
  document.getElementById("modalClose").addEventListener("click", closeModal);
  document.getElementById("modalBackdrop").addEventListener("click", (e) => {
    if (e.target.id === "modalBackdrop") closeModal();
  });
  
  // Handle back to landing button if exists
  const backBtn = document.getElementById("backToLanding");
  if (backBtn) {
    backBtn.addEventListener("click", function() {
      // Clear interval when going back to landing
      if (refreshTimer) {
        clearInterval(refreshTimer);
        refreshTimer = null;
      }
    });
  }
});

function startClock() {
  const clockEl = document.getElementById("clock");
  if (!clockEl) return;
  
  function tick() {
    const now = new Date();
    clockEl.textContent = now.toLocaleTimeString("en-IN", { hour12: false });
  }
  tick();
  setInterval(tick, 1000);
}

// ===========================================================================
// MASTER REFRESH — called on load and every REFRESH_INTERVAL_MS
// ===========================================================================
async function refreshAll() {
  try {
    await Promise.all([
      loadBins(),
      loadAlerts(),
      loadCityTrend(),
      loadRoute(),
      loadPredictions()
    ]);
  } catch (err) {
    console.error("Error during refresh:", err);
  }
}

// ===========================================================================
// BIN CARDS + SUMMARY + MAP MARKERS
// ===========================================================================
async function loadBins() {
  try {
    const res = await fetch("/api/bins");
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load bins:", data.error);
      return;
    }

    currentBinsCache = data.bins || [];
    renderSummary(currentBinsCache);
    renderBinCards(currentBinsCache);
    renderMapMarkers(currentBinsCache);
    renderStatusDonut(currentBinsCache);
  } catch (err) {
    console.error("Failed to load bins:", err);
  }
}

function renderSummary(bins) {
  const counts = { green: 0, yellow: 0, red: 0 };
  bins.forEach(b => { 
    if (b.status) counts[b.status] = (counts[b.status] || 0) + 1; 
  });

  document.getElementById("statTotal").textContent = bins.length || 0;
  document.getElementById("statGreen").textContent = counts.green || 0;
  document.getElementById("statYellow").textContent = counts.yellow || 0;
  document.getElementById("statRed").textContent = counts.red || 0;
}

function statusLabel(status) {
  const labels = { green: "Normal", yellow: "Filling", red: "Full" };
  return labels[status] || "Unknown";
}

function renderBinCards(bins) {
  const grid = document.getElementById("binsGrid");
  if (!grid) return;
  
  grid.innerHTML = "";

  if (!bins || bins.length === 0) {
    grid.innerHTML = `<div class="empty-state">No bins available.</div>`;
    return;
  }

  bins.forEach(bin => {
    const fill = bin.fill_level ?? 0;
    const weight = bin.weight_kg ?? 0;
    const status = bin.status || "green";

    const card = document.createElement("div");
    card.className = "bin-card";
    card.tabIndex = 0;
    card.setAttribute("role", "button");
    card.setAttribute("aria-label", `View details for ${bin.name}`);

    card.innerHTML = `
      <div class="bin-card__top">
        <div>
          <div class="bin-card__id">${bin.bin_id}</div>
          <div class="bin-card__name">${bin.name || 'Unnamed Bin'}</div>
          <div class="bin-card__zone">${bin.zone || 'Unknown'} Zone</div>
        </div>
        <span class="status-pill ${status}">${statusLabel(status)}</span>
      </div>
      <div class="gauge-row">
        <div class="gauge-track">
          <div class="gauge-fill ${status}" style="width: ${Math.min(fill, 100)}%;"></div>
        </div>
        <div class="gauge-pct">${Math.min(fill, 100).toFixed(0)}%</div>
      </div>
      <div class="bin-card__metrics">
        <div>
          <div class="metric-label">Weight</div>
          <div class="metric-value">${weight.toFixed(1)} kg</div>
        </div>
        <div style="text-align:right;">
          <div class="metric-label">Updated</div>
          <div class="metric-value">${formatTimeAgo(bin.timestamp)}</div>
        </div>
      </div>
    `;

    card.addEventListener("click", () => openBinDetail(bin.bin_id));
    card.addEventListener("keypress", (e) => { 
      if (e.key === "Enter") openBinDetail(bin.bin_id); 
    });

    grid.appendChild(card);
  });
}

function formatTimeAgo(timestamp) {
  if (!timestamp) return "—";
  try {
    const then = new Date(timestamp);
    if (isNaN(then.getTime())) return "—";
    
    const seconds = Math.floor((Date.now() - then.getTime()) / 1000);
    if (seconds < 0) return "—";
    if (seconds < 60) return `${seconds}s ago`;
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return `${Math.floor(seconds / 86400)}d ago`;
  } catch (e) {
    return "—";
  }
}

// ===========================================================================
// ALERTS
// ===========================================================================
async function loadAlerts() {
  try {
    const res = await fetch("/api/alerts");
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load alerts:", data.error);
      return;
    }
    renderAlerts(data.alerts || []);
  } catch (err) {
    console.error("Failed to load alerts:", err);
  }
}

function renderAlerts(alerts) {
  const rail = document.getElementById("alertsRail");
  const hint = document.getElementById("alertsHint");
  
  if (!rail) return;
  
  if (hint) {
    hint.textContent = alerts.length === 0 ? 'no active alerts' : `${alerts.length} active`;
  }

  if (!alerts || alerts.length === 0) {
    rail.innerHTML = `<div class="empty-state">No active alerts right now — all bins within safe limits.</div>`;
    return;
  }

  rail.innerHTML = "";
  alerts.forEach(a => {
    const item = document.createElement("div");
    item.className = `alert-item ${a.severity === "critical" ? "" : "warning"}`;
    item.innerHTML = `
      <span class="alert-item__icon">${a.severity === "critical" ? "🚨" : "⚠️"}</span>
      <span class="alert-item__text"><strong>${a.bin_name || a.bin_id}</strong> — ${a.message || 'Alert'}</span>
      <span class="alert-item__time">${formatTimeAgo(a.timestamp)}</span>
      <button class="alert-item__resolve" data-bin="${a.bin_id}">Mark Collected</button>
    `;
    
    const resolveBtn = item.querySelector(".alert-item__resolve");
    if (resolveBtn) {
      resolveBtn.addEventListener("click", async (e) => {
        e.stopPropagation();
        const binId = e.target.dataset.bin;
        if (!binId) return;
        
        try {
          await fetch(`/api/alerts/resolve/${binId}`, { method: "POST" });
          refreshAll();
        } catch (err) {
          console.error("Failed to resolve alert:", err);
        }
      });
    }
    
    rail.appendChild(item);
  });
}

// ===========================================================================
// MAP (Leaflet.js)
// ===========================================================================
function initMap() {
  const mapContainer = document.getElementById("map");
  if (!mapContainer) return;
  
  // Check if map already initialized
  if (map) {
    map.invalidateSize();
    return;
  }

  // Centered roughly on the demo city's coordinates
  map = L.map("map", { 
    zoomControl: true,
    center: [16.6995, 74.2356], 
    zoom: 13 
  });

  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
    attribution: '&copy; OpenStreetMap contributors',
    maxZoom: 19
  }).addTo(map);
  
  // Force resize after a moment
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 500);
}

function statusColor(status) {
  const colors = { 
    green: "#3FCB7C", 
    yellow: "#F0C24B", 
    red: "#F0594B" 
  };
  return colors[status] || "#8FA89C";
}

function renderMapMarkers(bins) {
  if (!map) {
    // Try to initialize map if it doesn't exist
    initMap();
    if (!map) return;
  }

  // Clear old markers (keep depot marker if exists)
  const depotMarker = markers["__depot__"];
  Object.keys(markers).forEach(key => {
    if (key !== "__depot__") {
      map.removeLayer(markers[key]);
      delete markers[key];
    }
  });

  if (!bins || bins.length === 0) return;

  bins.forEach(bin => {
    if (!bin.lat || !bin.lng) return;
    
    const color = statusColor(bin.status);
    const marker = L.circleMarker([bin.lat, bin.lng], {
      radius: 10,
      fillColor: color,
      color: color,
      weight: 2,
      opacity: 1,
      fillOpacity: 0.55
    }).addTo(map);
    
    marker.bindPopup(popupHtml(bin));
    marker.on("click", () => openBinDetail(bin.bin_id));
    markers[bin.bin_id] = marker;
  });
  
  // Force map to update size
  setTimeout(() => {
    if (map) map.invalidateSize();
  }, 100);
}

function popupHtml(bin) {
  const fill = (bin.fill_level ?? 0).toFixed(0);
  return `<strong>${bin.name || 'Unnamed'}</strong><br>${bin.bin_id} · ${bin.zone || 'Unknown'} Zone<br>Fill: ${fill}% · ${(bin.weight_kg ?? 0).toFixed(1)} kg`;
}

// ===========================================================================
// ROUTE OPTIMIZATION (Scenario 1 + Bonus)
// ===========================================================================
let routeLine = null;

async function loadRoute() {
  try {
    const res = await fetch("/api/route/optimize");
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load route:", data.error);
      return;
    }
    renderRoute(data);
  } catch (err) {
    console.error("Failed to load route:", err);
  }
}

function renderRoute(data) {
  document.getElementById("routeBinCount").textContent = data.bins_needing_collection || 0;
  document.getElementById("routeDistance").textContent = data.total_distance_km || 0;
  document.getElementById("routeTime").textContent = data.estimated_time_minutes || 0;

  const list = document.getElementById("routeList");
  if (!list) return;

  if (!data.route || data.route.length === 0) {
    list.innerHTML = `<div class="empty-state">No bins currently need collection (all below threshold).</div>`;
    return;
  }

  list.innerHTML = "";
  data.route.forEach((stop, idx) => {
    const row = document.createElement("div");
    row.className = "route-stop";
    row.innerHTML = `
      <span class="route-stop__num">${idx + 1}</span>
      <span class="route-stop__name">${stop.name || 'Unnamed'} <span style="color:var(--text-faint)">(${(stop.fill_level || 0).toFixed(0)}%)</span></span>
      <span class="route-stop__dist">+${(stop.distance_from_prev_km || 0).toFixed(2)} km</span>
    `;
    list.appendChild(row);
  });

  // Draw the route on the map
  if (routeLine && map) { 
    map.removeLayer(routeLine); 
    routeLine = null; 
  }
  
  if (data.route && data.route.length > 0 && data.depot && map) {
    const latlngs = [
      [data.depot.lat, data.depot.lng], 
      ...data.route.map(s => [s.lat, s.lng])
    ];
    routeLine = L.polyline(latlngs, { 
      color: "#F2A93B", 
      weight: 3, 
      dashArray: "6 6", 
      opacity: 0.8 
    }).addTo(map);

    // Depot marker (only add once)
    if (!markers["__depot__"] && map) {
      markers["__depot__"] = L.marker([data.depot.lat, data.depot.lng], {
        icon: L.divIcon({
          className: "",
          html: `<div style="background:#F2A93B;width:16px;height:16px;border-radius:4px;border:2px solid #1A1300;"></div>`,
          iconSize: [16, 16]
        })
      }).addTo(map).bindPopup(`<strong>${data.depot.name || 'Depot'}</strong><br>Truck depot`);
    }
    
    // Fit map to show all route points
    if (latlngs.length > 0) {
      map.fitBounds(latlngs, { padding: [30, 30] });
    }
  }
}

// ===========================================================================
// CHARTS (Chart.js)
// ===========================================================================
function chartDefaults() {
  return {
    color: "#8FA89C",
    gridColor: "rgba(143, 168, 156, 0.1)"
  };
}

function initCharts() {
  const d = chartDefaults();

  // --- City-wide trend (line chart) ---
  const trendCanvas = document.getElementById("cityTrendChart");
  if (trendCanvas) {
    const trendCtx = trendCanvas.getContext("2d");
    cityTrendChart = new Chart(trendCtx, {
      type: "line",
      data: {
        labels: [],
        datasets: [{
          label: "Avg Fill Level (%)",
          data: [],
          borderColor: "#F2A93B",
          backgroundColor: "rgba(242, 169, 59, 0.12)",
          fill: true,
          tension: 0.35,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            ticks: { color: d.color, maxTicksLimit: 8, font: { family: "JetBrains Mono", size: 10 } }, 
            grid: { color: d.gridColor } 
          },
          y: { 
            min: 0, 
            max: 100, 
            ticks: { color: d.color, font: { family: "JetBrains Mono", size: 10 } }, 
            grid: { color: d.gridColor } 
          }
        }
      }
    });
  }

  // --- Status distribution (donut chart) ---
  const donutCanvas = document.getElementById("statusDonutChart");
  if (donutCanvas) {
    const donutCtx = donutCanvas.getContext("2d");
    statusDonutChart = new Chart(donutCtx, {
      type: "doughnut",
      data: {
        labels: ["Normal", "Filling", "Full"],
        datasets: [{
          data: [0, 0, 0],
          backgroundColor: ["#3FCB7C", "#F0C24B", "#F0594B"],
          borderColor: "#11201C",
          borderWidth: 3
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        cutout: "68%",
        plugins: {
          legend: { 
            position: "bottom", 
            labels: { color: d.color, font: { family: "Inter", size: 11 }, padding: 16 } 
          }
        }
      }
    });
  }
}

async function loadCityTrend() {
  try {
    const res = await fetch("/api/trends/city?hours=48");
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load city trend:", data.error);
      return;
    }

    if (cityTrendChart && data.labels && data.averages) {
      cityTrendChart.data.labels = data.labels;
      cityTrendChart.data.datasets[0].data = data.averages;
      cityTrendChart.update("none");
    }
  } catch (err) {
    console.error("Failed to load city trend:", err);
  }
}

function renderStatusDonut(bins) {
  if (!statusDonutChart) return;
  
  const counts = { green: 0, yellow: 0, red: 0 };
  bins.forEach(b => { 
    if (b.status) counts[b.status] = (counts[b.status] || 0) + 1; 
  });
  
  statusDonutChart.data.datasets[0].data = [counts.green, counts.yellow, counts.red];
  statusDonutChart.update("none");
}

// ===========================================================================
// AI PREDICTIONS (Bonus feature)
// ===========================================================================
async function loadPredictions() {
  try {
    const res = await fetch("/api/predict/all");
    const data = await res.json();
    if (!data.success) {
      console.error("Failed to load predictions:", data.error);
      return;
    }
    renderPredictions(data.predictions || []);
  } catch (err) {
    console.error("Failed to load predictions:", err);
  }
}

function renderPredictions(predictions) {
  const grid = document.getElementById("predictGrid");
  if (!grid) return;

  if (!predictions || predictions.length === 0) {
    grid.innerHTML = `<div class="empty-state">Gathering data for predictions…</div>`;
    return;
  }

  grid.innerHTML = "";
  predictions.forEach(p => {
    const binMeta = currentBinsCache.find(b => b.bin_id === p.bin_id);
    const name = binMeta ? (binMeta.name || p.bin_id) : p.bin_id;

    const card = document.createElement("div");
    card.className = "predict-card";
    card.innerHTML = `
      <div class="predict-card__head"><span>${p.bin_id}</span><span>${name}</span></div>
      <div class="predict-card__row">
        <span>Now: <strong>${(p.current_level || 0).toFixed(0)}%</strong></span>
        <span class="trend-badge ${p.trend || 'stable'}">${p.trend || 'stable'}</span>
      </div>
      <div class="predict-card__row">
        <span>In 6h: <strong>${(p.predicted_level || 0).toFixed(0)}%</strong></span>
        <span style="color:var(--text-faint); font-family:var(--font-mono); font-size:11px;">
          ${p.hours_until_full ? `full in ~${p.hours_until_full}h` : "—"}
        </span>
      </div>
    `;
    grid.appendChild(card);
  });
}

// ===========================================================================
// BIN DETAIL MODAL
// ===========================================================================
async function openBinDetail(binId) {
  const bin = currentBinsCache.find(b => b.bin_id === binId);
  if (!bin) {
    console.error("Bin not found:", binId);
    return;
  }

  const modalContent = document.getElementById("modalContent");
  if (!modalContent) return;

  modalContent.innerHTML = `
    <div class="bin-card__id">${bin.bin_id}</div>
    <h2 style="font-family:var(--font-display); margin:4px 0 2px;">${bin.name || 'Unnamed'}</h2>
    <div class="bin-card__zone" style="margin-bottom:18px;">${bin.zone || 'Unknown'} Zone · Lat ${(bin.lat || 0).toFixed(4)}, Lng ${(bin.lng || 0).toFixed(4)}</div>
    <div class="route-stats">
      <div class="route-stat"><div class="route-stat__value">${(bin.fill_level ?? 0).toFixed(0)}%</div><div class="route-stat__label">Fill Level</div></div>
      <div class="route-stat"><div class="route-stat__value">${(bin.weight_kg ?? 0).toFixed(1)}</div><div class="route-stat__label">Weight (kg)</div></div>
      <div class="route-stat"><div class="route-stat__value" id="modalPredictVal">—</div><div class="route-stat__label">Predicted (6h)</div></div>
    </div>
    <div class="chart-wrap" style="height:220px; margin-top:10px;">
      <canvas id="binDetailChart"></canvas>
    </div>
  `;

  document.getElementById("modalBackdrop").classList.add("open");

  try {
    // Load history for chart
    const histRes = await fetch(`/api/bins/${binId}/history?limit=40`);
    const histData = await histRes.json();
    
    const ctx = document.getElementById("binDetailChart");
    if (!ctx) return;
    
    const context = ctx.getContext("2d");
    if (binDetailChart) binDetailChart.destroy();
    
    const labels = (histData.history || []).map(h => {
      try {
        const d = new Date(h.timestamp);
        return d.toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit", hour12: false });
      } catch (e) {
        return "—";
      }
    });
    const levels = (histData.history || []).map(h => h.fill_level || 0);

    binDetailChart = new Chart(context, {
      type: "line",
      data: {
        labels: labels.length > 0 ? labels : ["No Data"],
        datasets: [{
          label: "Fill Level (%)",
          data: levels.length > 0 ? levels : [0],
          borderColor: "#3FCB7C",
          backgroundColor: "rgba(63, 203, 124, 0.12)",
          fill: true,
          tension: 0.3,
          pointRadius: 0,
          borderWidth: 2
        }]
      },
      options: {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
          x: { 
            ticks: { color: "#8FA89C", maxTicksLimit: 6, font: { family: "JetBrains Mono", size: 9 } }, 
            grid: { display: false } 
          },
          y: { 
            min: 0, 
            max: 100, 
            ticks: { color: "#8FA89C", font: { family: "JetBrains Mono", size: 9 } }, 
            grid: { color: "rgba(143,168,156,0.1)" } 
          }
        }
      }
    });
  } catch (err) {
    console.error("Failed to load bin history:", err);
  }

  try {
    // Load prediction
    const predRes = await fetch(`/api/bins/${binId}/predict?hours=6`);
    const predData = await predRes.json();
    const predEl = document.getElementById("modalPredictVal");
    if (predEl) {
      predEl.textContent = `${(predData.predicted_level || 0).toFixed(0)}%`;
    }
  } catch (err) {
    console.error("Failed to load prediction:", err);
    const predEl = document.getElementById("modalPredictVal");
    if (predEl) {
      predEl.textContent = "—";
    }
  }
}

function closeModal() {
  document.getElementById("modalBackdrop").classList.remove("open");
  // Clean up chart when closing modal
  if (binDetailChart) {
    binDetailChart.destroy();
    binDetailChart = null;
  }
}

// ===========================================================================
// UTILITY: Clean up on page unload
// ===========================================================================
window.addEventListener("beforeunload", function() {
  if (refreshTimer) {
    clearInterval(refreshTimer);
    refreshTimer = null;
  }
});