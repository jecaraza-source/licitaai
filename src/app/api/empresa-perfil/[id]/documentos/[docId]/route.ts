import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";

export async function DELETE(
  _request: NextRequest,
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

  const { data: doc } = await supabase
    .from("documentos_corporativos")
    .select("storage_path")
    .eq("id", docId)
    .maybeSingle();

  if (doc) {
    await supabase.storage.from("documentos-corporativos").remove([doc.storage_path]);
  }

  const { error } = await supabase.from("documentos_corporativos").delete().eq("id", docId);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  return NextResponse.json({ ok: true });
}
