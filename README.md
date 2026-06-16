# Urban Mobility Simulator for Toledo

> **Documentación en español:** [README.es.md](./README.es.md)

Web-based simulator for urban mobility scenarios in Toledo, Spain. Computes
multimodal routes, visualises the public transport network and predicts travel
mode choice using machine learning — all within a single Docker Compose stack.

Developed as a Master's thesis project at the University of Castilla-La Mancha
(ESIIAB, UCLM).

![Python](https://img.shields.io/badge/Python-3.12-3776AB?logo=python&logoColor=white)
![FastAPI](https://img.shields.io/badge/FastAPI-Backend-009688?logo=fastapi&logoColor=white)
![React](https://img.shields.io/badge/React-Frontend-61DAFB?logo=react&logoColor=black)
![TypeScript](https://img.shields.io/badge/TypeScript-UI-3178C6?logo=typescript&logoColor=white)
![Docker](https://img.shields.io/badge/Docker-Compose-2496ED?logo=docker&logoColor=white)
![Leaflet](https://img.shields.io/badge/Leaflet-Map-199900?logo=leaflet&logoColor=white)

![Simulator main view](docs/app-preview.png)

---

## Features

- Set an origin and destination by right-clicking on the interactive map.
- Compute car, cycling and walking routes via three local OSRM instances.
- Plan public transport journeys with OpenTripPlanner 2.x and the Toledo
  urban GTFS feed.
- Explore bus lines, stops and timetables in the GTFS panel.
- Run travel mode choice inference with an XGBoost model trained on the
  London Passenger Mode Choice (LPMC) dataset, and optionally compare with
  a DNN and a Random Forest.

---

## Prerequisites

| Requirement | Notes |
|---|---|
| [Git](https://git-scm.com/) | Required. |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Required. Provides Docker Engine and Compose v2. |
| [Git LFS](https://git-lfs.com/) | Required to download large data files (models, routing graphs). |

---

## Quick start

```bash
git lfs install                  # one-time setup — must run BEFORE cloning
git clone https://github.com/ivanuclm/movilidad-urbana.git
cd movilidad-urbana
docker compose up --build
```

Open **http://127.0.0.1:5173** once all services are ready.

> **First run takes ~15–20 minutes** while OSRM compiles the routing graphs
> for car, cycling and foot profiles from the included OSM extract. Every
> subsequent run starts in seconds.

### What `docker compose up` does automatically

1. **`gtfs-init`** — extracts the GTFS zip (from LFS) into the backend data
   directory. Skipped on re-runs.
2. **`osrm-setup`** — runs `osrm-extract → osrm-partition → osrm-customize`
   for each routing profile using the shared OSM PBF (from LFS). Profiles
   that are already compiled are skipped.
3. All application services start once the init containers finish.

### If you cloned without Git LFS installed

The large data files will be missing (only LFS pointer files on disk).
Fix it with:

```bash
git lfs install
git lfs pull
docker compose up --build
```

---

## Common operations

```bash
docker compose up            # start all services (fast after first run)
docker compose up --build    # rebuild images and start (use after code changes)
docker compose down          # stop and remove containers
docker compose logs -f backend      # stream backend logs
docker compose logs -f osrm-setup   # check graph compilation progress
docker compose logs -f gtfs-init    # check GTFS extraction
docker compose logs -f otp          # OpenTripPlanner logs
docker compose ps                   # list container status
```

---

## Services

| Service | URL |
|---|---|
| Simulator | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8000 |
| API health | http://127.0.0.1:8000/health |
| OpenTripPlanner | http://127.0.0.1:8080 |
| OSRM — car | http://127.0.0.1:5000 |
| OSRM — cycling | http://127.0.0.1:5001 |
| OSRM — foot | http://127.0.0.1:5002 |

---

## API endpoints

All routing and inference requests go through the FastAPI backend. The full
OpenAPI documentation is available at http://127.0.0.1:8000/docs.

```
GET  /health
POST /api/osrm/routes
POST /api/otp/routes
GET  /api/gtfs/stops?limit=5000
GET  /api/gtfs/routes
GET  /api/gtfs/routes/{route_id}
GET  /api/gtfs/routes/{route_id}/schedule?date=YYYY-MM-DD
POST /api/lpmc/predict
POST /api/lpmc/compare
GET  /api/lpmc/model-info
```

---

## Architecture

The frontend never talks directly to OSRM or OTP — all requests go through
the FastAPI backend, which acts as an orchestration layer with four routers:

```
Browser (React + Leaflet)
        │  HTTP
        ▼
FastAPI backend ──► OSRM car      (port 5000)   /api/osrm
                    OSRM cycling  (port 5001)   /api/otp
                    OSRM foot     (port 5002)   /api/gtfs
                    OTP           (port 8080)   /api/lpmc
```

### Repository layout

```
.
├── movilidad-urbana-sim/
│   ├── backend/          FastAPI (Python 3.12)
│   └── frontend/         React + Vite + TypeScript + Leaflet
├── osrm-clm/
│   └── *.osm.pbf         Castilla-La Mancha OSM extract (Git LFS, ~97 MB)
├── otp-toledo/
│   ├── graph.obj         Pre-built OTP graph (Git LFS, ~117 MB)
│   └── GTFS_Urbano_Toledo_2026.zip   Toledo urban GTFS (Git LFS, ~14 MB)
├── lpmc/
│   ├── models/           Trained models (Git LFS)
│   └── *.py              Training scripts
├── latex/                Academic thesis (LaTeX source + compiled PDF)
├── docker/               Dockerfiles (backend, frontend)
├── scripts/              Setup helpers
└── docker-compose.yml
```

### Files stored in Git LFS

Git LFS stores large binary files outside the regular git history. They are
downloaded automatically when you clone with LFS installed.

| File | Size | Purpose |
|---|---|---|
| `osrm-clm/*.osm.pbf` | ~97 MB | OSM road network (CLM region) |
| `otp-toledo/graph.obj` | ~117 MB | Pre-built OTP routing graph |
| `otp-toledo/GTFS_Urbano_Toledo_2026.zip` | ~14 MB | Toledo urban GTFS feed |
| `lpmc/models/xgb_lpmc.joblib` | ~17 MB | XGBoost mode choice model |
| `lpmc/models/dnn_lpmc.pt` | ~66 KB | DNN mode choice model (PyTorch) |

---

## Travel mode choice models

Two pre-trained models are included via Git LFS and ready to use out of the
box. No training required for normal operation.

| Model | File | Included | Notes |
|---|---|---|---|
| XGBoost | `xgb_lpmc.joblib` | **Yes (LFS)** | Active model, best accuracy (~73% test) |
| DNN (PyTorch) | `dnn_lpmc.pt` | **Yes (LFS)** | Available in /compare |
| Random Forest | `rf_lpmc.joblib` | No (~600 MB) | Train locally (optional, see below) |

`/api/lpmc/predict` uses XGBoost by default (`LPMC_MODEL_VARIANT=xgb` in
`docker-compose.yml`). `/api/lpmc/compare` runs all available models
simultaneously and silently skips any that are not present on disk.

### Enabling the Random Forest (optional)

The RF model (~600 MB) is excluded from the repository. To enable it:

```bash
# Requires the LPMC dataset — contact the project supervisor
cd lpmc
python 02_preprocess.py      # generates data/preprocessed/
python 04_train_rf.py        # writes models/rf_lpmc.joblib  (~15 min)
docker compose restart backend
```

### Retraining all models from scratch

The full pipeline runs six scripts in sequence. Python 3.10+ must be installed
locally. The LPMC dataset is required (not redistributable — contact the
thesis supervisor).

```bash
cd lpmc
python 01_explore.py           # exploratory data analysis
python 02_preprocess.py        # feature engineering and preprocessing
python 03_train_xgb.py         # XGBoost → models/xgb_lpmc.joblib
python 04_train_rf.py          # Random Forest → models/rf_lpmc.joblib (~15 min)
python 05_train_dnn.py         # DNN (PyTorch) → models/dnn_lpmc.pt + .joblib
python 06_compare_models.py    # comparison table and LaTeX metrics
docker compose restart backend
```

All three models use `GroupKFold(n_splits=5)` with `household_id` as the
grouping key (train/test split only — `household_id` is never used as a
feature). Durations from OSRM and OTP are converted from seconds to hours
before inference to match the units in the LPMC dataset.

---

## Troubleshooting

### OSRM graphs corrupted or incomplete

Delete the profile directories and let `docker compose up` rebuild them:

```bash
# Linux / macOS / Git Bash
rm -rf osrm-clm/car osrm-clm/bike osrm-clm/foot

# Windows PowerShell
Remove-Item -Recurse -Force osrm-clm\car, osrm-clm\bike, osrm-clm\foot
```

Then re-run `docker compose up`. The `osrm-setup` service will recompile
all three profiles (~15 min).

### GTFS extraction failed

Delete the extracted directory and restart:

```bash
# Linux / macOS / Git Bash
rm -rf movilidad-urbana-sim/backend/data/gtfs/GTFS_Urbano_Toledo_2026

# Windows PowerShell
Remove-Item -Recurse -Force "movilidad-urbana-sim\backend\data\gtfs\GTFS_Urbano_Toledo_2026"
```

Then re-run `docker compose up`.

---

## Rebuilding data (advanced)

The pre-built `graph.obj` and OSRM graphs cover all normal usage. Rebuild
only if you update the OSM extract or GTFS feed.

### Rebuild OTP graph

```bash
docker run --rm \
  -v "$(pwd)/otp-toledo:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.5.0 \
  --build --save
```

### Rebuild OSRM graphs manually

```bash
# Example for car profile (repeat for bike with bicycle.lua, foot with foot.lua)
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/clm.osm.pbf
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-partition /data/clm.osrm
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-customize /data/clm.osrm
```

OSRM profiles (`car.lua`, `bicycle.lua`, `foot.lua`) are bundled in the
official `osrm/osrm-backend` Docker image — no separate download needed.

---

## Data sources

| Dataset | Source |
|---|---|
| Toledo urban GTFS | [NAP — Ministerio de Transportes](https://nap.transportes.gob.es/Files/Detail/1377) |
| OSM road network (CLM) | [Geofabrik](https://download.geofabrik.de/europe/spain/castilla-la-mancha.html) |
| LPMC dataset | Hillel et al. (2018), provided by the thesis supervisor |

---

## Academic context

**Title:** Web-based simulator for urban mobility scenarios using Artificial
Intelligence techniques

**Programme:** Master's Degree in Computer Engineering, ESIIAB — University
of Castilla-La Mancha

**Key references:**
- Hillel et al. (2018) — LPMC dataset
- Martín-Baos et al. (2023) — ML for travel mode choice (Transportation Research Part C)
- Chen & Guestrin (2016) — XGBoost

---

## License

Source code: MIT. Data files are subject to their respective original
licenses (see Data sources above).
