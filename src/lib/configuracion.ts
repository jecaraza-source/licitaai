// Pestañas de Configuración y cuál queda activa según `?tab=`. Lógica pura, sin
// React, para probarla sin navegador. Los valores de `?tab=` son estables: otras
// pantallas pueden enlazar a una pestaña concreta.

export interface PestanaConfiguracion {
  value: string;
  label: string;
  /** Solo ADMIN y MANAGER (la API lo vuelve a comprobar). */
  soloAdminManager?: boolean;
}

export const PESTANAS_CONFIGURACION: readonly PestanaConfiguracion[] = [
  { value: "perfil", label: "Perfil de la empresa" },
  { value: "documentos", label: "Documentos de la empresa" },
  { value: "staff", label: "Staff y cadena de autorización" },
  { value: "ia", label: "IA y valor generado", soloAdminManager: true },
];

export const PESTANA_INICIAL_CONFIGURACION = "perfil";

/** Pestañas que el usuario puede ver según su rol. */
export function pestanasVisibles(veAdminManager: boolean): PestanaConfiguracion[] {
  return PESTANAS_CONFIGURACION.filter((p) => !p.soloAdminManager || veAdminManager);
}

/** Pestaña pedida en `?tab=`; un valor desconocido o no permitido cae en la inicial. */
export function parsePestanaConfiguracion(valor: string | null | undefined, veAdminManager: boolean): string {
  return pestanasVisibles(veAdminManager).some((p) => p.value === valor)
    ? (valor as string)
    : PESTANA_INICIAL_CONFIGURACION;
}

/** Enlace a una pestaña de Configuración (la inicial no lleva parámetro). */
export function hrefConfiguracion(pestana: string): string {
  return pestana === PESTANA_INICIAL_CONFIGURACION ? "/configuracion" : `/configuracion?tab=${pestana}`;
}
