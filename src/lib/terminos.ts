// P2 · I6 — versión vigente de los términos de uso. Al subirla, todos los
// usuarios deben volver a aceptar (el gate compara users.terminos_version).
export const TERMINOS_VERSION = "2026-10-23";
// Historial (qué cambió en cada versión):
//  - 2026-08-27: versión inicial.
//  - 2026-10-23: el punto sobre IA decía que no se envían propuestas económicas
//    a los proveedores, pero partidas y precios sí se envían en el análisis de
//    competitividad, la auditoría del expediente y el estudio de mercado. Ver
//    docs/p2/21-flujo-de-datos-ia.md. Cambio material: exige nueva aceptación.

/** Puntos clave que el usuario acepta. La IA ASISTE — no declara
 * cumplimiento legal definitivo (P2.3). */
export const TERMINOS_PUNTOS = [
  "LicitaAI es una herramienta de apoyo. Los análisis, auditorías y propuestas generados con IA son borradores que requieren revisión y validación por una persona antes de usarse o presentarse.",
  "LicitaAI no declara de forma automática ni definitiva el cumplimiento legal de un documento, requisito o propuesta. La responsabilidad de la participación en un procedimiento de contratación es de la organización usuaria.",
  "LicitaAI utiliza inteligencia artificial. Según la función que uses, el contenido de los documentos que subes, los datos del perfil de tu empresa y las partidas y precios de la propuesta económica se envían a proveedores de IA (Anthropic y OpenAI) para extracción, análisis y generación de texto. No se envían contraseñas ni llaves o certificados de firma electrónica. El detalle está en el aviso de privacidad.",
  "Tratamos tus datos conforme al aviso de privacidad y las políticas de retención publicadas. Puedes solicitar la exportación o el borrado de los datos de tu organización.",
];
