function hexToRgb(hex: string): [number, number, number] {
  const clean = hex.replace("#", "");
  const full = clean.length === 3 ? clean.split("").map((c) => c + c).join("") : clean;
  const num = parseInt(full, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255];
}

function rgbToHex([r, g, b]: [number, number, number]): string {
  return (
    "#" +
    [r, g, b]
      .map((c) => Math.max(0, Math.min(255, Math.round(c))).toString(16).padStart(2, "0"))
      .join("")
  );
}

/** Mezcla `hex` con blanco/negro. `t` en [0,1]: 0 = hex puro, 1 = 100% del color objetivo. */
export function mix(hex: string, target: "white" | "black", t: number): string {
  const [r, g, b] = hexToRgb(hex);
  const goal = target === "white" ? 255 : 0;
  return rgbToHex([r + (goal - r) * t, g + (goal - g) * t, b + (goal - b) * t]);
}

/** Blanco o un gris casi negro, el que dé mejor contraste sobre `hex` (luminancia relativa WCAG). */
export function contrastText(hex: string): string {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  });
  const luminance = 0.2126 * r + 0.7152 * g + 0.0722 * b;
  return luminance > 0.5 ? "#1a1a1a" : "#ffffff";
}

/**
 * CSS que sobreescribe las variables de marca (definidas en globals.css) con
 * los colores de la empresa activa. Pensado para inyectarse como <style> en
 * el layout del panel — el resto de tokens (primary, ring, sidebar-*, charts)
 * ya están definidos en globals.css en función de estas variables.
 */
export function buildCompanyThemeStyle(
  colorPrimario?: string | null,
  colorSecundario?: string | null,
): string | null {
  if (!colorPrimario) return null;

  const primario = colorPrimario;
  const secundario = colorSecundario ?? mix(colorPrimario, "black", 0.35);
  const primarioForeground = contrastText(primario);

  return `:root {
  --brand-primary: ${primario};
  --brand-primary-light: ${mix(primario, "white", 0.55)};
  --brand-secondary: ${secundario};
  --brand-secondary-light: ${mix(secundario, "white", 0.55)};
  --primary-foreground: ${primarioForeground};
  --sidebar-primary-foreground: ${primarioForeground};
  --secondary: ${mix(primario, "white", 0.92)};
  --sidebar-accent: ${mix(primario, "white", 0.92)};
  --accent: ${mix(secundario, "white", 0.9)};
  --accent-foreground: ${secundario};
}`;
}
