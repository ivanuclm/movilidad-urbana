# Estado de la memoria LaTeX — actualizado 19 mayo 2026 (rev4)

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
- Pendiente: generar figuras arch_general, arch_docker (pipeline_inferencia: HECHO)

## ch5 — Implementación y resultados
- Segunda versión completa (19 mayo 2026), estructura Opción A
- Orden secciones: OSRM → OTP → GTFS → Backend → Frontend → ML (skeleton)
- Tabla 4.3 (tab:lpmc_features) MOVIDA de ch4 a ch5 §5.6.1; ch4 actualizado con referencia conceptual (3 fuentes)
- Secciones escritas y refinadas:
  - §5.1 OSRM: tabla comparativa extractos OSM, evolución 3 fases, pipeline, despliegue+verificación
  - §5.2 OTP: selección GTFS (Valencia→Madrid→Toledo/UNAUTO), NAP, UNAUTO, vigencia feed, fecha fija, grafo, integración legs, penalización itinerario walk-only
  - §5.3 GTFS: capa estática independiente de OTP, 4 endpoints, fix paginación Madrid, coloración hash
  - §5.4 Backend: estructura modular, asyncio.gather OSRM, router OTP, penalización PT (sec propia), entorno Docker
  - §5.5 Frontend: React/Vite/TS, marcadores CSS, polilíneas OSRM, legs OTP (walk/bus diferenciados), 4 basemaps, TanStack Query, 3 perfiles predefinidos
  - §5.6 ML: skeleton con tabla dataset LPMC + tabla variables entrada (tab:lpmc_features) + comentarios TODO + tablas resultados CV y test
- \missingfigure{} colocados: osrm_pipeline, osrm_rutas, otp_itinerario, gtfs_paradas, fastapi_docs, app_general, panel_comparacion (7 figuras pendientes de captura)
- Sección ML interior (preprocesado, hiperparámetros, entrenamiento): placeholders con comentarios detallados para redactar con el tutor
- Citas en uso: GeofabrikDownloads, NAPHome, NAPEMTValencia, NAPEMTMadrid, NAPToledoUrbano, OTPRouteRequest, Hillel2018LPMC, CSLPMC2019, MartinBaos2023Thesis, MartinBaos2023TRC
- Pendiente: capturas de pantalla de la app para reemplazar \missingfigure{}, redacción bloque ML con tutor

## Código ML — comentado (19 mayo 2026)
- lpmc/01_explore.py: docstring de módulo añadido (entradas, salidas, propósito)
- lpmc/02_preprocess.py: docstring + comentarios en transformaciones (purpose, fueltype, mode_map, cols_to_drop, split temporal)
- lpmc/03_train_xgb.py: docstring + comentarios en SCALED_FEATURES, load_best_params (HyperOpt), gmpca_from_proba, scale, GroupKFold rationale, FAST_N_ESTIMATORS, modelo final
- lpmc/04_train_rf.py: docstring + comentarios en DEFAULT_PARAMS (max_depth=None, min_samples_*), GroupKFold, serialización JSON con None
- lpmc/05_train_dnn.py: docstring + comentarios en build_model (BN después de Linear, no antes), train_model (Adam lr/wd, label_smoothing, clip_grad_norm, ReduceLROnPlateau patience=5, early stopping patience=10, best_state clone), predict_proba_torch (eval mode, no_grad), split 10% validación modelo final
- lpmc/06_compare_models.py: docstring completo con prerequisites y workflow; funciones documentadas
- backend/app/services/lpmc_inference.py: docstring de módulo (pipeline, lazy loading, unidades s→h); comentarios en TorchModalWrapper (lazy load, Windows/Linux path normalization), _project_root (depth explicado), _build_route_features (s2h = 1/3600, inter_walk, inter_waiting), _build_feature_frame (household_id legacy neutralizado a 0.0, one-hot encoding), _predict (escalado parcial solo SCALED_FEATURES), run_lpmc_inference (asyncio.gather 4 tareas concurrentes), run_lpmc_compare (FileNotFoundError per variant)

## ch6 — Conclusiones y trabajo futuro
- TODO VACÍO

## Anexos
- Estructura definida: manual despliegue, endpoints API,
  hiperparámetros, evidencias sprints
- TODO VACÍO

## Ficheros fuera de TFM.tex
- ch6_validacion_resultados_OLD.tex: estructura de validación
  (métricas modelo, validación funcional, E2E). No integrado.
  Pendiente decidir si va como capítulo propio o absorbido en ch5.

## Figuras disponibles
- scrum_tfm_cycle.png: referenciada en ch3, OK
- sprints_timeline.png: referenciada en ch3, OK
- mnl_sigmoid.png: referenciada en ch2, OK
- ch2_pipeline2.png: disponible, comentada (anotada para ch1)

## Próximo trabajo previsto
1. Subsección dataset LPMC en ch2 (puede solapar con lo ya escrito en ch5)
2. ch1 contexto/motivación y alcance
3. ch6 conclusiones y trabajo futuro
4. Decidir e integrar validación (ch6_validacion_resultados_OLD.tex)
5. Generar figuras: arch_general, arch_docker (pipeline_inferencia: HECHO)
6. Capturas de pantalla de la app para reemplazar los 7 \missingfigure{} del ch5
7. Redactar §5.6.2 preprocesado, §5.6.3 hiperparámetros, §5.6.4 entrenamiento (con tutor)

## Límites formales
- Máximo 80 páginas (ch1 → fin conclusiones, sin portada/índices/biblio/anexos)
- Defensa: 20 min exposición + mínimo 10 min preguntas, máximo 60 min total
- Depósito convocatoria ordinaria: 8 julio 2026
- Defensa convocatoria ordinaria: 15–24 julio 2026
