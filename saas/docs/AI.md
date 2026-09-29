# Lectura de capturas: preparada, todavía inactiva

`supabase/functions/cna-extract/index.ts` implementa lectura con Anthropic. No está desplegada y la interfaz mantiene `VITE_AI_ENABLED` desactivado.

La revisión automática bloqueó el despliegue porque las capturas privadas de WhatsApp se enviarían a Anthropic sin autorización específica del propietario. No se ha enviado ninguna captura. Obtener esa autorización antes del despliegue o cualquier prueba con datos reales.

Después de la autorización:

1. El propietario guarda `ANTHROPIC_API_KEY` y `CNA_AI_MODEL` en los secretos de Edge Functions de Supabase. Nunca en el chat, repositorio ni variables `VITE_`.
2. Desplegar `cna-extract`, que verifica JWT y pertenencia a `cna_admins`.
3. Probar una captura autorizada y comprobar datos ausentes, nombres ambiguos y rechazo del proveedor. El modelo debe admitir imágenes y estar habilitado en esa cuenta.
4. Activar `VITE_AI_ENABLED=true` en un nuevo build únicamente después de validar el recorrido.

La función descarga el original privado seleccionado y lo envía a la API de Anthropic. Guarda salida, modelo y consumo con un reporte borrador. Los nombres ambiguos quedan sin vincular para revisión manual. La aprobación final sigue siendo una operación administrativa independiente.

Límites actuales: imágenes de hasta 7 MiB, máximo 44 filas de jugadores y 20 intentos/hora por administrador (control de frecuencia no atómico). La cuota no sustituye un límite de gasto del proveedor. No hay evaluación comparativa de precisión entre modelos ni prueba real realizada todavía.

