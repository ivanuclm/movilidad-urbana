# Estado de la memoria LaTeX — actualizado 13 abril 2026

## Capítulos

### ch1 — Introducción
- Objetivo general: OK
- Objetivos específicos: OK
- Competencias trabajadas: OK
- Contexto y motivación: VACÍO
- Alcance y limitaciones: VACÍO

### ch2 — Estado del arte y marco tecnológico
- Fundamentos y enfoques: OK
- Datos abiertos (OSM, GTFS): OK
- Tecnologías de enrutado (OSRM, OTP): OK
- Plataformas propietarias (Google Maps, Mapbox, TomTom): OK
- Tabla comparativa de soluciones: OK
- Modelado de elección modal: INICIO escrito (1 párrafo intro),
  resto pendiente. Falta: modelos RUM/MNL, RF, XGBoost, DNN,
  dataset LPMC

### ch3 — Metodología (Scrum)
- SCRUM adaptado a desarrollo unipersonal: OK
- Product Backlog y priorización: OK
- Sprints 1-9 documentados: OK
- Sprint reviews y retrospectivas: comentadas, pendientes de
  descomentar/pulir

### ch4 — Arquitectura y diseño de la solución
- TODO VACÍO (solo headers de sección)
- Pendiente: arquitectura general, diseño backend FastAPI,
  diseño frontend, integración OSRM/OTP/GTFS, contrato API LPMC,
  decisiones técnicas y trade-offs

### ch5 — Implementación y resultados
- TODO VACÍO (solo headers de sección y texto "LPMC" suelto)
- Pendiente: OSRM local, OTP Toledo, backend, frontend,
  GTFS, pipeline LPMC, entrenamiento y evaluación del modelo

### ch6 — Conclusiones y trabajo futuro
- TODO VACÍO

## Capítulos fuera de TFM.tex
- ch6_validacion_resultados_OLD.tex: estructura de validación
  (métricas modelo, validación funcional, E2E). No integrado.
  Pendiente decidir si va como capítulo propio o absorbido en ch5.
- ch7_scrum_OLD.tex: versión anterior de ch3, más detallada en
  Sprint 9 (variante nohh, household_id, LPMC_MODEL_VARIANT).
  Contenido útil ya parcialmente migrado a ch3 actual.

## Figuras disponibles
- scrum_tfm_cycle.png: referenciada y compilando en ch3
- sprints_timeline.png: disponible, pendiente de referenciar
- ch2_pipeline.png y ch2_pipeline2.png: disponibles,
  comentadas en ch2 (la segunda anotada para ch1)
- mnl_sigmoid.png: disponible, pendiente de usar en ch2

## Próximo trabajo previsto
1. Completar sección "Modelado de elección modal" en ch2
   (MNL/RUM, RF, XGBoost, DNN, LPMC)
2. Redactar ch4 completo (arquitectura)
3. Redactar ch5 completo (implementación)
4. Integrar validación (ch6_OLD) en ch5 o como capítulo propio
5. Redactar ch1 contexto/motivación y alcance
6. Redactar ch6 conclusiones