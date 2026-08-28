-- P2 punch-list B11 — least-privilege: quitar `execute` de `anon` en las
-- 7 funciones de gobierno de costo de IA que no lo necesitan.
--
-- Todas derivan la organización/usuario de `auth.uid()` internamente, así
-- que un `anon` (sin sesión) no obtiene nada útil llamándolas — pero el
-- grant sobra y aparece en el advisor de Supabase
-- (`*_security_definer_function_executable`). `authenticated` y
-- `service_role` conservan el acceso.
--
-- El resto de funciones `SECURITY DEFINER` llamables por `anon`
-- (`create_organization_for_signup`, `invitacion_info`, …) SÍ lo necesitan:
-- son parte del flujo de registro previo a tener sesión. Revisadas 1×1,
-- se dejan.
--
-- Rollback: `grant execute on function ... to anon;` en las 7.

revoke execute on function public.ai_policy_de_org(uuid) from anon;
revoke execute on function public.check_ai_budget(bigint) from anon;
revoke execute on function public.estimar_costo_ia(text, integer, integer) from anon;
revoke execute on function public.liberar_mi_reserva_ia(uuid) from anon;
revoke execute on function public.presupuesto_ia_disponible(uuid) from anon;
revoke execute on function public.registrar_uso_ia(text, text, integer, integer) from anon;
revoke execute on function public.reservar_presupuesto_ia(text, numeric, uuid) from anon;
