# Urban Mobility Simulator for Toledo

> **Documentación en español:** [README.es.md](./README.es.md)

Web-based simulator for urban mobility scenarios in Toledo, Spain. Computes
multimodal routes, visualises public transport networks and predicts travel
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
- Plan public transport journeys using OpenTripPlanner 2.x and the Toledo
  urban GTFS feed.
- Explore bus lines, stops and timetables in the GTFS panel.
- Run travel mode choice inference with an XGBoost model trained on the
  London Passenger Mode Choice (LPMC) dataset, and optionally compare with
  a Random Forest and a DNN.

---

## Quick start

### Requirements

- [Docker Desktop](https://www.docker.com/products/docker-desktop/) (with
  Compose v2 support)
- [Git LFS](https://git-lfs.com/) (to download large model and data files)

### Clone and launch

```bash
git lfs install          # one-time setup on your machine
git clone https://github.com/ivanuclm/urban-mobility-sim.git
cd urban-mobility-sim
docker compose up --build
```

**First run takes ~15–20 minutes** while OSRM builds the routing graphs for
all three profiles (car, cycling, foot) from the included OSM extract. Every
subsequent run starts in seconds — the graphs are cached on disk.

Once all services are ready, open:

| Service | URL |
|---|---|
| Simulator | <http://127.0.0.1:5173> |
| Backend API | <http://127.0.0.1:8000> |
| API health | <http://127.0.0.1:8000/health> |
| OpenTripPlanner | <http://127.0.0.1:8080> |
| OSRM car | <http://127.0.0.1:5000> |
| OSRM cycling | <http://127.0.0.1:5001> |
| OSRM foot | <http://127.0.0.1:5002> |

### What happens on first run

The `docker compose up` command orchestrates the following automatically:

1. **`gtfs-init`** — extracts `otp-toledo/GTFS_Urbano_Toledo_2026.zip` (from
   LFS) to `movilidad-urbana-sim/backend/data/gtfs/`. Skipped on re-runs.
2. **`osrm-setup`** — runs `osrm-extract → osrm-partition → osrm-customize`
   for each profile (car, cycling, foot) using the shared OSM PBF from LFS.
   Profiles that are already compiled are skipped.
3. All remaining services start once the init containers finish.

---

## Architecture

The frontend never talks directly to OSRM or OTP — all requests go through
the FastAPI backend, which acts as an orchestration layer.

```
Browser (React + Leaflet)
        │  HTTP
        ▼
FastAPI backend  ──► OSRM car     (port 5000)
    /api/osrm        OSRM cycling  (port 5001)
    /api/otp         OSRM foot     (port 5002)
    /api/gtfs        OTP           (port 8080)
    /api/lpmc
```

### Repository layout

```
.
├── movilidad-urbana-sim/
│   ├── backend/          FastAPI (Python 3.12)
│   └── frontend/         React + Vite + TypeScript + Leaflet
├── osrm-clm/
│   └── clm.osm.pbf       Castilla-La Mancha OSM extract (Git LFS, ~97 MB)
├── otp-toledo/
│   ├── graph.obj          Pre-built OTP graph (Git LFS, ~117 MB)
│   └── GTFS_Urbano_Toledo_2026.zip  Toledo urban GTFS (Git LFS, ~14 MB)
├── lpmc/
│   ├── models/            Trained models (Git LFS)
│   │   ├── xgb_lpmc.joblib        XGBoost — active model (~17 MB)
│   │   ├── dnn_lpmc.pt            DNN (PyTorch, ~66 KB)
│   │   └── dnn_lpmc.joblib        DNN wrapper
│   └── *.py               Training scripts
├── latex/                 Academic thesis (LaTeX source + compiled PDF)
├── docker/                Dockerfiles (backend, frontend)
├── scripts/               Setup helpers (gtfs_extract.py)
└── docker-compose.yml
```

### Git LFS

Large binary files are stored in Git LFS (not in the regular git history).
They are downloaded automatically by `git clone` when LFS is installed. If
you forgot to install LFS before cloning, run:

```bash
git lfs install
git lfs pull
```

Files tracked via LFS:

| File | Size | Purpose |
|---|---|---|
| `osrm-clm/clm.osm.pbf` | ~97 MB | OSM road network (CLM region) |
| `otp-toledo/graph.obj` | ~117 MB | Pre-built OTP routing graph |
| `otp-toledo/GTFS_Urbano_Toledo_2026.zip` | ~14 MB | Toledo urban GTFS feed |
| `lpmc/models/xgb_lpmc.joblib` | ~17 MB | XGBoost mode choice model |
| `lpmc/models/dnn_lpmc.pt` | ~66 KB | DNN mode choice model |

---

## Travel mode choice models

The `/api/lpmc/predict` endpoint uses the XGBoost model by default
(`LPMC_MODEL_VARIANT=xgb` in `docker-compose.yml`).

The `/api/lpmc/compare` endpoint runs all three models simultaneously and
gracefully skips any that are not available.

| Model | File | Included | Notes |
|---|---|---|---|
| XGBoost | `xgb_lpmc.joblib` | Yes (LFS) | Active model, best accuracy |
| DNN (PyTorch) | `dnn_lpmc.pt` | Yes (LFS) | Used in /compare |
| Random Forest | `rf_lpmc.joblib` | No | Train locally (see below) |

### Training the Random Forest (optional)

The RF model (~600 MB) is excluded from the repository. To enable it for the
`/compare` endpoint, train it locally:

```bash
# Requires the LPMC dataset — contact the project supervisor
cd lpmc
python 02_preprocess.py      # generates data/preprocessed/
python 04_train_rf.py        # writes models/rf_lpmc.joblib (~15 min)
docker compose restart backend
```

If the RF model file is absent, `GET /api/lpmc/compare` returns results for
XGBoost and DNN only, with no error.

---

## Rebuilding data (advanced)

The pre-built `graph.obj` and OSRM graphs are sufficient for normal use.
Rebuild only if you update the OSM extract or GTFS feed.

### Rebuild OTP graph

```bash
docker run --rm \
  -v "$(pwd)/otp-toledo:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.5.0 \
  --build --save
```

### Rebuild OSRM graphs

Delete the profile directories and re-run `docker compose up`:

```bash
rm -rf osrm-clm/car osrm-clm/bike osrm-clm/foot
docker compose up
```

---

## Data sources

| Dataset | Source |
|---|---|
| Toledo urban GTFS | [NAP — Ministerio de Transportes](https://nap.mitma.es/) |
| OSM road network (CLM) | [Geofabrik](https://download.geofabrik.de/europe/spain/castilla-la-mancha.html) |
| LPMC dataset | Hillel et al. (2018), provided by the thesis supervisor |

OSRM routing profiles (`car.lua`, `bicycle.lua`, `foot.lua`) are the official
profiles bundled inside the `osrm/osrm-backend` Docker image.

---

## Academic context

**Title:** Web-based simulator for urban mobility scenarios using Artificial
Intelligence techniques

**Programme:** Master's Degree in Computer Engineering, ESIIAB-UCLM

**Key references:**
- Hillel et al. (2018) — LPMC dataset
- Martín-Baos et al. (2023) — ML for travel mode choice (TRC)
- Chen & Guestrin (2016) — XGBoost

---

## License

Source code: MIT. Data files distributed under their respective original
licenses (see Data sources above).
