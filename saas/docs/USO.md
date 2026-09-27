# Cómo usar Liga CNA

## Dónde entrar

- Público: https://ligacna-saas.vercel.app — tabla, partidos, jugadores e historial.
- Administración: https://ligacna-saas.vercel.app/admin — tu cuenta de administrador existente.
- Capturas: https://ligacna-saas.vercel.app/admin/submissions.

## Armar una temporada

1. En **Temporadas**, crea una temporada. Queda como borrador privado.
2. Elige **partido por partido** si tienes los resultados completos, o **tablas y totales históricos** si solo conservas el resumen final. Una temporada con datos oficiales no puede cambiar de modo.
3. Registra los **Clubes** y **Jugadores**. Reutiliza sus registros en las temporadas siguientes para que sus historiales se acumulen. El ID de EA identifica al jugador; no crees otra persona por un traspaso.
4. En **Cupos y plantillas**, inscribe cada club y luego sus jugadores, indicando la jornada de ingreso.
5. Carga y revisa los datos. Finalmente, vuelve a **Temporadas → Publicar**.

## Resultados y estadísticas

En **Partidos y revisión**, puedes programar encuentros o cargar un resultado. Añade las estadísticas individuales disponibles. Guardar crea un borrador: revisa y pulsa **Aprobar** para actualizar la tabla y los rankings. Una corrección requiere aprobarse de nuevo; mientras tanto sigue vigente el resultado anterior.

Los goles/asistencias individuales no pueden superar el marcador del club. Un jugador debe pertenecer a esa plantilla en la jornada del encuentro. Deja vacíos los datos desconocidos: «—» significa que no se registraron, mientras que cero es un dato real.

## Temporadas de Copa Fácil o Instagram

En una temporada de **totales históricos**, usa **Carga histórica**:

- Carga por club sus victorias, empates, derrotas, goles a favor y en contra.
- Carga por jugador los totales que conserves: goles, asistencias y otros datos disponibles.
- Indica la fuente, por ejemplo un enlace al post o «Copa Fácil, tabla final T3».
- Publica después de comparar los totales con tus fuentes.

No se inventan partidos a partir de una tabla final. Los rankings acumulan únicamente los datos registrados. Los totales históricos corresponden a liga regular; las eliminatorias se registran por partidos y fase.

## Clubes que fueron reemplazados

Un **cupo** es el lugar que ocupa un club en una temporada. Registra el reemplazo desde la jornada en que ocurrió, antes de cargar los partidos posteriores. El nuevo club hereda la tabla del cupo, mientras que cada partido conserva el club que realmente lo jugó.

Ejemplo: A gana dos partidos y B lo reemplaza. La tabla del cupo B empieza con 6 puntos; el historial de A conserva las dos victorias y el de B todavía tiene cero. Para temporadas por totales, ingresa los números propios de A y B separados; no ingreses en B el total heredado completo porque se duplicaría.

Si no conservas la separación entre ambos clubes, primero reconstruye ese reparto desde tus fuentes. El sistema no puede deducir quién ganó esos partidos solo desde el total final.

## Qué falta conectar

La lectura con Claude está desactivada hasta autorizar el envío de capturas a Anthropic, configurar la API y comprobar un caso real. Su salida será un borrador editable; nunca aprobará resultados por sí sola. WhatsApp también necesita configurar Make y el número receptor. Por ahora puedes cargar manualmente los resultados e históricos.

