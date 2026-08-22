-- LicitaAI — Sprint 1: Supabase Storage buckets
-- Convención de paths: {organization_id}/{licitacion_id}/{filename}
-- logos-empresa usa: {organization_id}/{filename}

insert into storage.buckets (id, name, public, file_size_limit)
values
  ('documentos-originales', 'documentos-originales', false, 52428800),
  ('propuestas-generadas', 'propuestas-generadas', false, 52428800),
  ('documentos-requeridos', 'documentos-requeridos', false, 52428800),
  ('logos-empresa', 'logos-empresa', true, 5242880)
on conflict (id) do nothing;

-- ============================================================================
-- Policies — buckets privados (documentos-originales, propuestas-generadas, documentos-requeridos)
-- El primer segmento del path debe ser el organization_id del usuario.
-- ============================================================================
do $$
declare
  b text;
  private_buckets text[] := array['documentos-originales', 'propuestas-generadas', 'documentos-requeridos'];
begin
  foreach b in array private_buckets loop
    execute format(
      $p$create policy "%1$s_select_own_org" on storage.objects
        for select using (
          bucket_id = %2$L
          and (storage.foldername(name))[1] = public.user_org_id()::text
        )$p$,
      b, b
    );

    execute format(
      $p$create policy "%1$s_insert_own_org" on storage.objects
        for insert with check (
          bucket_id = %2$L
          and (storage.foldername(name))[1] = public.user_org_id()::text
          and public.is_write_role()
        )$p$,
      b, b
    );

    execute format(
      $p$create policy "%1$s_delete_own_org" on storage.objects
        for delete using (
          bucket_id = %2$L
          and (storage.foldername(name))[1] = public.user_org_id()::text
          and public.is_write_role()
        )$p$,
      b, b
    );
  end loop;
end $$;

-- ============================================================================
-- Policies — logos-empresa (bucket público: lectura abierta, escritura solo org dueña)
-- ============================================================================
create policy "logos_empresa_public_select" on storage.objects
  for select using (bucket_id = 'logos-empresa');

create policy "logos_empresa_insert_own_org" on storage.objects
  for insert with check (
    bucket_id = 'logos-empresa'
    and (storage.foldername(name))[1] = public.user_org_id()::text
    and public.is_write_role()
  );

create policy "logos_empresa_update_own_org" on storage.objects
  for update using (
    bucket_id = 'logos-empresa'
    and (storage.foldername(name))[1] = public.user_org_id()::text
    and public.is_write_role()
  );

create policy "logos_empresa_delete_own_org" on storage.objects
  for delete using (
    bucket_id = 'logos-empresa'
    and (storage.foldername(name))[1] = public.user_org_id()::text
    and public.is_write_role()
  );
