-- Corrección de 20260908163639_p2_revoke_anon_secdef_fns:
-- aceptar_invitacion_staff conservaba EXECUTE para PUBLIC (entrada `=X` en
-- proacl, heredada de su CREATE original en 20260825090000), así que
-- `revoke ... from anon` no bastó — `anon` seguía heredando de PUBLIC y el
-- advisor 0028 seguía marcándola. Se revoca de PUBLIC.
--
-- Rollback: grant execute on function public.aceptar_invitacion_staff(uuid) to public;
revoke execute on function public.aceptar_invitacion_staff(uuid) from public;

-- Defensa en profundidad: asegurar que las otras 3 tampoco tengan PUBLIC
-- (hoy no lo tienen; los revokes son no-ops idempotentes).
revoke execute on function public.aprobar_resultado_ia(uuid, text) from public;
revoke execute on function public.cancelar_job(uuid)               from public;
revoke execute on function public.crear_job(
  text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid
) from public;
revoke execute on function public.cb_estado(text) from public;
