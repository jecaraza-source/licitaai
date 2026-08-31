import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";

// `/estado` es la página de estado pública (P2 · I6); `/login` y `/register`
// son el flujo de acceso. `/terminos` requiere sesión pero NO redirige a
// dashboard si ya la hay (es un gate propio).
const PUBLIC_PATHS = ["/login", "/register", "/estado"];

// Páginas de contenido legal/informativo: accesibles con o sin sesión, y sin
// redirigir a /dashboard si ya la hay (a diferencia de PUBLIC_PATHS, se
// enlazan también desde pantallas ya autenticadas, p. ej. seleccionar-empresa).
const ALWAYS_ACCESSIBLE_PATHS = ["/aviso-privacidad"];

export async function updateSession(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const { pathname } = request.nextUrl;
  const isPublicPath = PUBLIC_PATHS.some((path) => pathname.startsWith(path));
  const isAlwaysAccessiblePath = ALWAYS_ACCESSIBLE_PATHS.some((path) => pathname.startsWith(path));

  if (isAlwaysAccessiblePath) {
    return response;
  }

  if (!user && !isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    return NextResponse.redirect(url);
  }

  if (user && isPublicPath) {
    const url = request.nextUrl.clone();
    url.pathname = "/dashboard";
    return NextResponse.redirect(url);
  }

  return response;
}
