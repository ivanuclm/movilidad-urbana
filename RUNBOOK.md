# Runbook

Guía operativa del entorno local. Todos los comandos asumen que el directorio
de trabajo es la raíz del repositorio.

---

## Primer arranque (repo recién clonado)

### Prerequisitos

1. Docker Desktop instalado y en ejecución.
2. Git LFS instalado (`git lfs install`). Los ficheros grandes ya deben estar
   descargados (`git lfs pull` si no).

### Arranque

```powershell
docker compose up --build
```

El primer arranque tarda ~15-20 minutos mientras `osrm-setup` compila los
grafos de enrutado. La secuencia automática es:

1. `gtfs-init` extrae el ZIP del GTFS al directorio del backend (una sola vez).
2. `osrm-setup` ejecuta extract → partition → customize para cada perfil OSRM
   (una sola vez; los perfiles ya compilados se saltan).
3. El resto de servicios arranca en paralelo.

Los arranques posteriores son inmediatos.

---

## Arranques habituales

```powershell
docker compose up          # sin --build si el código no ha cambiado
docker compose up --build  # con --build para recompilar imágenes
docker compose down        # para parar y eliminar contenedores
```

---

## URLs y puertos

| Servicio | URL |
|---|---|
| Simulador (frontend) | <http://127.0.0.1:5173> |
| Backend API | <http://127.0.0.1:8000> |
| Backend health | <http://127.0.0.1:8000/health> |
| OpenTripPlanner | <http://127.0.0.1:8080> |
| OSRM coche | <http://127.0.0.1:5000> |
| OSRM bicicleta | <http://127.0.0.1:5001> |
| OSRM a pie | <http://127.0.0.1:5002> |

---

## Endpoints del backend

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

## Datos y ficheros grandes (Git LFS)

Los ficheros pesados viven en Git LFS. Al clonar el repo con LFS instalado
se descargan automáticamente. Si los ficheros están ausentes:

```bash
git lfs pull
```

| Ruta | Tamaño | Propósito |
|---|---|---|
| `osrm-clm/clm.osm.pbf` | ~97 MB | Extracto OSM de Castilla-La Mancha |
| `otp-toledo/graph.obj` | ~117 MB | Grafo OTP pre-compilado |
| `otp-toledo/GTFS_Urbano_Toledo_2026.zip` | ~14 MB | Feed GTFS urbano de Toledo |
| `lpmc/models/xgb_lpmc.joblib` | ~17 MB | Modelo XGBoost (modelo activo) |
| `lpmc/models/dnn_lpmc.pt` | ~66 KB | Modelo DNN (PyTorch) |

---

## Reconstruir grafos OSRM

Solo necesario si cambia el `.osm.pbf`. Borra los directorios de perfil y
vuelve a arrancar; `osrm-setup` los reconstruye automáticamente:

```powershell
Remove-Item -Recurse -Force osrm-clm\car, osrm-clm\bike, osrm-clm\foot
docker compose up
```

O manualmente, perfil por perfil:

```powershell
# CAR
docker run --rm -t -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest osrm-extract -p /opt/car.lua /data/clm.osm.pbf
docker run --rm -t -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest osrm-partition /data/clm.osrm
docker run --rm -t -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest osrm-customize /data/clm.osrm

# BIKE
docker run --rm -t -v "$(pwd)/osrm-clm/bike:/data" osrm/osrm-backend:latest osrm-extract -p /opt/bicycle.lua /data/clm.osm.pbf
docker run --rm -t -v "$(pwd)/osrm-clm/bike:/data" osrm/osrm-backend:latest osrm-partition /data/clm.osrm
docker run --rm -t -v "$(pwd)/osrm-clm/bike:/data" osrm/osrm-backend:latest osrm-customize /data/clm.osrm

# FOOT
docker run --rm -t -v "$(pwd)/osrm-clm/foot:/data" osrm/osrm-backend:latest osrm-extract -p /opt/foot.lua /data/clm.osm.pbf
docker run --rm -t -v "$(pwd)/osrm-clm/foot:/data" osrm/osrm-backend:latest osrm-partition /data/clm.osrm
docker run --rm -t -v "$(pwd)/osrm-clm/foot:/data" osrm/osrm-backend:latest osrm-customize /data/clm.osrm
```

Perfiles OSRM utilizados: `car.lua`, `bicycle.lua`, `foot.lua` (incluidos en
la imagen oficial `osrm/osrm-backend`).

---

## Reconstruir grafo OTP

Solo necesario si cambia el OSM o el GTFS. El `graph.obj` pre-compilado del
LFS es suficiente para uso normal:

```powershell
docker run --rm -v "$(pwd)/otp-toledo:/var/opentripplanner" opentripplanner/opentripplanner:2.5.0 --build --save
```

---

## Actualizar GTFS del backend

El GTFS del backend se extrae automáticamente en el primer arranque desde el
ZIP del LFS. Para forzar una re-extracción:

```powershell
Remove-Item -Recurse -Force "movilidad-urbana-sim\backend\data\gtfs\GTFS_Urbano_Toledo_2026"
python scripts/gtfs_extract.py   # o vuelve a arrancar docker compose
```

---

## Modelos LPMC

### Modelo activo (XGBoost)

Cargado automáticamente desde `lpmc/models/xgb_lpmc.joblib` (Git LFS).
Configurado en `docker-compose.yml` mediante `LPMC_MODEL_VARIANT=xgb`.

### Entrenar el Random Forest (opcional)

El RF (~600 MB) no está en el repo. Para habilitarlo en `/api/lpmc/compare`:

```powershell
# Requiere el dataset LPMC (proporcionado por el tutor)
cd lpmc
python 02_preprocess.py    # genera data/preprocessed/
python 04_train_rf.py      # escribe models/rf_lpmc.joblib (~15 min)
docker compose restart backend
```

### Reentrenar todos los modelos

```powershell
cd lpmc
python 01_explore.py       # exploración EDA
python 02_preprocess.py    # preprocesado
python 03_train_xgb.py     # XGBoost → models/xgb_lpmc.joblib
python 04_train_rf.py      # Random Forest → models/rf_lpmc.joblib
python 05_train_dnn.py     # DNN PyTorch → models/dnn_lpmc.pt + .joblib
python 06_compare_models.py  # tabla comparativa y métricas LaTeX
docker compose restart backend
```

Nota: los tres modelos usan `GroupKFold(n_splits=5)` con `household_id` como
grupo (solo para la partición, nunca como feature). Las duraciones de OSRM/OTP
se convierten de segundos a horas antes de la inferencia (el dataset LPMC usa
horas como unidad).

---

## Logs y diagnóstico

```powershell
docker compose logs -f backend
docker compose logs -f osrm-setup
docker compose logs -f gtfs-init
docker compose logs -f otp
docker compose ps
```
