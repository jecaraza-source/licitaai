-- documentos_corporativos no tenía política de UPDATE: con RLS activa, toda
-- actualización hecha con la sesión del usuario afectaba 0 filas. El
-- PATCH de `.../documentos/[docId]` (confirmar manualmente que un documento
-- corresponde a la empresa, `discrepancia_autorizada`) hacía `.update().single()`
-- y respondía 500 "Error interno" — en staging y en producción.
--
-- Misma regla que insert/delete: solo la organización dueña y roles con
-- escritura (no VIEWER). `with check` impide mover la fila a otra organización.
--
-- Rollback: drop policy "documentos_corporativos_update_own_org" on public.documentos_corporativos;
create policy "documentos_corporativos_update_own_org" on public.documentos_corporativos
  for update
  using (organization_id = public.user_org_id() and public.is_write_role())
  with check (organization_id = public.user_org_id() and public.is_write_role());
