-- P2 · corrección de seguridad — advisor 0028
-- (`anon_security_definer_function_executable`).
--
-- El advisor marcaba 7 funciones SECURITY DEFINER alcanzables por `anon`
-- (sin sesión) vía `/rest/v1/rpc/*`. Revisadas 1×1:
--
--  · aprobar_resultado_ia / cancelar_job / crear_job
--      Exigen `auth.uid() IS NOT NULL` y lanzan 28000 sin sesión, así que
--      `anon` no las explota — pero el grant sobra. Las llama SOLO Next.js
--      con el cliente del usuario (RLS), por lo que `authenticated` y
--      `service_role` conservan EXECUTE. Se revoca `anon` como defensa en
--      profundidad (y para que dejen de aparecer en el advisor).
--
--  · cb_estado
--      NO tiene ningún chequeo de autenticación y MUTA `provider_health`
--      (transición OPEN->HALF_OPEN y alta de la fila al vuelo). Sus únicos
--      llamadores legítimos son el `job-worker` y las Edge Functions que
--      invocan proveedores de IA (analizar-bases, procesar-documento, …),
--      todas mediante una conexión `service_role` (`ctx.service` +
--      `supabase/functions/_shared/circuit-breaker.ts`). Next.js NO la
--      necesita: lee `public.provider_health` directamente por RLS
--      (`src/lib/circuit-breaker.ts::estadoCircuitos`). Se restringe a
--      `service_role` únicamente (revoca `anon` y `authenticated`).
--
--  · aceptar_invitacion_staff
--      Se revoca `anon`/`PUBLIC` (nunca puede satisfacer el check:
--      `auth.uid()` es null) y se corrige un bug (abajo).
--
--  · create_organization_for_signup / invitacion_info
--      INTENCIONALMENTE públicas — parte del registro previo a tener cuenta.
--      Sin cambios de permiso; se documentan con COMMENT ON FUNCTION.
--
-- Supabase concede EXECUTE por defecto a `anon`+`authenticated` (ALTER
-- DEFAULT PRIVILEGES) en toda función nueva de `public`, y `CREATE FUNCTION`
-- concede además a `PUBLIC`. `revoke ... from public` NO quita los grants
-- explícitos a `anon`/`authenticated`, y `revoke ... from anon` NO quita el
-- grant heredado de `PUBLIC` — hay que revocar de ambos (ver la migración
-- que acompaña a esta, `..._public`).
--
-- Rollback:
--   grant execute on function public.aprobar_resultado_ia(uuid, text)          to anon;
--   grant execute on function public.cancelar_job(uuid)                        to anon;
--   grant execute on function public.crear_job(text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid) to anon;
--   grant execute on function public.cb_estado(text)                           to anon, authenticated;
--   grant execute on function public.aceptar_invitacion_staff(uuid)            to anon;
--   -- y restaurar la versión previa de aceptar_invitacion_staff (git show 20260826210000).

-- ---------------------------------------------------------------------------
-- 1) REVOKE anon en las funciones que solo usa Next.js autenticado
-- ---------------------------------------------------------------------------
revoke execute on function public.aprobar_resultado_ia(uuid, text) from anon;
revoke execute on function public.cancelar_job(uuid)               from anon;
revoke execute on function public.crear_job(
  text, text, uuid, jsonb, text, smallint, text, smallint, interval, uuid
) from anon;

-- ---------------------------------------------------------------------------
-- 2) cb_estado -> solo service_role
-- ---------------------------------------------------------------------------
revoke execute on function public.cb_estado(text) from anon, authenticated;
grant  execute on function public.cb_estado(text) to service_role;

comment on function public.cb_estado(text) is
  'P2·E2 — estado EFECTIVO del circuit breaker de un proveedor: resuelve '
  'OPEN->HALF_OPEN al vencer abierto_hasta y da de alta la fila de '
  'provider_health si no existe, por eso MUTA. SOLO service_role: la llaman '
  'el job-worker y las Edge Functions de IA via ctx.service '
  '(_shared/circuit-breaker.ts). Next.js lee public.provider_health '
  'directamente por RLS (src/lib/circuit-breaker.ts), no esta RPC. '
  'Revocada de anon/authenticated en 20260908163639.';

-- ---------------------------------------------------------------------------
-- 3) aceptar_invitacion_staff — revoke anon + corrección
--
-- La aceptación REAL (marcar `aceptada_at` y colocar al usuario en la
-- organización/rol de la invitación) la hace `handle_new_user()` de forma
-- atómica al crear `auth.users`, validando token + correo autenticado
-- (P0, migración 20260826210000). Esa lógica DEBE seguir ahí: es atómica
-- con el alta de la cuenta, funciona con o sin sesión de confirmación de
-- correo, y es un único camino guardado e irrepetible. Mover el UPDATE a
-- esta RPC sería peor (exige sesión viva, es reejecutable y reabre la
-- superficie de privilegio que el P0 cerró).
--
-- Esta RPC se conserva porque la llama la pantalla /invitacion/[token]
-- tras el signUp, pero era una verificación defectuosa:
--   · con confirmación de correo activada NO hay sesión -> `auth.uid()` es
--     null -> lanzaba 'No autenticado' y la UI mostraba "no se pudo vincular
--     la invitación" AUNQUE el trigger ya la había vinculado (falso error).
--   · no comprobaba que la invitación correspondiera al correo del usuario
--     autenticado.
-- Se reescribe como verificación de consistencia idempotente, ligada al
-- correo del llamador y tolerante a "sin sesión". NO muta nada.
-- ---------------------------------------------------------------------------
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
  -- Sin sesión (signup con confirmación de correo pendiente): la vinculación
  -- ya la hizo handle_new_user() en el signUp. Nada que verificar aún y NO
  -- es un error.
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

  -- La invitación debe ser para el correo del usuario autenticado.
  if lower(trim(v_invite.email)) is distinct from lower(trim(v_user.email)) then
    raise exception 'La invitación no corresponde a esta cuenta'
      using errcode = '42501';
  end if;

  -- handle_new_user() ya debió consumir la invitación y colocar al usuario.
  -- Verificación idempotente de consistencia — sin mutación.
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
  'Revocada de anon/PUBLIC en 20260908163639 / 20260908163829.';

-- ---------------------------------------------------------------------------
-- 4) Documentar por qué create_organization_for_signup e invitacion_info
--    SIGUEN siendo ejecutables por anon (sin cambios de permiso)
-- ---------------------------------------------------------------------------
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
