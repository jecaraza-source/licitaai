-- Aislamiento entre organizaciones: `ai_policy_de_org(p_org)` es SECURITY
-- DEFINER, recibe el uuid de la organización como parámetro y hace
-- `insert ... on conflict do nothing` de una política por defecto. Con
-- `execute` para `authenticated`, cualquier usuario con sesión podía:
--   · leer la política de gasto de IA (cuotas) de CUALQUIER organización
--     pasando su uuid, y
--   · crear filas de `ai_org_policy` para organizaciones que no tenían.
-- Severidad baja (no expone documentos ni PII, solo cuotas), pero rompe el
-- aislamiento.
--
-- Es un helper interno. Sus únicos llamadores en SQL son otras funciones
-- SECURITY DEFINER (`reservar_presupuesto_ia`, `presupuesto_ia_disponible`),
-- que se ejecutan con los privilegios del dueño de la función y no necesitan
-- grant a `authenticated`. Desde la aplicación nadie la invoca por RPC
-- (src/ y supabase/functions/ no la referencian); la UI lee su propia
-- política directo de `ai_org_policy` por RLS (`ai_org_policy_select_own_org`).
-- Los tests de integración la llaman con service_role.
--
-- Queda solo para `service_role`. `anon` ya estaba revocado
-- (20260910000000_p2_b11_revoke_anon).
--
-- Nota: `presupuesto_ia_disponible(p_org uuid)` conserva el mismo patrón
-- (parámetro de organización sin validar contra `user_org_id()`); queda
-- fuera de esta migración.
--
-- Rollback: `grant execute on function public.ai_policy_de_org(uuid) to authenticated;`

revoke execute on function public.ai_policy_de_org(uuid) from public, anon, authenticated;
grant execute on function public.ai_policy_de_org(uuid) to service_role;
