import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { checkRateLimit, rateLimitResponse } from "@/lib/rate-limit";

export async function POST(
  _request: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const supabase = await createClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) {
    return NextResponse.json({ error: "No autenticado" }, { status: 401 });
  }
  if (!(await checkRateLimit(supabase, "auditar-todos", 5))) {
    return rateLimitResponse();
  }

  const { data: items } = await supabase
    .from("checklist_items")
    .select("id, documento_id")
    .eq("licitacion_id", id)
    .not("documento_id", "is", null);

  for (const item of items ?? []) {
    await supabase.functions.invoke("auditar-documento", {
      body: { documento_id: item.documento_id, checklist_item_id: item.id },
    });
  }

  const { data, error } = await supabase.functions.invoke("auditar-expediente", {
    body: { licitacion_id: id },
  });

  if (error) {
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  return NextResponse.json({ data });
}
