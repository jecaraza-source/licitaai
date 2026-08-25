import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { docId } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }

  const body = await request.json().catch(() => ({}));

  const { data, error } = await supabase.functions.invoke("analizar-documento-corporativo", {
    body: { documento_id: docId, fecha_emision_manual: body.fecha_emision_manual ?? null },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data: data?.data ?? null });
}
