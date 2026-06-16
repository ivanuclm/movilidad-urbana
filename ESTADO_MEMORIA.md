# Estado de la memoria LaTeX — actualizado 7 junio 2026 (rev6)

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
- Orden secciones: OSRM → OTP → GTFS → Backend → Frontend → ML
- Párrafo introductorio: GitHub URL añadido, código abierto para investigación/extensión/divulgación
- \newpage eliminados (no meter hasta compilación final)

### §5.1 OSRM — COMPLETO y PULIDO (29 mayo + 7 junio 2026)
- §5.1.1: Origen extracto OSM, tabla extractos, reutilización en OTP
- §5.1.2: Evolución 3 fases (Fase 1-3 con negrita)
- §5.1.3: Pipeline preprocesado con datos reales (97s, 2.1GB), figura fig:osrm_pipeline
- §5.1.4: Despliegue y verificación:
  - Puerto interno 5000, nombres Docker Compose, puertos host 5000/5001/5002 "respectivamente"
  - Bloque curl cod:osrm_verificacion
  - Párrafo previo a fig:osrm_rutas con descripción colores (azul/verde/gris)
  - fig:osrm_rutas: \includegraphics{figs/Rutas2_crop.jpeg} INSERTADO
  - Caption acortado: "Rutas OSRM para los tres perfiles de transporte sobre Toledo."

### §5.2 OTP — COMPLETO y PULIDO (7 junio 2026, feedback tutor aplicado)
- §5.2.1: Fuente de datos GTFS y proceso de selección
  - Causalidad correcta: proyecto en CLM → búsqueda en CLM → solo Toledo válida
  - Búsqueda provincia a provincia (Albacete→Guadalajara→Cuenca→Ciudad Real→Toledo)
  - UNAUTO S.L. (Grupo Ruiz) explicado en §5.2.2 (renaming del operador)
  - EMT Madrid como banco de pruebas + fix paginación 500→5000
  - Coste billete: "(de forma que pueda ser fijado por el analista en la simulación)"
  - Valencia eliminada del texto (sin tabla) — fila comentada en tabla OSM
- §5.2.2: Vigencia del feed y fecha fija
  - "Se fijó la hora de consulta a las 12:00 ya que..."
  - "por lo que se adoptaron" (sin repetir consecuencia del problema)
- §5.2.3: Construcción del grafo multimodal
  - Comando Docker con ruta completa f:/TFM/otp-toledo
  - graph.obj no versionado; referencia a anexo
- §5.2.4: Integración de itinerarios
  - Selección itinerario y paginación
  - Geometría polyline decodificada en frontend
  - Problema WALK-only sin negrita; "atributos de transporte público del vector de características"
  - Párrafo previo a fig:otp_itinerario con descripción tramos
  - fig:otp_itinerario: PENDIENTE captura

### §5.3 GTFS — COMPLETO y PULIDO (7 junio 2026)
- §5.3.1: Arquitectura de la capa estática (3 párrafos)
  - Qué es y por qué separada de OTP + ventaja operativa
  - 6 ficheros CSV, pandas en startup, DataFrames en memoria
  - Joins entre ficheros: stops→stop_times→trips→routes; calendar_dates para horarios
  - \cite{GTFSReference} añadido
- §5.3.2: Endpoints disponibles (con rutas HTTP completas)
  - GET /api/gtfs/stops (limit + bounding box opcional)
  - GET /api/gtfs/routes
  - GET /api/gtfs/routes/{route_id}
  - GET /api/gtfs/routes/{route_id}/schedule?date=YYYY-MM-DD
- §5.3.3: Coloración determinista de líneas — NECESITA REESCRITURA (11 jun 2026)
  El .tex actual describe hash polinómico + paleta 16 colores: OBSOLETO.
  No modificar el .tex hasta confirmar con Iván.

  PROPUESTA NUEVO CONTENIDO:
  - Párrafo 1 — Problema del hash: con 16 colores y 25 líneas las colisiones son
    inevitables (problema del cumpleaños: P(colisión) > 99%). Se descarta el hash.
  - Párrafo 2 — Solución: short_names únicos ordenados alfabéticamente → índice i →
    LINE_COLORS[i]. Paleta de 26 colores (todos oscuros suficiente para texto blanco).
    Con 25 líneas y 26 colores: unicidad garantizada.
  - Párrafo 3 — Implementación en React: routeColorMap (Map<string,string>) computado
    al cargarse gtfsRoutesQuery.data. Fallback hash mientras carga. Mapa pasado como
    prop colorMap a MapView para consistencia en chips de parada.
  - lstlisting TypeScript (5 líneas):
      const keys = [...new Set(data.map(r => r.short_name || r.id))].sort();
      keys.forEach((k, i) => map.set(k, LINE_COLORS[i % LINE_COLORS.length]));
  - Párrafo previo a fig:gtfs_paradas describiendo la interfaz NUEVA (acordeón)
  - fig:gtfs_paradas: PENDIENTE captura (acordeón abierto + diagrama de paradas)

### §5.4 Backend — NOTAS DETALLADAS (10 jun 2026, pendiente de redactar)

#### Estructura modular FastAPI
CRITERIO: §5.4 documenta lo que NO está cubierto en §5.1–§5.3. Los routers /api/osrm
y /api/gtfs tienen sus secciones propias (§5.1 y §5.3). El router /api/otp está en §5.2.
§5.4 añade: la visión global de cómo se conectan, el router /api/lpmc que es nuevo, y
la orquestación Docker del conjunto.
- Cuatro routers: /api/osrm (→ §5.1), /api/otp (→ §5.2), /api/gtfs (→ §5.3),
  /api/lpmc (documentar aquí en detalle).
- El frontend nunca llama directamente a OSRM, OTP ni al modelo ML: todo pasa por FastAPI.
  Esto centraliza la lógica de negocio (conversión de unidades, penalización PT) y
  mantiene el frontend agnóstico de los servicios subyacentes. Esta es la decisión de
  arquitectura central del sistema.

#### asyncio.gather para paralelismo
- run_lpmc_inference() y run_lpmc_compare() lanzan en paralelo 4 peticiones HTTP:
  driving a OSRM:5000, cycling a OSRM:5001, foot a OSRM:5002, y OTP:8080.
  Con asyncio.gather(...) se ejecutan concurrentemente, reduciendo la latencia total
  a max(t_driving, t_cycling, t_foot, t_otp) en lugar de la suma.
- Relevante para la UX: sin paralelismo, calcular una predicción tomaría 4× el tiempo
  de una sola petición de enrutado (~400–800ms → ~100–200ms).

#### Google Encoded Polyline — YA CUBIERTO en §5.1.4
- §5.1.4 ya dice: "la geometría en formato polilínea, una cadena de texto con la
  secuencia de coordenadas de la ruta, que el backend decodifica antes de enviarla
  al frontend."
- Solo falta añadir \cite{GooglePolyline} a esa frase. No hace falta más detalle
  técnico en ningún otro sitio. §5.4 no lo repite.

#### Pipeline de inferencia modal — _build_route_features()
- Recibe: dict con resultados OSRM (3 perfiles) + itinerario OTP.
- Extrae 10 variables de ruta:
  - distance: distancia en coche (m) de OSRM driving
  - dur_walking: duración a pie OSRM foot (s→h)
  - dur_cycling: duración bici OSRM cycling (s→h)
  - dur_driving: duración coche OSRM driving (s→h)
  - dur_pt_access: duración primer tramo WALK del itinerario OTP (s→h)
  - dur_pt_bus: suma de tramos BUS del itinerario OTP (s→h)
  - dur_pt_rail: suma de tramos RAIL/SUBWAY/TRAM/METRO/FUNICULAR (s→h)
  - dur_pt_int_waiting: residual entre duración total OTP y suma de tramos (s→h)
  - dur_pt_int_walking: tiempo a pie en intercambios (excluyendo acceso y egreso) (s→h)
  - pt_n_interchanges: max(transit_legs_count - 1, 0)
- CONVERSIÓN DE UNIDADES: OSRM y OTP devuelven segundos; el dataset LPMC usa horas.
  Factor s2h = 1/3600 aplicado a todas las duraciones. Bug detectado y corregido en
  sprint 10 (feb→mar 2026): sin esta conversión, duraciones estaban 3600× infladas.

#### Manejo de walk-only PT — Plan A vs Plan B
- Problema: OTP puede devolver un itinerario compuesto solo de un tramo WALK (no hay
  servicio de bus entre el origen y destino a la hora consultada). En ese caso,
  transit_legs_count == 0 y las features PT valen 0: el modelo interpreta esto como
  "PT instantáneo sin intercambios", asignando probabilidad alta a PT erróneamente.

- Plan A (activo desde 10 jun 2026): en _build_route_features(), si not pt_available,
  se sobrescriben las 6 features PT con valores de penalización extremos:
    _PT_PENALTY_DURATION_H = 10.0 h  (>> máximo real en LPMC, ~2h)
    _PT_PENALTY_INTERCHANGES = 20    (>> máximo real en LPMC, ~5)
  El modelo recibe estos valores como input y asigna ~0% a PT por sus propias reglas,
  sin intervención post-inferencia. Justificación teórica: el viajero "percibe" que PT
  tarda 10h (prácticamente inaccesible), lo que es coherente con la teoría de utilidad
  aleatoria (RUM): si la utilidad de PT es -∞, la alternativa desaparece del conjunto.

- Plan B (salvavidas, comentado): _apply_pt_suppression() fuerza pt=0 post-inferencia
  y renormaliza los otros 3 modos. Comentado en run_lpmc_inference() y run_lpmc_compare().
  Se mantiene en el código para poder reactivarse si Plan A falla.
  JUSTIFICACIÓN TEÓRICA: en elección discreta, eliminar una alternativa del conjunto de
  elección y renormalizar es formalmente correcto (IIA property del MNL).

- Flag pt_available:bool expuesto en model_info de todos los endpoints de inferencia,
  para que el frontend pueda mostrar un aviso al usuario ("no hay bus disponible").

- COMPORTAMIENTO OBSERVADO EMPÍRICAMENTE (10 jun 2026) con ruta walk-only (~180m):
  - XGBoost: PT 0.1–0.3% → Plan A funciona correctamente.
  - RF: PT 9–17% según perfil → penalización parcialmente efectiva. Los árboles de
    decisión tienen hojas fijas: si el training data tenía viajes largos en PT con
    dur_pt_bus alto, la hoja para "dur_pt_bus > umbral_máx" puede tener PT con prob
    razonable. Limitación del enfoque de penalización con RF.
  - DNN: 100% Coche, 0% para todo lo demás → OOD severo. Los valores 10h
    producen z-scores de ~48σ tras el scaler (entrenado con max ~2h). La red neuronal
    no tiene comportamiento garantizado fuera de la distribución de entrenamiento.
    A diferencia de árboles, extrapola de forma no controlada.
  → Este resultado es INTERESANTE para §5.6: ilustra que los modelos basados en árboles
    (XGBoost, RF) son más robustos a inputs OOD que las DNN, resultado coherente con
    la literatura (Goodfellow et al., 2016; referencias de robustez).
  → Pendiente: discutir con el tutor si aplicar Plan B selectivamente para DNN, o
    documentar como limitación y comparativa de robustez entre modelos.

#### Endpoints del router /api/lpmc (únicos nuevos respecto a §5.1–§5.3)
- Los endpoints /api/osrm y /api/gtfs están documentados en §5.1 y §5.3. El router
  /api/otp en §5.2. §5.4 solo detalla /api/lpmc:
- POST /api/lpmc/predict: usa modelo activo (LPMC_MODEL_VARIANT, default xgb).
  Devuelve: probabilities {walk, cycle, pt, drive}, predicted_mode, confidence,
  route_features (las 10 variables, incluyendo penalizadas si walk-only),
  model_info {model_path, scaler_path, pt_available}.
- POST /api/lpmc/compare: ejecuta los 3 modelos (xgb, rf, dnn). For loop, no asyncio:
  los modelos son CPU-bound, no I/O. Devuelve dict[variant → resultado].
- GET /api/lpmc/debug-features: devuelve el vector completo ensamblado por
  _build_feature_frame(), útil para depuración y para verificar la penalización.

#### Entorno Docker — solo lo no cubierto en §5.1 y §5.2
- §5.1.4 ya cubre los puertos OSRM (5000/5001/5002). §5.2.3 cubre el docker run de OTP.
  §5.4 cubre: el docker-compose.yml global como orquestador del conjunto.
- Backend en docker/backend.Dockerfile, puerto 8000.
- Variables de entorno relevantes para LPMC: OSRM_DRIVING_URL, OSRM_CYCLING_URL,
  OSRM_FOOT_URL, OTP_URL (URLs internas Docker), LPMC_MODEL_VARIANT (default: xgb).
- Lazy loading con cache _ARTIFACTS_CACHE: los 3 modelos se cargan en memoria la
  primera vez que se usan. Inicio rápido, primer predict ligeramente más lento.

---

### §5.5 Frontend — NOTAS DETALLADAS (10 jun 2026, pendiente de redactar)

CRITERIO DE SEPARACIÓN: §5.5 documenta decisiones de presentación y UX.
Lo que ya tiene sección propia NO se repite aquí, solo se referencia:
- Rutas OSRM (cálculo y pipeline) → §5.1. En §5.5: solo estilos visuales (colores, grosores).
- Itinerarios OTP (obtención y legs) → §5.2. En §5.5: solo renderizado (WALK vs transit).
- Coloración GTFS (hash + paleta) → §5.3.3. En §5.5: solo referencia cruzada.
- Google Encoded Polyline (formato y cite) → §5.4 (transversal: OSRM y OTP lo usan). En §5.5: no repetir.

#### Stack y estructura
- React 18 + Vite + TypeScript. Componente raíz App.tsx, componente de mapa MapView.tsx.
- React-Leaflet para renderizado del mapa. TanStack Query (useMutation) para peticiones
  al backend con gestión de estado de carga/error.
- Vite como bundler y servidor de desarrollo. HMR habilitado.
  NOTA TÉCNICA: usePolling: true en vite.config.ts. Necesario porque Vite dentro de
  Docker en Windows no recibe eventos inotify del sistema de ficheros del host (volumen
  montado). El polling activo detecta cambios cada ~100ms.

#### Rediseño UI completo (8 jun 2026)
- Arquitectura: sidebar-rail izquierdo fijo (64px de ancho, siempre visible) con 4 iconos.
  Cuando se activa un panel, se superpone al mapa un div de 360px de ancho (no desplaza
  el mapa, flota sobre él como en Google Maps).
- Paneles disponibles (estado activePanel en App.tsx, gestionado con togglePanel()):
  1. Rutas: origen/destino, tabla de modos (distancia/tiempo por perfil), botones de modo,
     Calcular rutas, navegación por itinerarios OTP, detalle de legs.
  2. Red GTFS: selector de línea con búsqueda, visualización de paradas en el mapa,
     horarios por fecha.
  3. Predicción IA: perfiles predefinidos (Commuter/Estudiante/Familiar), formulario
     sociodemográfico, botón Inferir modo, tabla de probabilidades con barras,
     tabla comparativa de 3 modelos.
  4. Capas (en el rail, sin panel expandido): selector de basemap (4 opciones).
- Estilo inspirado en Google Maps: paleta primaria #1a73e8, fondo blanco, sombras
  suaves box-shadow, tipografía Roboto.
- El mapa ocupa el 100% del viewport (position: absolute, fullscreen). Los paneles
  flotan sobre él con z-index.

#### Selección de modos de transporte (no mutex)
- Estado: selectedModes: Set<UiMode>, donde UiMode = "driving" | "cycling" | "foot" | "transit".
- Click normal sobre un botón de modo: selección exclusiva (setSelectedModes(new Set([mode]))).
- Shift+Click: toggle aditivo (añade o quita el modo sin afectar los demás).
- Implementado en handleModeClick(mode: UiMode, e: React.MouseEvent) en App.tsx.
- MapView recibe selectedModes y filtra qué polylines renderizar:
  - OSRM: loop sobre osrmResults, salta si !selectedModes.has(result.profile).
  - OTP: transitSegments solo se pasan si selectedModes.has("transit").
- Las 3 rutas OSRM se calculan siempre (asyncio.gather en el backend), solo varía
  cuáles se pintan. Esto evita esperar al recalcular al cambiar de modo.
- DECISIÓN DE DISEÑO: calcular siempre los 3 perfiles en lugar de solo el activo
  porque (1) es más rápido con paralelismo y (2) permite comparar modos sin espera.

#### Menú contextual clic derecho
- MapInteractionHandler (dentro de MapContainer) escucha evento contextmenu de Leaflet.
  preventDefault + stopPropagation para suprimir el menú nativo del navegador.
- Estado contextMenu: {x, y, lat, lng} | null en MapView.
- El div del menú se renderiza FUERA de MapContainer (en el fragment <>) para evitar
  problemas de z-index con las capas de Leaflet.
- Se cierra con: Escape (listener keydown en window), clic fuera (listener click en
  window), o al seleccionar una opción.
- Opciones: "Establecer como origen" y "Establecer como destino".
- Reemplaza el antiguo ClickHandler que alternaba O/D con clic izquierdo consecutivo.

#### Rutas OSRM en el mapa
- Cada perfil tiene estilo propio (OSRM_PROFILE_STYLES en MapView.tsx):
  - driving: azul #2563eb, grosor 5, sin dashArray
  - cycling: verde #16a34a, grosor 4, sin dashArray
  - foot: gris #4b5563, grosor 3, dashArray "6 6"
- Geometría decodificada en el backend (OSRM devuelve polyline codificada, el backend
  la decodifica y devuelve array de {lat, lon}).

#### Itinerarios OTP en el mapa
- OTP devuelve legs con geometría como Encoded Polyline string. El backend decodifica
  y devuelve transitSegments: [{mode, distance_m, duration_s, geometry: Point[]}].
- En MapView, otpTransitPolylines distingue WALK (gris discontinuo, #4b5563, dashArray "6 6")
  de transit real (naranja, #f97316, grosor 5).
- Solo se renderizan si selectedModes.has("transit").

#### Coloración de líneas GTFS (actualizado 11 jun 2026)
- §5.3.3 se reescribirá con el nuevo mecanismo (índice por orden alfabético,
  paleta LINE_COLORS 26 colores). En §5.5 solo referencia cruzada al igual que antes.
- CRITERIO: §5.3.3 documenta el algoritmo de asignación de color.
  §5.5 documenta cómo se usa en la UI (badge, chip, diagrama de paradas).

#### Panel Red GTFS — rediseño completo (11 jun 2026)
- Estructura del panel: fecha de horarios + checkbox arriba (siempre visibles),
  buscador de línea, lista acordeón.
- Acordeón: agrupa las rutas por short_name (ej. L1 con 3 route_ids aparece como
  un ítem con chevron). Al expandir: sub-lista de route_ids hermanos con borde lateral
  del color de la línea en el activo. Clic en hermano cambia activeRouteId.
- Diagrama de paradas (stop-diagram): columna izquierda con línea vertical coloreada
  (var(--route-color)) y tres tipos de puntos:
    - stop-row__dot--terminal: relleno sólido (primera y última parada)
    - stop-row__dot: hueco con borde (paradas intermedias)
    - stop-row__dot--hl: azul #1a73e8 con halo (parada desde la que se navegó)
  Clic en nombre de parada → setFlyTarget → FlyToHandler → map.flyTo(zoom 17).
- Tabla de horarios: agrupada por hora con groupByHour(). Cada fila: HH | MM MM MM.
  Solo se muestran las horas con servicio. Coloreado alternado por fila.
- highlightedStopId: estado en App.tsx. Se fija al hacer clic en un chip de parada
  en MapView (onSelectTransitRoute ahora recibe (routeId, fromStopId?)). Se limpia al
  abrir manualmente una línea desde el acordeón.
- FlyToHandler: componente dentro de MapContainer que ejecuta map.flyTo() cuando
  flyTarget (Point | null) cambia, y llama onFlyDone() para limpiar el estado.

#### Basemaps disponibles
- light: CartoDB Positron (limpio, sin ruido visual, recomendado)
- color: OpenStreetMap estándar
- relief: OpenTopoMap (relieve topográfico)
- satellite: ESRI World Imagery
- Seleccionado en estado basemap: BasemapMode en App.tsx, persiste mientras dura la sesión.

#### TanStack Query (useMutation)
- osrmMutation, otpMutation, lpmcMutation: cada uno wrappea una petición POST al backend.
- mutationFn llama a fetch() contra /api/osrm/routes, /api/otp/itinerary, /api/lpmc/predict.
- El estado de carga se usa para mostrar spinners o deshabilitar botones.
- NOTA: se usa useMutation (no useQuery) porque las peticiones se lanzan manualmente
  al pulsar "Calcular rutas" / "Inferir modo", no automáticamente al montar el componente.

---

### §5.6 ML — NOTAS DETALLADAS (10 jun 2026, pendiente de redactar con tutor)

#### Dataset LPMC — London Passenger Mode Choice
- Proporcionado por el tutor (Hillel et al., 2018). Dataset de viajes en Londres,
  con variables sociodemográficas y de ruta para 4 modos: walk, cycle, pt, drive.
- household_id: identificador de hogar. NO se usa como feature. Solo para GroupKFold:
  garantiza que viajes del mismo hogar no aparezcan en train y test simultáneamente,
  evitando data leakage por correlación intra-hogar.
- Split temporal: train/test por survey_year. Años más recientes → test set.
  Alternativa considerada: split aleatorio. Se descartó porque el split temporal
  es más realista (el modelo predice comportamiento futuro, no interpolado).
- Variables de entrada: 10 de ruta (derivadas de OSRM+OTP) + variables sociodemográficas
  (edad, género, carnet, coches en hogar, motivo del viaje, tipo de combustible,
  coste del bus, coste del coche).

#### Tres modelos entrenados
- XGBoost (xgb): modelo principal. Gradient boosting sobre árboles de decisión.
  Accuracy ~0.83 train, ~0.73 test. Bici con bajo recall (clase minoritaria).
  Hiperparámetros: pendiente de detallar con tutor.
- Random Forest (rf): ensemble de árboles de decisión con bagging.
  Semilla 481516 para reproducibilidad.
  Accuracy: pendiente métricas definitivas.
- DNN (dnn): red neuronal profunda en PyTorch (TorchModalWrapper).
  Semilla 481516. Arquitectura: pendiente de detallar con tutor.
- GroupKFold aplicado a los 3 modelos con household_id como grupo.
- Endpoints /api/lpmc/predict (modelo activo) y /api/lpmc/compare (los 3).

#### Comparativa empírica — robustez a inputs OOD (walk-only, 10 jun 2026)
Escenario: ruta muy corta (~180-290m) donde OTP devuelve walk-only (transit_legs_count==0).
Con Plan A activo, las features PT se penalizan a 10h antes de la inferencia.

Resultados observados:
- XGBoost: PT 0.1–0.3% (bien). El modelo asigna prob muy baja a PT por sus propias
  reglas aprendidas. Sensible a perfil sociodemográfico: Estudiante (sin coche,
  motivo HBE) → A pie 96.1%; Commuter (con coche, motivo HBW) → A pie ~61%, Coche ~38%.
- RF: PT 9–17% según perfil (moderado). Las hojas de los árboles para
  "dur_pt_bus >> umbral_máximo" heredan la distribución de training, que puede
  contener viajes largos en PT. La penalización es menos efectiva que en XGBoost.
- DNN: 100% Coche, 0% todo lo demás (problemático). Causa: los valores 10h producen
  z-scores ~48σ tras el scaler StandardScaler (entrenado con media ~0.3h, std ~0.2h).
  La red neuronal extrapola fuera de la distribución de entrenamiento de forma
  no controlada. XGBoost y RF son inherentemente más robustos a OOD por su
  estructura de árboles (valores fuera de rango caen en la hoja más extrema,
  cuyo comportamiento está acotado por el training data de esa hoja).

CONCLUSIÓN PARA EL TUTOR:
- La penalización pre-inferencia (Plan A) funciona bien para XGBoost, el modelo principal.
- Para RF: podría aumentarse la penalización (50–100h) o aplicar Plan B post-inferencia.
- Para DNN: Plan B (suprimir pt=0 post-inferencia) sería más robusto, o documentar
  como limitación conocida del uso de DNN con inputs fuera de distribución.
- Esta diferencia de robustez entre árboles y DNN es un resultado empírico interesante
  que se puede discutir en §5.6 y §6 (conclusiones/trabajo futuro).
- PREGUNTA AL TUTOR: ¿documentamos la limitación DNN y proponemos Plan B selectivo
  como trabajo futuro, o lo corregimos ahora?

#### Escala de los modelos en producción
- Los 3 modelos se cargan en memoria al arrancar el backend (lazy loading con cache).
  Primer predict es más lento (carga desde disco), siguientes son inmediatos.
- El scaler (StandardScaler de sklearn) se aplica solo a las features continuas;
  las categóricas (purpose, fueltype) se one-hot encodean.
- household_id nunca se incluye en la petición API. Si el modelo fue entrenado con
  household_id como feature (variantes legacy), se fija a 0.0 para neutralizar su efecto.

#### Perfiles predefinidos en el frontend
El frontend tiene 3 perfiles de usuario predefinidos para facilitar la demostración:
- Commuter: motivo HBW, gasolina, 36 años, masculino, carnet Sí, 1 coche, bus 1.5€, coche 3.5€.
- Estudiante: motivo HBE, promedio, 21 años, femenino, carnet No, 0 coches, bus 0.95€, coche 2.2€.
- Familiar: motivo HBW, promedio, 35 años, masculino, carnet Sí, 1 coche, bus 1.5€, coche 3€.
Estos perfiles ilustran cómo el mismo par O-D produce predicciones distintas según
el perfil sociodemográfico, demostrando la capacidad del modelo de capturar
heterogeneidad entre viajeros.

## \missingfigure{} pendientes de reemplazar (5 restantes)
- fig:osrm_rutas: INSERTADO (Rutas2_crop.jpeg)
- fig:otp_itinerario: pendiente captura (itinerario multimodal + panel lateral con legs)
- fig:gtfs_paradas: pendiente captura (paradas interactivas + popup + detalle línea)
- fig:fastapi_docs: pendiente captura (/docs OpenAPI con 4 grupos de endpoints)
- fig:app_general: pendiente captura (vista general de la aplicación)
- fig:panel_comparacion: pendiente captura (panel comparación 3 modelos)

## Correcciones del tutor (Jun 2026) — REGLAS GLOBALES
1. Toda figura debe citarse (\ref) en el texto ANTES de que aparezca
2. La descripción de la figura va en el párrafo que la cita, NO en el caption
3. El caption debe ser corto y directo (solo título)
4. No usar \newpage hasta compilación final
5. Al listar ítems correspondientes a un orden, añadir "respectivamente"
6. En bullets de endpoints: incluir método HTTP + ruta completa
7. Fórmulas: explicar todos los componentes en prosa, uno a uno
8. Párrafos de tipo "se fijó X a las HH ya que..." en lugar de "las HH se eligieron por..."

## Bibliografía ref.bib — entradas añadidas
- @misc{GooglePolyline}: Encoded Polyline Algorithm Format (Google LLC) — para §5.4
- @misc{GTFSReference}: especificación GTFS — usada en §5.3.1

## Código ML — comentado (19 mayo 2026)
- lpmc/01_explore.py, 02_preprocess.py, 03_train_xgb.py, 04_train_rf.py,
  05_train_dnn.py, 06_compare_models.py: docstrings y comentarios
- backend/app/services/lpmc_inference.py: docstring módulo + comentarios

## ch6 — Conclusiones y trabajo futuro
- TODO VACÍO

## Anexos
- Estructura definida: manual despliegue, endpoints API, hiperparámetros, evidencias sprints
- TODO VACÍO (varios \todo{} en ch5 apuntando aquí)

## Ficheros fuera de TFM.tex
- ch6_validacion_resultados_OLD.tex: estructura de validación.
  No integrado. Pendiente decidir si va como capítulo propio o absorbido en ch5/ch6.

## Figuras disponibles
- scrum_tfm_cycle.png: referenciada en ch3, OK
- sprints_timeline.png: referenciada en ch3, OK
- mnl_sigmoid.png: referenciada en ch2, OK
- Pipeline_Preprocesado_OSRM.pdf: referenciada en §5.1.3 como fig:osrm_pipeline, OK
- Rutas2_crop.jpeg: referenciada en §5.1.4 como fig:osrm_rutas, OK
- ch2_pipeline2.png: disponible, comentada (anotada para ch1)
- fig_pipeline_osrm.svg: disponible en latex/figs/ (pendiente de usar o comentar)

## Sprint 12 — Rediseño panel GTFS y correcciones (11 jun 2026)

### Cambios en el código
- **GTFS — Modelo de datos corregido**: El GTFS de Toledo NO tiene `direction_id` en
  trips.txt. Cada sentido es un route_id distinto con el mismo short_name. El frontend
  agrupa "hermanos" (siblingRouteIds). selectedVariantIndex pasa a ser DERIVADO:
  `Math.max(0, siblingRouteIds.indexOf(selectedTransitRouteId))`. Elimina el estado
  selectedVariantIndex y el useEffect de reset. Clic en chip de parada pasa el
  route_id exacto → sentido correcto sin lógica adicional. (App.tsx)
- **GTFS — Colores únicos**: LINE_COLORS (26 colores) + routeColorMap por índice
  alfabético sobre short_names. Elimina hash como mecanismo principal. colorMap
  pasado a MapView como prop. (App.tsx, MapView.tsx)
- **GTFS — Panel rediseñado completamente**:
  - Acordeón agrupado por short_name (antes: lista plana de route_cards)
  - Líneas con varios route_id muestran chevron + sub-lista con borde lateral coloreado
  - Diagrama de paradas estilo cartel: línea vertical del color de la línea, puntos
    terminales rellenos, intermedios huecos, parada resaltada en azul con halo
  - Tabla de horarios agrupada por hora (columna HH | minutos)
  - Fecha de horarios al inicio del panel, siempre visible
  - flyTarget + FlyToHandler: clic en parada → map.flyTo(stop, 17) (MapView.tsx)
  - highlightedStopId: parada resaltada si la selección viene de chip de popup
  - onSelectTransitRoute ahora recibe (routeId, fromStopId?) (MapView.tsx)
  - interactive: false en CircleMarker de transitRouteStops (fix: bloqueaban clicks)
  (App.tsx, App.css, MapView.tsx)

### Impacto en la memoria
- §5.3.3 queda OBSOLETO en su totalidad. Ver propuesta de nuevo contenido arriba.
- §5.5 necesitará añadir subsección del panel GTFS rediseñado (diagrama de paradas,
  acordeón, flyTo). Ver notas §5.5 actualizadas abajo.
- fig:gtfs_paradas: pendiente captura con la nueva interfaz (acordeón abierto).

---

## Sprint 11 — Mejora de interfaz y correcciones (jun 2026)
Cambios implementados (8 jun 2026):
- **Rediseño UI completo**: sidebar-rail izquierdo (64px, siempre visible) +
  panel expandido (360px, superpuesto al mapa). Tres paneles funcionales:
  Rutas (OSRM+OTP), Red de transporte (GTFS), Predicción modal (LPMC).
  Panel Capas para selector de basemap.
  - Ficheros: App.tsx (return JSX + nuevo estado activePanel), App.css (reescritura completa)
  - Estilo: Google Maps-like, paleta #1a73e8, panel blanco con sombra
- **Menú contextual clic derecho** en el mapa: muestra coordenadas +
  botones "Establecer como origen" / "Establecer como destino".
  Cierra con Escape, clic exterior o selección.
  - Fichero: MapView.tsx (MapInteractionHandler reemplaza ClickHandler)
- **Manejo PT walk-only — Plan A activo (10 jun 2026)**: cuando OTP devuelve
  itinerario sin tramo en tránsito real, las features PT se penalizan con
  valores extremos (_PT_PENALTY_DURATION_H=10h, _PT_PENALTY_INTERCHANGES=20)
  ANTES de la inferencia, para que el modelo asigne ~0% a PT por sí solo.
  Plan B (_apply_pt_suppression, post-inferencia) se mantiene en el código
  con sus llamadas comentadas como salvavidas. Campo pt_available:bool en
  model_info de la respuesta.
  - Fichero: lpmc_inference.py (_build_route_features, _apply_pt_suppression)
- **Paleta GTFS ampliada**: de 7 a 16 colores (ROUTE_COLOR_PALETTE en App.tsx)

Para §5.5 (Frontend) de la memoria: documentar estructura sidebar-rail,
paneles colapsables, menú contextual, mapa fullscreen, integración Leaflet.
Para §5.4 (Backend): documentar Plan A (penalización features PT pre-inferencia)
y Plan B (_apply_pt_suppression, salvavidas comentado).

## Próximo trabajo previsto (UI)
- Clic derecho: ✅ HECHO
- Panel GTFS rediseñado: ✅ HECHO (Sprint 12)
- Colores únicos GTFS: ✅ HECHO (Sprint 12)
- Mejor satellite basemap (probar ESRI Clarity o Mapbox)
- Controles de mapa (zoom) reposicionados
- Botón limpiar rutas

## Próximo trabajo previsto (memoria)
1. PAUSA para completar UI antes de capturas definitivas
   — capturas pendientes: fig:otp_itinerario, fig:gtfs_paradas (nueva UI), fig:fastapi_docs,
     fig:app_general y fig:panel_comparacion
2. **§5.3.3**: reescribir con mecanismo nuevo (índice + LINE_COLORS). PENDIENTE CONFIRMACIÓN.
3. §5.4 Backend: revisar + añadir explicación Google Encoded Polyline
4. §5.5 Frontend: revisar + bloque panel GTFS rediseñado + coloración
5. §5.6 ML: redactar con tutor
6. Subsección dataset LPMC en ch2
7. ch1 contexto/motivación y alcance
8. ch6 conclusiones y trabajo futuro
9. Generar figuras: arch_general, arch_docker

## Límites formales
- Máximo 80 páginas (ch1 → fin conclusiones, sin portada/índices/biblio/anexos)
- Defensa: 20 min exposición + mínimo 10 min preguntas, máximo 60 min total
- Depósito convocatoria ordinaria: 8 julio 2026
- Defensa convocatoria ordinaria: 15–24 julio 2026
