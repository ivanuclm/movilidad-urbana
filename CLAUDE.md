# TFM — Simulador Web de Movilidad Urbana

TFM del Máster en Ingeniería Informática (UCLM, ESIIAB). Simulador web de
movilidad urbana para Toledo con predicción de elección modal mediante ML.
Stack: FastAPI + React/Vite/TS + Leaflet + OSRM local (3 perfiles) +
OpenTripPlanner + GTFS Toledo + XGBoost/LPMC. Orquestación Docker Compose.
Memoria en LaTeX.

Estado actual de la memoria: ch1 tiene objetivos pero contexto/motivación y
alcance vacíos. ch2 prácticamente completo, solo falta subsección del dataset
LPMC. ch3 Scrum completo con 9 sprints. ch4 completo (con diagrama TikZ del
pipeline). ch5 y ch6 vacíos.
Estado detallado: ESTADO_MEMORIA.md

---

# Identificación del proyecto

TÍTULO: "SIMULADOR WEB DE ESCENARIOS DE MOVILIDAD URBANA MEDIANTE TÉCNICAS
DE INTELIGENCIA ARTIFICIAL"
TÍTULO EN INGLÉS: "Web-based simulator for urban mobility scenarios using
Artificial Intelligence techniques"
CENTRO: Escuela Superior de Informática de Albacete (ESIIAB), UCLM
MÁSTER: Máster Universitario en Ingeniería Informática

DESCRIPCIÓN OFICIAL: El proyecto propone el desarrollo de un prototipo de
simulador web que permita analizar cómo distintas políticas de transporte
impactan en el reparto modal de los viajes. Se basa en dos componentes
principales: un modelo de Machine Learning entrenado con un dataset de
movilidad para predecir la elección modal, y la integración de servicios de
enrutado (OSRM y OpenTripPlanner) que proporcionan tiempos y costes reales
entre pares origen-destino. La aplicación permite definir viajes sobre un
mapa, simular el comportamiento de los viajeros e incorpora controles para
modificar parámetros de política (costes del coche, tarifas de transporte
público, frecuencia de autobuses) generando escenarios what-if con métricas
de reparto modal, tiempo medio de viaje y emisiones estimadas de CO2.

COMPETENCIAS: CP01 (integración de tecnologías en contextos
multidisciplinares), CP05 (métodos matemáticos, estadísticos e IA para
sistemas inteligentes), CP07 (proyecto integral original de carácter
profesional).

FECHAS CLAVE:
- Depósito convocatoria ordinaria: 8 de julio de 2026
- Defensa convocatoria ordinaria: 15-24 de julio de 2026
- Límite de páginas: 80 (desde ch1 hasta fin de conclusiones,
  sin portada, índices, bibliografía ni anexos)
- Defensa: 20 min exposición + mínimo 10 min preguntas, máximo 60 min total

REPOSITORIO: https://github.com/ivanuclm/tfm

---

# Stack técnico

- Backend: FastAPI (Python), en movilidad-urbana-sim/backend/
- Frontend: React + Vite + TypeScript + Leaflet,
  en movilidad-urbana-sim/frontend/
- Routing viario: OSRM local con tres perfiles
  (driving:5000, cycling:5001, foot:5002)
- Transporte público: OpenTripPlanner 2.x + GTFS urbano de Toledo
  (puerto 8080)
- Modelos de elección modal: XGBoost, Random Forest y DNN (PyTorch),
  dataset LPMC, sin household_id en features (GroupKFold con hh_id como grupo)
- Inferencia: /api/lpmc/predict (modelo activo), /api/lpmc/compare (3 modelos)
- Orquestación: Docker Compose desde la raíz del repo
- Memoria: LaTeX compilada con XeLaTeX, capítulos en latex/chapters/

---

# Arquitectura del sistema

El frontend nunca habla directamente con OSRM ni OTP.
Todo pasa por FastAPI. Cuatro routers:
- /api/osrm: rutas viarias por perfil
- /api/otp: itinerarios multimodales, paginación y desglose por legs
- /api/gtfs: paradas, líneas, detalle de ruta y horarios
- /api/lpmc: inferencia modal y depuración de features

El modelo recibe variables derivadas de OSRM/OTP más variables
sociodemográficas (edad, género, carnet, coches en hogar, motivo,
combustible, costes) y devuelve probabilidades para walk, cycle, pt y drive.

---

# Decisiones de diseño importantes

- OSRM local: el demoserver oficial solo tiene perfil coche,
  lo que imposibilitaba la comparación modal
- OTP usa fecha y hora fijas (2025-12-01, 12:00) como parche temporal
  contra inconsistencias por festivos
- Tres modelos LPMC entrenados: xgb, rf, dnn. LPMC_MODEL_VARIANT=xgb por defecto
  en docker-compose. household_id solo para GroupKFold, nunca como feature.
- Las duraciones de OSRM/OTP se convierten de segundos a horas en el pipeline
  de inferencia para coincidir con las unidades del dataset LPMC.
- Colores de línea GTFS deterministas por route_id para consistencia visual
- Segmentos OTP solo visibles cuando el modo activo es transporte público
- Overwrite de variables PT (dur_pt_total, dur_pt_access, dur_pt_bus,
  dur_pt_rail, pt_n_interchanges) a valor de penalización cuando OTP no
  devuelve itinerario real, para evitar que el modelo elija PT en trayectos
  sin servicio real (PENDIENTE de implementar)

---

# Sprints ejecutados

1. Dic 2-5: Prototipo OSRM remoto. Problema: demoserver solo devuelve coche.
2. Dic 6-11: OSRM local multi-perfil (5000/5001/5002).
3. Dic 12-18: GTFS Toledo. Endpoints paradas/rutas/horarios, mapa.
4. Dic 19 - Feb 12: OTP multimodal. graph.obj, paginación, legs.
5. Dic 20 - Feb 20: Mejora visual y UX. Estilos por modo, colores.
6. Dic 21 - Ene 17: LPMC exploración y preprocesado.
   Split temporal train/test por survey_year.
7. Ene 18 - Feb 21: XGBoost baseline.
   Accuracy ~0.83 train, ~0.73 test. Bici con bajo recall.
8. Ene 27 - Mar 24: Escritura de memoria (paralelo a otros sprints).
9. Feb 22 - Mar 8: Integración inferencia LPMC.
   /api/lpmc/predict, variante nohh, debug-features.
10. Abr 28 - Abr 29: RF y DNN (PyTorch). GroupKFold con household_id.
    Semilla 481516. /api/lpmc/compare con panel frontend 3 modelos.
    Bug unidades (s→h) detectado y corregido en pipeline de inferencia.

---

# Fuentes de datos

- OSM Castilla-La Mancha: Geofabrik
- GTFS urbano de Toledo: NAP (Ministerio de Transportes)
- Dataset LPMC: proporcionado por el tutor (Hillel et al. 2018)

---

# Referencias bibliográficas clave (ref.bib)

- Hillel2018LPMC: dataset LPMC original
- CSLPMC2019: descripción técnica del dataset LPMC
- MartinBaos2023TRC: comparativa ML y modelos clásicos en elección modal
- MartinBaos2023Thesis: tesis doctoral del tutor (UCLM, 2023)
- Train2009, McFadden1974: teoría de elección discreta y RUM/MNL
- Breiman2001, Friedman2001, Chen2016XGBoost, Goodfellow2016: modelos ML
- ScrumGuide2020: Guía Scrum 2020
- OSRMDocs, OTPDocs, GTFSReference: enrutado y datos abiertos

---

# Estructura del repositorio

## Directorios

- `docker/` — Dockerfiles de backend y frontend (backend.Dockerfile,
  frontend.Dockerfile). El docker-compose.yml está en la raíz.

- `docs/` — Solo contiene app-preview.png para el README. Ignorar.

- `latex/` — Memoria del TFM. Compilar con XeLaTeX, fuente Calibri.
  - `latex/chapters/` — ch1.tex … ch6.tex, anexos.tex
  - `latex/figs/` — figuras referenciadas en la memoria
  - `latex/bib/ref.bib` — bibliografía
  - `latex/include/` — configuración, estilos, colores
  - `latex/elements/` — portada, preámbulo

- `lpmc/` — Scripts y libretas para exploración, preprocesado y
  entrenamiento de modelos de elección modal con el dataset LPMC
  (London Passenger Mode Choice). Artefactos de modelo entrenados aquí.

- `movilidad-urbana-sim/` — LA APLICACIÓN PRINCIPAL. Antes era un repo
  independiente, ahora integrado en el monorrepo.
  - `backend/` — FastAPI (Python), capa de orquestación
  - `frontend/` — React + Vite + TypeScript + Leaflet

- `osrm-clm/` — Grafos viarios preprocesados para OSRM, uno por perfil
  (car/, bike/, foot/). Artefactos pesados, no versionados en Git.

- `otp-toledo/` — Grafo multimodal OTP (graph.obj) + datos GTFS del
  bus urbano de Toledo. Artefactos pesados, no versionados en Git.

- `papers/` — PDFs de referencia:
  - `CS_LPMC.pdf` — descripción técnica del dataset LPMC
  - `dataset_description.pdf` — descripción de variables LPMC
  - `jsmic.17.00018.pdf` — Hillel et al. 2018 (paper original LPMC)
  - `TESIS Martin Baos - Copy_compressed.pdf` — tesis doctoral del tutor
    José Martín Baos (UCLM, 2023)

- `PLANTILLA TFM_ESP/` — Plantilla LaTeX oficial de la UCLM con
  instrucciones. Solo referencia, ignorar para edición.

- `prediction-behavioural-analysis-ml-travel-mode-choice/` — Fork del
  repo de GitHub del tutor José Martín Baos. Solo referencia para los
  experimentos con LPMC. Se eliminará del monorrepo más adelante.

## Ficheros en la raíz
- `docker-compose.yml` — orquestación completa del sistema
- `ESTADO_MEMORIA.md` — estado actualizado de la memoria LaTeX
- `INSTRUCCIONES.md` — contexto del proyecto
- `RUNBOOK.md` — comandos de operación habituales
- `README.md` — descripción pública del repo
- `CLAUDE.md` — contexto para Claude Code

---

# Normas de trabajo

- Responde siempre en español
- Soy ingeniero informático senior con conocimiento avanzado en CS, ML,
  infraestructura y desarrollo web full stack. Sin explicaciones básicas.
- Cuando redactes memoria: LaTeX listo para pegar, sin \begin{document}
  ni preámbulo, solo el contenido del capítulo o sección
- Tono técnico y académico pero natural, no acartonado
- Si hay incoherencias entre lo que pides y el estado real del proyecto,
  señálalas
- Código: snake_case Python, camelCase JS/TS, manejo de errores explícito
- No listes pros/cons sin conclusión. Opinión técnica directa.
- No uses guiones largos. Usa comas, puntos o dos puntos.
- \caption arriba en tablas, abajo en figuras
- El estado actualizado de la memoria está en ESTADO_MEMORIA.md