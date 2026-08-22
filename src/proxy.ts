import type { NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/middleware";

export function proxy(request: NextRequest) {
  return updateSession(request);
}

export const config = {
  // Excluye /api/*: cada API route ya valida su propia sesión (o, para
  // /api/cron/*, un bearer token) y debe responder JSON, no un redirect a
  // /login. Antes de este cambio, cualquier llamada no autenticada a /api/*
  // (como el cron de Vercel) recibía un 307 en vez de llegar al handler.
  matcher: [
    "/((?!api/|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
