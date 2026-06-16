# Simulador de Movilidad Urbana para Toledo

> **English version:** [README.md](./README.md)

Simulador web de escenarios de movilidad urbana para Toledo. Calcula rutas
multimodales, visualiza la red de transporte público y predice la elección
modal mediante aprendizaje automático, todo ello dentro de un único stack
Docker Compose.

Desarrollado como Trabajo Fin de Máster en la Universidad de Castilla-La
Mancha (ESIIAB, UCLM).

![Simulator main view](docs/app-preview.png)

---

## Funcionalidades

- Selección de origen y destino haciendo clic derecho sobre el mapa interactivo.
- Cálculo de rutas en coche, bicicleta y a pie mediante tres instancias
  locales de OSRM.
- Planificación de trayectos en transporte público con OpenTripPlanner 2.x y
  el feed GTFS urbano de Toledo.
- Exploración de líneas, paradas y horarios en el panel GTFS.
- Inferencia de elección modal con XGBoost entrenado sobre el dataset LPMC,
  con la opción de comparar con Random Forest y DNN.

---

## Inicio rápido

### Requisitos

- [Docker Desktop](https://www.docker.com/products/docker-desktop/)
  (con soporte Compose v2)
- [Git LFS](https://git-lfs.com/) (para descargar los ficheros grandes de
  modelos y datos)

### Clonar y arrancar

```bash
git lfs install          # configuración única en tu máquina
git clone https://github.com/ivanuclm/urban-mobility-sim.git
cd urban-mobility-sim
docker compose up --build
```

**El primer arranque tarda ~15-20 minutos** mientras OSRM construye los
grafos de enrutado para los tres perfiles (coche, bicicleta, a pie) a partir
del extracto OSM incluido. Los arranques posteriores son inmediatos, ya que
los grafos quedan en disco.

Una vez que todos los servicios están activos:

| Servicio | URL |
|---|---|
| Simulador | <http://127.0.0.1:5173> |
| Backend API | <http://127.0.0.1:8000> |
| Health check | <http://127.0.0.1:8000/health> |
| OpenTripPlanner | <http://127.0.0.1:8080> |
| OSRM coche | <http://127.0.0.1:5000> |
| OSRM bicicleta | <http://127.0.0.1:5001> |
| OSRM a pie | <http://127.0.0.1:5002> |

### Qué ocurre en el primer arranque

`docker compose up` orquesta automáticamente lo siguiente:

1. **`gtfs-init`** — extrae `otp-toledo/GTFS_Urbano_Toledo_2026.zip` (del
   LFS) a `movilidad-urbana-sim/backend/data/gtfs/`. Se salta si ya existe.
2. **`osrm-setup`** — ejecuta `osrm-extract → osrm-partition → osrm-customize`
   para cada perfil usando el PBF del LFS. Los perfiles ya compilados se
   saltan.
3. El resto de servicios arranca una vez que los contenedores de init terminan.

---

## Arquitectura

El frontend nunca habla directamente con OSRM u OTP; todas las peticiones
pasan por el backend FastAPI, que actúa como capa de orquestación.

```
Navegador (React + Leaflet)
        │  HTTP
        ▼
Backend FastAPI  ──► OSRM coche     (puerto 5000)
    /api/osrm        OSRM bicicleta  (puerto 5001)
    /api/otp         OSRM a pie      (puerto 5002)
    /api/gtfs        OTP             (puerto 8080)
    /api/lpmc
```

### Estructura del repositorio

```
.
├── movilidad-urbana-sim/
│   ├── backend/          FastAPI (Python 3.12)
│   └── frontend/         React + Vite + TypeScript + Leaflet
├── osrm-clm/
│   └── clm.osm.pbf       Extracto OSM Castilla-La Mancha (Git LFS, ~97 MB)
├── otp-toledo/
│   ├── graph.obj          Grafo OTP pre-compilado (Git LFS, ~117 MB)
│   └── GTFS_Urbano_Toledo_2026.zip  GTFS urbano de Toledo (Git LFS, ~14 MB)
├── lpmc/
│   ├── models/            Modelos entrenados (Git LFS)
│   │   ├── xgb_lpmc.joblib        XGBoost — modelo activo (~17 MB)
│   │   ├── dnn_lpmc.pt            DNN (PyTorch, ~66 KB)
│   │   └── dnn_lpmc.joblib        Wrapper DNN
│   └── *.py               Scripts de entrenamiento
├── latex/                 Memoria del TFM (fuente LaTeX + PDF compilado)
├── docker/                Dockerfiles (backend, frontend)
├── scripts/               Utilidades de setup (gtfs_extract.py)
└── docker-compose.yml
```

### Git LFS

Los ficheros binarios pesados se almacenan en Git LFS (no en el histórico
de git regular). Se descargan automáticamente al hacer `git clone` si LFS
está instalado. Si lo olvidaste antes de clonar:

```bash
git lfs install
git lfs pull
```

Ficheros gestionados por LFS:

| Fichero | Tamaño | Propósito |
|---|---|---|
| `osrm-clm/clm.osm.pbf` | ~97 MB | Red viaria OSM (Castilla-La Mancha) |
| `otp-toledo/graph.obj` | ~117 MB | Grafo OTP pre-compilado |
| `otp-toledo/GTFS_Urbano_Toledo_2026.zip` | ~14 MB | Feed GTFS urbano de Toledo |
| `lpmc/models/xgb_lpmc.joblib` | ~17 MB | Modelo XGBoost de elección modal |
| `lpmc/models/dnn_lpmc.pt` | ~66 KB | Modelo DNN de elección modal |

---

## Modelos de elección modal

El endpoint `/api/lpmc/predict` usa XGBoost por defecto (`LPMC_MODEL_VARIANT=xgb`
en `docker-compose.yml`).

El endpoint `/api/lpmc/compare` ejecuta los tres modelos simultáneamente y
omite sin error los que no estén disponibles.

| Modelo | Fichero | Incluido | Notas |
|---|---|---|---|
| XGBoost | `xgb_lpmc.joblib` | Sí (LFS) | Modelo activo, mejor accuracy |
| DNN (PyTorch) | `dnn_lpmc.pt` | Sí (LFS) | Usado en /compare |
| Random Forest | `rf_lpmc.joblib` | No | Entrenar localmente (ver abajo) |

### Entrenar el Random Forest (opcional)

El modelo RF (~600 MB) no está incluido en el repositorio. Para activarlo
en el endpoint `/compare`, entrénalo localmente:

```bash
# Requiere el dataset LPMC — contacta con el tutor del proyecto
cd lpmc
python 02_preprocess.py      # genera data/preprocessed/
python 04_train_rf.py        # escribe models/rf_lpmc.joblib (~15 min)
docker compose restart backend
```

Si el fichero RF no existe, `/api/lpmc/compare` devuelve resultados solo
para XGBoost y DNN, sin ningún error.

---

## Reconstruir datos (avanzado)

Los grafos precompilados son suficientes para el uso normal. Solo hay que
reconstruirlos si cambias el extracto OSM o el feed GTFS.

### Reconstruir el grafo OTP

```bash
docker run --rm \
  -v "$(pwd)/otp-toledo:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.5.0 \
  --build --save
```

### Reconstruir los grafos OSRM

Borra los directorios de perfil y vuelve a ejecutar `docker compose up`:

```bash
rm -rf osrm-clm/car osrm-clm/bike osrm-clm/foot
docker compose up
```

---

## Fuentes de datos

| Dataset | Fuente |
|---|---|
| GTFS urbano de Toledo | [NAP — Ministerio de Transportes](https://nap.mitma.es/) |
| Red viaria OSM (CLM) | [Geofabrik](https://download.geofabrik.de/europe/spain/castilla-la-mancha.html) |
| Dataset LPMC | Hillel et al. (2018), proporcionado por el tutor |

Los perfiles de OSRM (`car.lua`, `bicycle.lua`, `foot.lua`) son los perfiles
oficiales incluidos en la imagen Docker `osrm/osrm-backend`.

---

## Contexto académico

**Título:** Simulador web de escenarios de movilidad urbana mediante técnicas
de inteligencia artificial

**Máster:** Máster Universitario en Ingeniería Informática, ESIIAB-UCLM

**Referencias clave:**
- Hillel et al. (2018) — Dataset LPMC
- Martín-Baos et al. (2023) — ML para elección modal (Transportation Research Part C)
- Chen & Guestrin (2016) — XGBoost

---

## Licencia

Código fuente: MIT. Los ficheros de datos se distribuyen bajo sus licencias
originales respectivas (ver Fuentes de datos).
