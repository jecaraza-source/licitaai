// Funcionalidades que existen en el código pero están apagadas de cara al
// usuario. Cambiar la bandera a `true` vuelve a mostrar sus puntos de entrada.

/**
 * Bandeja de correos de Compras MX (`/correos` y la tarjeta en Seguimiento).
 * En pausa desde 2026-11-09: Compras MX ya filtra lo que envía a cada
 * proveedor y la recepción (dominio `entrada.licitaai.mx` en Resend) nunca se
 * configuró. El webhook y la tabla siguen en el código, sin uso.
 */
export const CORREOS_COMPRAS_MX_ACTIVO = false;
