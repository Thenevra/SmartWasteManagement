# ♻️ Smart Waste Management System

> A full-stack IoT-simulated waste management dashboard. Garbage bins across a city report fill level and weight; the system raises alerts, charts trends, optimizes truck routes, and forecasts when bins will fill up — all using realistic simulated sensor data, built so real hardware can be plugged in later with minimal changes.

---

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Tech Stack](#tech-stack)
- [Folder Structure](#folder-structure)
- [How It Works](#how-it-works)
- [Getting Started](#getting-started)
- [API Reference](#api-reference)
- [IoT Hardware Integration](#iot-hardware-integration)
- [Author](#author)

---

## 🌆 Overview

Garbage bins across a city report fill level and weight in real time. The system raises alerts, charts trends, optimizes truck collection routes, and forecasts when bins will fill up — all powered by realistic simulated sensor data. Designed so real IoT hardware (ESP32/Arduino) can be plugged in later with minimal code changes.

---

## ✅ Features

### Core
- 📡 **Live Sensor Simulation** — fill level (0–100%) and weight readings update every 8 seconds per bin, trending realistically (gradual fill + random collection resets)
- 🚨 **Proactive Alerts** — auto-detects bins ≥ 80% (warning) and ≥ 90% (critical), shows live alert banner with a "Mark Collected" action
- 🗺️ **Live Map** — Leaflet.js map with color-coded bin markers, depot pin, and optimized route polyline
- 📊 **Data Insights** — 7 days of seeded history, city-wide trend chart, and status donut chart
- 🔄 **Auto-refresh** — dashboard updates every 8 seconds without page reload

### Advanced
- 🛣️ **Route Optimization** — nearest-neighbor heuristic with real Haversine distance, calculates the shortest practical collection order for all bins ≥ 70% full
- 🤖 **AI Fill Prediction** — ordinary least-squares linear regression forecasts each bin's fill level 6 hours ahead and estimates "hours until full"
- 🧩 **Bin Detail Modal** — click any card or map marker to see historical chart + AI prediction per bin

### Status Color Coding
| Fill Level | Color |
|---|---|
| 0 – 40% | 🟢 Green |
| 40 – 70% | 🟡 Yellow |
| 70 – 100% | 🔴 Red |

---

## 🛠️ Tech Stack

| Category | Technology |
|---|---|
| Backend | Python, Flask |
| Database | SQLite |
| Frontend | HTML5, CSS3, Vanilla JavaScript |
| Charts | Chart.js |
| Map | Leaflet.js + OpenStreetMap (no API key needed) |
| Fonts | Space Grotesk, Inter, JetBrains Mono |
| ML / Forecasting | Ordinary Least-Squares Linear Regression |
| Distance Calculation | Haversine Formula |

---

## 📁 Folder Structure

```
smart-waste-management/
│
├── app.py                      # Flask app: all routes + API endpoints + simulator thread
├── requirements.txt            # Python dependencies
│
├── database/
│   ├── __init__.py
│   ├── db_setup.py             # SQLite schema, seeding, all DB read/write functions
│   └── waste_management.db     # Created automatically on first run
│
├── sensors/
│   ├── __init__.py
│   └── simulator.py            # Generates random fill-level / weight readings
│
├── optimization/
│   ├── __init__.py
│   ├── route_planner.py        # Nearest-neighbor route optimization (Haversine distance)
│   └── predictor.py            # Linear regression fill-level forecasting
│
├── templates/
│   └── index.html              # Single-page dashboard (Jinja2 template)
│
└── static/
    ├── css/
    │   └── style.css           # "City Operations Console" dark UI theme
    └── js/
        └── dashboard.js        # Fetches API data, renders cards/map/charts, auto-refresh
```

---

## ⚙️ How It Works

| Layer | Technology | Responsibility |
|---|---|---|
| Sensor Simulation | `sensors/simulator.py` + background thread | Generates fill % and weight every 8s per bin with realistic trending |
| Database | SQLite (`database/db_setup.py`) | Stores bin metadata, time-series readings, and alerts |
| Backend API | Flask (`app.py`) | REST JSON endpoints consumed by the dashboard |
| Route Optimization | `optimization/route_planner.py` | Nearest-neighbor heuristic + Haversine distance from depot |
| AI Prediction | `optimization/predictor.py` | Linear regression on recent readings → forecast fill + time-to-full |
| Frontend | HTML/CSS/JS + Chart.js + Leaflet.js | Card dashboard, live map, trend charts, 8s auto-refresh |

---

## 🚀 Getting Started

### Prerequisites

- Python 3.8+
- pip

### Installation

**1. Clone the repository**
```bash
git clone YOUR_GITHUB_LINK_HERE
cd smart-waste-management
```

**2. Create a virtual environment (recommended)**
```bash
python3 -m venv venv
source venv/bin/activate        # Windows: venv\Scripts\activate
```

**3. Install dependencies**
```bash
pip install -r requirements.txt
```

**4. Run the app**
```bash
python app.py
```

You should see:
```
Smart Waste Management System - Starting Server
Dashboard: http://127.0.0.1:5000
```

> The SQLite database (`database/waste_management.db`) and 7 days of seed history are created automatically on first run.

**5. Open the dashboard**

Visit [http://127.0.0.1:5000](http://127.0.0.1:5000) in your browser.

### Resetting Data

Delete the database file and restart — it reseeds automatically:
```bash
rm database/waste_management.db
python app.py
```

---

## 📡 API Reference

### Get All Bins
```
GET /api/bins
```

### Get City Statistics
```
GET /api/stats
```

### Post Sensor Reading
```
POST /api/sensor-data
Content-Type: application/json

{
  "bin_id": "BIN-001",
  "fill_level": 88.5,
  "weight_kg": 65.2
}
```

### Get Optimized Collection Route
```
GET /api/route
```

### Get Alerts
```
GET /api/alerts
```

---

## 🔌 IoT Hardware Integration

This project is designed for easy migration from simulation to real hardware:

**Test the sensor endpoint right now:**
```bash
curl -X POST http://127.0.0.1:5000/api/sensor-data \
  -H "Content-Type: application/json" \
  -d '{"bin_id": "BIN-001", "fill_level": 88.5, "weight_kg": 65.2}'
```

**To go live with real hardware:**
- The `POST /api/sensor-data` endpoint is already what an ESP32/Arduino + ultrasonic sensor + load cell would call — no changes needed on the backend
- All simulated sensor logic is isolated in one function: `sensors/simulator.py → generate_reading()`. Simply stop calling it and let real devices POST instead
- To swap SQLite for PostgreSQL/TimescaleDB in production, only `database/db_setup.py` needs updating — no other file touches SQL

---


---

<p align="center">Made with ❤️ for smarter, cleaner cities</p>
