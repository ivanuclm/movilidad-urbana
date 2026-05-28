# Estado de la memoria LaTeX — actualizado 29 mayo 2026 (rev5)

## ch1 — Introducción
- Objetivo general: OK
- Objetivos específicos: OK
- Competencias trabajadas: OK
- Contexto y motivación: VACÍO
- Alcance y limitaciones: VACÍO

## ch2 — Estado del arte y marco tecnológico
- Fundamentos y enfoques: OK
- Datos abiertos (OSM, GTFS): OK
- Tecnologías de enrutado (OSRM, OTP): OK (bug \cite huérfano corregido)
- Plataformas propietarias + tabla comparativa: OK (tabla unificada sin bordes verticales)
- Modelado de elección modal:
  - Intro + mención LPMC como referencia: OK
  - RUM y utilidad aleatoria (con ecuaciones): OK
  - Modelo Logit Multinomial (con ecuaciones y figura mnl_sigmoid): OK
  - Limitaciones del enfoque clásico: OK
  - Aprendizaje automático para elección modal: OK
  - Random Forests: OK
  - Gradient Boosting / XGBoost: OK
  - Redes Neuronales Profundas: OK (cierre con referencia a XGBoost/ch5)
  - Subsección dataset LPMC: PENDIENTE

## ch3 — Metodología (Scrum)
- \label{ch:metodologia}: OK (añadido)
- SCRUM adaptado a desarrollo unipersonal: OK
- Product Backlog y priorización: OK
- Sprints 1-9 con fechas reales y narrativa: OK (sprint 3 y 5 ampliados con detalles técnicos)
- Diagrama Gantt (sprints_timeline.png) referenciado: OK
- Sección de cierre con placeholder para sprints adicionales: OK
- Sprint reviews y retrospectivas: COMENTADAS, pendientes de pulir

## ch4 — Arquitectura del sistema
- Intro + principio de diseño central (frontend nunca habla con servicios externos): OK
- Visión general con figura placeholder arch_general: OK
- Infraestructura y orquestación: tabla servicios Docker + figura placeholder: OK
- Backend: tabla de endpoints (incl. /api/lpmc/compare) + descripción 4 routers: OK
- Frontend: estructura App + MapView, TanStack Query, basemaps: OK
- Pipeline de inferencia modal: diagrama TikZ completo + tabla variables LPMC: OK
  - Unidades duración corregidas a horas (h) en la tabla
  - Diagrama muestra asyncio.gather, build_route_features (s→h), scaler, 3 modelos
- Decisiones técnicas (lazy loading actualizado para 3 modelos): OK
- TODO añadido: refactorizar LPMC_MODEL_VARIANT como parámetro POST en lugar de variable de entorno
- Pendiente: generar figuras arch_general, arch_docker (pipeline_inferencia: HECHO)

## ch5 — Implementación y resultados
- Segunda versión base (19 mayo 2026); §5.1 completamente revisado y pulido (29 mayo 2026)
- Orden secciones: OSRM → OTP → GTFS → Backend → Frontend → ML

### §5.1 OSRM — COMPLETO (revisado 29 mayo 2026)
- §5.1.1: Contexto y selección de OSRM (demoserver solo coche → local)
- §5.1.2: Evolución 3 fases (prototipo remoto, OSRM local, multi-perfil)
- §5.1.3: Preprocesado con datos reales:
  - Tiempos: car ~21s, bike ~35s, foot ~41s, total ~97s
  - Tamaños: car 291MB, bike 911MB, foot 911MB, total 2.1GB
  - Figura Pipeline_Preprocesado_OSRM.pdf disponible en latex/figs/
  - Referenciada como \label{fig:osrm_pipeline}
- §5.1.4: Despliegue y verificación (NUEVO):
  - Explicación contenedores Docker: puerto interno 5000 por nombre, host 5000/5001/5002
  - Bloque curl de verificación de las 3 instancias (\label{cod:osrm_verificacion})
  - Intro polilínea: "formato polilínea, una cadena de texto con la secuencia de coordenadas"
  - Parámetro overview=full mencionado y explicado en caption
  - Figura \label{fig:osrm_rutas}: captura tomada (3 rutas simultáneas), PENDIENTE insertar en LaTeX

### §5.2 OTP — pendiente de revisión (texto base de segunda versión)
  - Selección GTFS (Valencia→Madrid→Toledo/UNAUTO), NAP, UNAUTO, vigencia feed, fecha fija
  - Grafo OTP, integración legs, penalización itinerario walk-only

### §5.3 GTFS — pendiente de revisión (texto base)
  - Capa estática independiente de OTP, 4 endpoints, fix paginación Madrid, coloración hash

### §5.4 Backend — pendiente de revisión (texto base)
  - Estructura modular, asyncio.gather OSRM, router OTP, penalización PT, entorno Docker
  - PENDIENTE: explicación técnica Google Encoded Polyline (con \cite{GooglePolyline}) aquí

### §5.5 Frontend — pendiente de revisión (texto base)
  - React/Vite/TS, marcadores CSS, polilíneas OSRM, legs OTP, 4 basemaps, TanStack Query
  - NOTA: botones de modo ahora toggle (Set<UiMode>), no mutex — actualizar descripción

### §5.6 ML — skeleton
  - Tabla dataset LPMC + tabla variables entrada (tab:lpmc_features) + TODOs
  - Tablas resultados CV y test (placeholders)
  - Bloque preprocesado, hiperparámetros, entrenamiento: pendiente con tutor

## \missingfigure{} pendientes de reemplazar (6 restantes)
- fig:osrm_rutas: captura disponible (3 rutas), PENDIENTE insertar en .tex
- fig:otp_itinerario: pendiente captura
- fig:gtfs_paradas: pendiente captura
- fig:fastapi_docs: pendiente captura
- fig:app_general: pendiente captura
- fig:panel_comparacion: pendiente captura

## Bibliografía ref.bib — entradas añadidas en esta sesión
- @misc{GooglePolyline}: Encoded Polyline Algorithm Format (Google LLC) — para usar en §5.4

## Código ML — comentado (19 mayo 2026)
- lpmc/01_explore.py: docstring de módulo
- lpmc/02_preprocess.py: docstring + comentarios transformaciones
- lpmc/03_train_xgb.py: docstring + comentarios SCALED_FEATURES, GroupKFold, GMPCA
- lpmc/04_train_rf.py: docstring + comentarios DEFAULT_PARAMS, GroupKFold
- lpmc/05_train_dnn.py: docstring + comentarios arquitectura, train_model, predict_proba_torch
- lpmc/06_compare_models.py: docstring completo
- backend/app/services/lpmc_inference.py: docstring módulo + comentarios en todas las funciones

## ch6 — Conclusiones y trabajo futuro
- TODO VACÍO

## Anexos
- Estructura definida: manual despliegue, endpoints API, hiperparámetros, evidencias sprints
- TODO VACÍO

## Ficheros fuera de TFM.tex
- ch6_validacion_resultados_OLD.tex: estructura de validación (métricas, funcional, E2E).
  No integrado. Pendiente decidir si va como capítulo propio o absorbido en ch5/ch6.

## Figuras disponibles
- scrum_tfm_cycle.png: referenciada en ch3, OK
- sprints_timeline.png: referenciada en ch3, OK
- mnl_sigmoid.png: referenciada en ch2, OK
- Pipeline_Preprocesado_OSRM.pdf: referenciada en ch5 §5.1.3 como fig:osrm_pipeline, OK
- ch2_pipeline2.png: disponible, comentada (anotada para ch1)

## Próximo trabajo previsto
1. §5.2 OTP: revisar y pulir sección a sección (próxima sesión)
2. §5.3 GTFS: revisar y pulir
3. §5.4 Backend: revisar + añadir explicación Google Encoded Polyline
4. §5.5 Frontend: revisar + actualizar descripción de botones toggle
5. Insertar captura fig:osrm_rutas para reemplazar \missingfigure{}
6. §5.6 ML: redactar con tutor
7. Subsección dataset LPMC en ch2
8. ch1 contexto/motivación y alcance
9. ch6 conclusiones y trabajo futuro
10. Generar figuras: arch_general, arch_docker

## Límites formales
- Máximo 80 páginas (ch1 → fin conclusiones, sin portada/índices/biblio/anexos)
- Defensa: 20 min exposición + mínimo 10 min preguntas, máximo 60 min total
- Depósito convocatoria ordinaria: 8 julio 2026
- Defensa convocatoria ordinaria: 15–24 julio 2026
