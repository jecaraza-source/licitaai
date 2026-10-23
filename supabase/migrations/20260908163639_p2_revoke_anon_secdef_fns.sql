-- P2 · corrección de seguridad — advisor 0028
-- (anon_security_definer_function_executable).
--
-- Este archivo se comitea después de haberse aplicado ya en producción
-- (por eso reproduce exactamente el SQL ejecutado, versión 20260908163639)
-- para reconciliar el historial de migraciones: la migración se aplicó
-- directo contra producción sin comitear el archivo, lo cual bloqueaba
-- `supabase db push` en despliegues posteriores ("Remote migration
-- versions not found in local migrations directory").

-- 1) REVOKE anon en funciones que solo usa Next.js autenticado (defensa en
--    profundidad: ya exigen auth.uid() IS NOT NULL internamente).
revoke execute on function public.aprobar_resultado_ia(uuid, text) from anon;
revoke execute on function public.cancelar_job(uuid)               from anon;
revoke execute on function public.crear_job(
  text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid
) from anon;

-- 2) cb_estado: sin chequeo de auth y MUTA provider_health. Solo la llaman
--    el job-worker y las Edge Functions de IA vía service_role. Next.js lee
--    public.provider_health directamente por RLS.
revoke execute on function public.cb_estado(text) from anon, authenticated;
grant  execute on function public.cb_estado(text) to service_role;

comment on function public.cb_estado(text) is
  'P2·E2 — estado EFECTIVO del circuit breaker de un proveedor: resuelve '
  'OPEN->HALF_OPEN al vencer abierto_hasta y da de alta la fila de '
  'provider_health si no existe, por eso MUTA. SOLO service_role: la llaman '
  'el job-worker y las Edge Functions de IA via ctx.service '
  '(_shared/circuit-breaker.ts). Next.js lee public.provider_health '
  'directamente por RLS (src/lib/circuit-breaker.ts), no esta RPC. '
  'Revocada de anon/authenticated en 20260914000000.';

-- 3) aceptar_invitacion_staff: la aceptacion real la hace handle_new_user()
--    de forma atomica al crear auth.users (P0, 20260826210000) y debe
--    seguir ahi. Esta RPC se reescribe como verificacion de consistencia
--    idempotente (NO muta), ligada al correo del llamador y tolerante a
--    "sin sesion". Se revoca anon.
create or replace function public.aceptar_invitacion_staff(p_token uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_invite public.invitaciones_staff%rowtype;
  v_user   public.users%rowtype;
begin
  -- Sin sesion (signup con confirmacion de correo pendiente): la vinculacion
  -- ya la hizo handle_new_user() en el signUp. Nada que verificar aun.
  if auth.uid() is null then
    return;
  end if;

  select * into v_invite from public.invitaciones_staff where token = p_token;
  if not found then
    raise exception 'Invitación no encontrada' using errcode = 'P0002';
  end if;

  select * into v_user from public.users where id = auth.uid();
  if not found then
    raise exception 'Cuenta no encontrada' using errcode = 'P0002';
  end if;

  -- La invitacion debe ser para el correo del usuario autenticado.
  if lower(trim(v_invite.email)) is distinct from lower(trim(v_user.email)) then
    raise exception 'La invitación no corresponde a esta cuenta'
      using errcode = '42501';
  end if;

  -- handle_new_user() ya debio consumir la invitacion y colocar al usuario.
  -- Verificacion idempotente de consistencia — sin mutacion.
  if v_invite.aceptada_at is null
     or v_user.organization_id is distinct from v_invite.organization_id
     or v_user.rol_jerarquico  is distinct from v_invite.rol_jerarquico then
    raise exception
      'La invitación no pudo vincularse a la cuenta; pide que te reenvíen una nueva'
      using errcode = 'P0001';
  end if;
end;
$$;

revoke execute on function public.aceptar_invitacion_staff(uuid) from anon;
grant  execute on function public.aceptar_invitacion_staff(uuid) to authenticated, service_role;

comment on function public.aceptar_invitacion_staff(uuid) is
  'Verificación idempotente de consistencia post-signup. La aceptación real '
  '(aceptada_at + organización/rol del usuario) la hace handle_new_user() al '
  'crear auth.users, con token + correo autenticado. Esta RPC NO muta: solo '
  'confirma que la cuenta quedó bien vinculada a la invitación del propio '
  'correo, o lanza. Devuelve sin error si no hay sesión todavía. '
  'Revocada de anon en 20260914000000.';

-- 4) create_organization_for_signup e invitacion_info: SIN cambios de
--    permiso (intencionalmente publicas). Solo se documentan.
comment on function public.create_organization_for_signup(text, text) is
  'INTENCIONALMENTE EJECUTABLE POR anon. Primer paso del registro '
  'self-service: crea la organización + un signup_ticket ANTES de que exista '
  'la cuenta en auth.users, por lo que por definición no hay sesión. '
  'Se autoprotege: lanza si auth.uid() IS NOT NULL, valida el nombre, y '
  'aplica un tope global burdo (<=30 altas / 10 min) como freno anti-spam '
  '— NO sustituye un rate-limit por IP en la capa de Next.js (riesgo '
  'residual documentado en docs/security-p0-hardening.md). handle_new_user() '
  'consume el ticket (used_at/expires_at) de forma atómica al crear el '
  'usuario. Revocar de anon rompería el signup.';

comment on function public.invitacion_info(uuid) is
  'INTENCIONALMENTE EJECUTABLE POR anon. La pantalla /invitacion/[token] la '
  'consulta para mostrar organización y rol ANTES de que el invitado tenga '
  'cuenta (aún no hay sesión). STABLE, solo lectura; no expone más PII que '
  'el correo que ya conoce quien tiene el enlace. Devuelve valido = '
  '(aceptada_at IS NULL AND expires_at > now()). La vinculación real la hace '
  'handle_new_user() con el token + correo autenticado. Revocar de anon '
  'rompería la aceptación de invitaciones.';
