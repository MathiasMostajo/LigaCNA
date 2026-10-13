# Liga CNA · plan de producto

## Recorrido público
Inicio → temporada → posiciones / partidos / jugadores. Historial reúne todas las temporadas y rankings acumulados. Clubes y jugadores mantienen identidad propia a lo largo del tiempo.

## Recorrido administrativo
1. Crear temporada como borrador: nombre, año, puntuación y modo de carga.
2. Registrar clubes y jugadores persistentes; inscribir clubes en cupos y jugadores en plantillas.
3. Registrar reemplazos desde una jornada: el cupo conserva sus puntos; los partidos mantienen al club real.
4. Cargar calendario y reportes de partidos, o resúmenes históricos cuando no existen partidos completos.
5. Revisar y aprobar reportes; publicar la temporada cuando esté lista.
6. Recibir capturas, extraer con IA y revisar el borrador antes de aprobar.

## Reglas de integridad
- Tabla de temporada: suma por cupo, con cadena visible de clubes que lo ocuparon.
- Histórico de clubes: suma por identidad de club, sin puntos heredados duplicados.
- Histórico de jugadores: identidad persistente, estadísticas por partido o resumen de temporada; plantillas con jornadas de inicio/fin.
- Liga regular y eliminatorias se filtran por separado. Los partidos de eliminatorias no dan puntos de liga.
- Una temporada usa partidos o resúmenes, nunca ambos a la vez. Cambiar el modo con datos oficiales está prohibido.
- Los datos desconocidos se muestran como no disponibles, no se inventan. Las métricas incompletas llevan indicación de cobertura.
- Los borradores, evidencias, notas de revisión y salida de IA son privados. Solo datos aprobados y temporadas publicadas son públicos.
- Aprobación atómica en servidor, revisión auditada e idempotente. La IA no puede aprobar.

## Diseño
Interfaz en español. Verde lima, tinta oscura y superficies claras; títulos deportivos, navegación corta, filtros de temporada y fase, tablas legibles en móvil. Estados vacíos explican el siguiente paso. Formularios con etiquetas, validación y confirmación visible.

## Entrega y verificación
Modelo y pruebas de herencia/traspasos → UI pública y administración → revisión de reportes → integración de IA → pruebas desktop/móvil → despliegue. WhatsApp requiere una conexión real de Make y un número de WhatsApp Business; IA requiere un secreto de API del lado servidor. No simular estas conexiones ni cargar estadísticas ficticias en producción.

