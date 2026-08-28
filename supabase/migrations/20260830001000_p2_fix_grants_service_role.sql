-- P2 · corrección de seguridad — revocar EXECUTE de anon/authenticated en
-- las funciones que deben ser solo del worker (service_role).
--
-- Supabase concede por defecto EXECUTE en toda función nueva del esquema
-- `public` a `anon` y `authenticated` (ALTER DEFAULT PRIVILEGES). Un simple
-- `revoke ... from public` NO quita esos grants explícitos. Sin esta
-- corrección, un usuario autenticado podía llamar directamente a:
--   - reclamar_jobs  -> fuga de jobs (con input_json) de CUALQUIER organización
--   - completar_job / fallar_job / marcar_job_* / reencolar_*  -> manipular
--     jobs ajenos
--   - conciliar_presupuesto_ia / liberar_reserva_ia / registrar_uso_ia_worker
--     -> manipular el ledger de gasto de cualquier organización
--   - persistir_resultado_ia  -> escribir resultados falsos en cualquier org
--   - cb_registrar_fallo  -> abrir el circuit breaker para TODOS (DoS)
--   - metricas_operacion  -> métricas cross-organización
--
-- Las funciones que SÍ deben poder llamar los usuarios (crear_job,
-- cancelar_job, aprobar_resultado_ia, reservar_presupuesto_ia,
-- liberar_mi_reserva_ia, cb_estado, estimar_costo_ia, ai_policy_de_org,
-- presupuesto_ia_disponible) NO se tocan — todas derivan la organización de
-- auth.uid() y son seguras por diseño.
--
-- Rollback: no aplica (endurece permisos; revertir reintroduce el hueco).

do $$
declare
  v_sig text;
  v_firmas text[] := array[
    'public.reclamar_jobs(text, integer)',
    'public.progreso_job(uuid, smallint, text)',
    'public.completar_job(uuid, jsonb, text, text, integer, integer, numeric)',
    'public.fallar_job(uuid, text, text, boolean)',
    'public.reencolar_step_job(uuid, text, jsonb, smallint)',
    'public.expirar_jobs()',
    'public.job_recurso_pertenece(text, uuid, uuid)',
    'public.marcar_job_cancelado(uuid)',
    'public.marcar_job_notificado(uuid)',
    'public.disparar_worker()',
    'public.cron_job_existe(text)',
    'public.tabla_en_realtime(text)',
    'public.registrar_uso_ia_worker(uuid, uuid, text, text, integer, integer)',
    'public._gasto_ia_ventana(uuid, timestamptz)',
    'public.conciliar_presupuesto_ia(uuid, uuid, integer, integer, text)',
    'public.liberar_reserva_ia(uuid, uuid)',
    'public.persistir_resultado_ia(uuid, text, uuid, uuid, text, text, text, text, text, integer, integer, numeric, integer, jsonb, text, boolean, uuid, jsonb, integer)',
    'public.cb_registrar_exito(text)',
    'public.cb_registrar_fallo(text, integer, integer)',
    'public.reencolar_por_espera(uuid, integer)',
    'public.metricas_operacion()'
  ];
begin
  foreach v_sig in array v_firmas loop
    execute format('revoke all on function %s from anon, authenticated', v_sig);
    execute format('grant execute on function %s to service_role', v_sig);
  end loop;
end;
$$;
