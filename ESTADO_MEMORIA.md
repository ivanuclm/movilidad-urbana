# Estado de la memoria LaTeX — actualizado 15 abril 2026 (rev2)

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
- Backend: tabla de endpoints + descripción de los 4 routers: OK
- Frontend: estructura App + MapView, TanStack Query, basemaps: OK
- Pipeline de inferencia modal: figura placeholder + tabla variables LPMC (20 vars): OK
- Decisiones técnicas (6 trade-offs documentados, incl. lazy loading artefactos): OK
- Referencias "Figura/Tabla" unificadas en mayúscula: OK
- Pendiente: generar figuras arch_general, arch_docker, pipeline_inferencia

## ch5 — Implementación y resultados
- TODO VACÍO (solo headers y texto suelto "LPMC")
- Pendiente: OSRM local, OTP Toledo, backend, frontend,
  GTFS, pipeline LPMC, entrenamiento y evaluación del modelo

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
1. ch5 implementación completo
2. Subsección dataset LPMC en ch2
3. Decidir e integrar validación (ch6_OLD)
4. ch1 contexto/motivación y alcance
5. ch6 conclusiones
6. Generar figuras: arch_general, arch_docker, pipeline_inferencia

## Límites formales
- Máximo 80 páginas (ch1 → fin conclusiones, sin portada/índices/biblio/anexos)
- Defensa: 20 min exposición + mínimo 10 min preguntas, máximo 60 min total
- Depósito convocatoria ordinaria: 8 julio 2026
- Defensa convocatoria ordinaria: 15–24 julio 2026