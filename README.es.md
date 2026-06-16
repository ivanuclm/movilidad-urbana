# Simulador de Movilidad Urbana para Toledo

> **English version:** [README.md](./README.md)

Simulador web de escenarios de movilidad urbana para Toledo. Calcula rutas
multimodales, visualiza la red de transporte público y predice la elección
modal mediante aprendizaje automático, todo dentro de un único stack Docker
Compose.

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
  con la opción de comparar con DNN y Random Forest.

---

## Requisitos previos

| Requisito | Notas |
|---|---|
| [Git](https://git-scm.com/) | Obligatorio. |
| [Docker Desktop](https://www.docker.com/products/docker-desktop/) | Obligatorio. Proporciona Docker Engine y Compose v2. |
| [Git LFS](https://git-lfs.com/) | Obligatorio para descargar los ficheros grandes (modelos, grafos de enrutado). |

---

## Inicio rápido

```bash
git lfs install                  # configuración única — ejecutar ANTES de clonar
git clone https://github.com/ivanuclm/movilidad-urbana.git
cd movilidad-urbana
docker compose up --build
```

Abre **http://127.0.0.1:5173** cuando todos los servicios estén activos.

> **El primer arranque tarda ~15-20 minutos** mientras OSRM compila los
> grafos de enrutado para los tres perfiles (coche, bicicleta, a pie) a
> partir del extracto OSM incluido. Los arranques posteriores son inmediatos.

### Qué hace `docker compose up` automáticamente

1. **`gtfs-init`** — extrae el ZIP del GTFS (del LFS) al directorio de datos
   del backend. Se salta en arranques posteriores.
2. **`osrm-setup`** — ejecuta `osrm-extract → osrm-partition → osrm-customize`
   para cada perfil de enrutado usando el PBF del LFS. Los perfiles ya
   compilados se saltan.
3. El resto de servicios arranca cuando los init containers terminan.

### Si clonaste sin Git LFS instalado

Los ficheros grandes estarán ausentes (solo punteros LFS en disco). Corrígelo con:

```bash
git lfs install
git lfs pull
docker compose up --build
```

---

## Operaciones habituales

```bash
docker compose up            # arrancar todos los servicios (rápido desde la 2ª vez)
docker compose up --build    # reconstruir imágenes y arrancar (tras cambios en el código)
docker compose down          # parar y eliminar contenedores
docker compose logs -f backend      # ver logs del backend en tiempo real
docker compose logs -f osrm-setup   # seguir la compilación de los grafos
docker compose logs -f gtfs-init    # seguir la extracción del GTFS
docker compose logs -f otp          # logs de OpenTripPlanner
docker compose ps                   # estado de los contenedores
```

---

## Servicios

| Servicio | URL |
|---|---|
| Simulador | http://127.0.0.1:5173 |
| Backend API | http://127.0.0.1:8000 |
| Health check | http://127.0.0.1:8000/health |
| OpenTripPlanner | http://127.0.0.1:8080 |
| OSRM coche | http://127.0.0.1:5000 |
| OSRM bicicleta | http://127.0.0.1:5001 |
| OSRM a pie | http://127.0.0.1:5002 |

---

## Endpoints del API

Todas las peticiones de enrutado e inferencia pasan por el backend FastAPI.
La documentación OpenAPI completa está disponible en http://127.0.0.1:8000/docs.

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

## Arquitectura

El frontend nunca habla directamente con OSRM u OTP — todas las peticiones
pasan por el backend FastAPI, que actúa como capa de orquestación con cuatro
routers:

```
Navegador (React + Leaflet)
        │  HTTP
        ▼
Backend FastAPI ──► OSRM coche     (puerto 5000)   /api/osrm
                    OSRM bicicleta (puerto 5001)   /api/otp
                    OSRM a pie     (puerto 5002)   /api/gtfs
                    OTP            (puerto 8080)   /api/lpmc
```

### Estructura del repositorio

```
.
├── movilidad-urbana-sim/
│   ├── backend/          FastAPI (Python 3.12)
│   └── frontend/         React + Vite + TypeScript + Leaflet
├── osrm-clm/
│   └── *.osm.pbf         Extracto OSM Castilla-La Mancha (Git LFS, ~97 MB)
├── otp-toledo/
│   ├── graph.obj         Grafo OTP pre-compilado (Git LFS, ~117 MB)
│   └── GTFS_Urbano_Toledo_2026.zip   GTFS urbano de Toledo (Git LFS, ~14 MB)
├── lpmc/
│   ├── models/           Modelos entrenados (Git LFS)
│   └── *.py              Scripts de entrenamiento
├── latex/                Memoria del TFM (fuente LaTeX + PDF compilado)
├── docker/               Dockerfiles (backend, frontend)
├── scripts/              Utilidades de setup
└── docker-compose.yml
```

### Ficheros almacenados en Git LFS

Git LFS guarda los ficheros binarios pesados fuera del historial de git
regular. Se descargan automáticamente al clonar con LFS instalado.

| Fichero | Tamaño | Propósito |
|---|---|---|
| `osrm-clm/*.osm.pbf` | ~97 MB | Red viaria OSM (Castilla-La Mancha) |
| `otp-toledo/graph.obj` | ~117 MB | Grafo OTP pre-compilado |
| `otp-toledo/GTFS_Urbano_Toledo_2026.zip` | ~14 MB | Feed GTFS urbano de Toledo |
| `lpmc/models/xgb_lpmc.joblib` | ~17 MB | Modelo XGBoost de elección modal |
| `lpmc/models/dnn_lpmc.pt` | ~66 KB | Modelo DNN de elección modal (PyTorch) |

---

## Modelos de elección modal

Dos modelos pre-entrenados se incluyen vía Git LFS y están listos para usar
sin necesidad de entrenar nada.

| Modelo | Fichero | Incluido | Notas |
|---|---|---|---|
| XGBoost | `xgb_lpmc.joblib` | **Sí (LFS)** | Modelo activo, mejor accuracy (~73% test) |
| DNN (PyTorch) | `dnn_lpmc.pt` | **Sí (LFS)** | Disponible en /compare |
| Random Forest | `rf_lpmc.joblib` | No (~600 MB) | Entrenar localmente (opcional, ver abajo) |

`/api/lpmc/predict` usa XGBoost por defecto (`LPMC_MODEL_VARIANT=xgb` en
`docker-compose.yml`). `/api/lpmc/compare` ejecuta todos los modelos
disponibles simultáneamente y omite silenciosamente los que no estén en disco.

### Activar el Random Forest (opcional)

El modelo RF (~600 MB) no está incluido en el repositorio. Para activarlo:

```bash
# Requiere el dataset LPMC — contacta con el tutor del proyecto
cd lpmc
python 02_preprocess.py      # genera data/preprocessed/
python 04_train_rf.py        # escribe models/rf_lpmc.joblib  (~15 min)
docker compose restart backend
```

### Reentrenar todos los modelos desde cero

El pipeline completo ejecuta seis scripts en secuencia. Se requiere Python
3.10+ instalado localmente. El dataset LPMC es necesario (no redistribuible
— contacta con el tutor del TFM).

```bash
cd lpmc
python 01_explore.py           # análisis exploratorio de datos
python 02_preprocess.py        # ingeniería de features y preprocesado
python 03_train_xgb.py         # XGBoost → models/xgb_lpmc.joblib
python 04_train_rf.py          # Random Forest → models/rf_lpmc.joblib (~15 min)
python 05_train_dnn.py         # DNN (PyTorch) → models/dnn_lpmc.pt + .joblib
python 06_compare_models.py    # tabla comparativa y métricas en LaTeX
docker compose restart backend
```

Los tres modelos usan `GroupKFold(n_splits=5)` con `household_id` como clave
de agrupación (solo para la partición train/test — `household_id` nunca se
usa como feature). Las duraciones de OSRM y OTP se convierten de segundos a
horas antes de la inferencia para coincidir con las unidades del dataset LPMC.

---

## Solución de problemas

### Grafos OSRM corruptos o incompletos

Borra los directorios de perfil y deja que `docker compose up` los reconstruya:

```bash
# Linux / macOS / Git Bash
rm -rf osrm-clm/car osrm-clm/bike osrm-clm/foot
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force osrm-clm\car, osrm-clm\bike, osrm-clm\foot
```

Vuelve a ejecutar `docker compose up`. El servicio `osrm-setup` recompila
los tres perfiles (~15 min).

### Extracción del GTFS fallida

Borra el directorio extraído y reinicia:

```bash
# Linux / macOS / Git Bash
rm -rf movilidad-urbana-sim/backend/data/gtfs/GTFS_Urbano_Toledo_2026
```

```powershell
# Windows PowerShell
Remove-Item -Recurse -Force "movilidad-urbana-sim\backend\data\gtfs\GTFS_Urbano_Toledo_2026"
```

Vuelve a ejecutar `docker compose up`.

---

## Reconstruir datos (avanzado)

El `graph.obj` y los grafos OSRM pre-compilados cubren el uso normal.
Reconstruye solo si actualizas el extracto OSM o el feed GTFS.

### Reconstruir el grafo OTP

```bash
docker run --rm \
  -v "$(pwd)/otp-toledo:/var/opentripplanner" \
  opentripplanner/opentripplanner:2.5.0 \
  --build --save
```

### Reconstruir los grafos OSRM manualmente

```bash
# Ejemplo para el perfil coche (repetir con bicycle.lua para bici, foot.lua para peatón)
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-extract -p /opt/car.lua /data/clm.osm.pbf
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-partition /data/clm.osrm
docker run --rm -v "$(pwd)/osrm-clm/car:/data" osrm/osrm-backend:latest \
  osrm-customize /data/clm.osrm
```

Los perfiles OSRM (`car.lua`, `bicycle.lua`, `foot.lua`) van incluidos en la
imagen oficial `osrm/osrm-backend` — no hace falta descargar nada aparte.

---

## Fuentes de datos

| Dataset | Fuente |
|---|---|
| GTFS urbano de Toledo | [NAP — Ministerio de Transportes](https://nap.transportes.gob.es/Files/Detail/1377) |
| Red viaria OSM (CLM) | [Geofabrik](https://download.geofabrik.de/europe/spain/castilla-la-mancha.html) |
| Dataset LPMC | Hillel et al. (2018), proporcionado por el tutor |

---

## Contexto académico

**Título:** Simulador web de escenarios de movilidad urbana mediante técnicas
de inteligencia artificial

**Máster:** Máster Universitario en Ingeniería Informática, ESIIAB — Universidad
de Castilla-La Mancha

**Referencias clave:**
- Hillel et al. (2018) — Dataset LPMC
- Martín-Baos et al. (2023) — ML para elección modal (Transportation Research Part C)
- Chen & Guestrin (2016) — XGBoost

---

## Licencia

Código fuente: MIT. Los ficheros de datos están sujetos a sus licencias
originales respectivas (ver Fuentes de datos).
