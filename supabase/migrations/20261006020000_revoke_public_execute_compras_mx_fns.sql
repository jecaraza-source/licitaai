-- Hardening — quitar el `execute` heredado vía PUBLIC en dos funciones.
--
-- 20260906000000_p1_integridad (guardar_propuesta_economica) y
-- 20261006010000_compras_mx_cierre_brechas (la misma función y
-- _checklist_padre_valido) hacían `revoke ... from anon`. No bastaba: en
-- Postgres toda función nace con `execute` para PUBLIC, y `anon` lo hereda
-- de ahí, así que el revoke explícito a `anon` no cambia nada (verificado en
-- staging: `has_function_privilege('anon', ...)` seguía en true). Las
-- funciones bien endurecidas del repo (p. ej. check_ai_budget) no tienen la
-- entrada de PUBLIC en su ACL.
--
-- Impacto previo: bajo — ambas son SECURITY INVOKER y `anon` no tiene
-- políticas RLS de escritura en esas tablas — pero el grant sobra.
--
-- `authenticated` y `service_role` conservan el acceso (se vuelve a
-- otorgar de forma explícita para que la migración sea autocontenida).
-- _checklist_padre_valido es una función de trigger: Postgres comprueba
-- `execute` al crear el trigger, no al dispararlo, así que los triggers
-- existentes no se ven afectados.
--
-- Rollback:
--   grant execute on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) to public;
--   grant execute on function public._checklist_padre_valido() to public;

revoke execute on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) from public, anon;
revoke execute on function public._checklist_padre_valido() from public, anon;

grant execute on function public.guardar_propuesta_economica(uuid, jsonb, jsonb) to authenticated, service_role;
grant execute on function public._checklist_padre_valido() to authenticated, service_role;
