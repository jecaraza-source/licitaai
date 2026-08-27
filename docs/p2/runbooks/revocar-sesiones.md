# Runbook — Revocar sesiones

**Sev:** SEV1 (credenciales comprometidas / cuenta tomada)

## Cuándo

- Se filtró un JWT / refresh token de un usuario.
- Un empleado dejó la empresa y su cuenta sigue activa.
- Actividad sospechosa desde una cuenta (ver [consumo-anormal-ia](consumo-anormal-ia.md)).
- Como parte de la respuesta a una [fuga de datos](fuga-de-datos.md).

## Revocar la sesión de UN usuario

Vía GoTrue admin API (con el service role key):

```bash
# id del usuario
curl -s "$SUPABASE_URL/auth/v1/admin/users?email=usuario@ejemplo.com" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"

# cerrar todas sus sesiones (invalida los refresh tokens)
curl -s -X POST "$SUPABASE_URL/auth/v1/admin/users/<user_id>/logout" \
  -H "apikey: $SUPABASE_SERVICE_ROLE_KEY" -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY"
```

O desde Supabase Studio → Authentication → el usuario → *Sign out user*.

Si además hay que **bloquear el reingreso**: banear/deshabilitar el
usuario (Studio → *Ban user*) o quitarle el perfil:

```sql
-- opción suave: dejarlo sin organización (RLS lo deja sin acceso a datos)
update public.users set organization_id = null where id = '<user_id>';  -- reversible
```

## Revocar TODAS las sesiones (compromiso amplio / rotación de JWT secret)

1. **Rotar el JWT secret** del proyecto Supabase (Studio → Settings → API →
   *Generate new JWT secret*). Esto invalida **todos** los access tokens
   emitidos.
2. Actualizar `SUPABASE_SERVICE_ROLE_KEY` y `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   (cambian al rotar el secret) en Vercel + `supabase secrets` + volver a
   desplegar app y Edge Functions.
3. Comunicar: los usuarios tendrán que volver a iniciar sesión.

> ⚠️ Rotar el JWT secret rompe TODO hasta que las nuevas keys estén
> desplegadas en todas partes. Hacerlo con una ventana de mantenimiento
> salvo emergencia real.

## Verificación

- El usuario/atacante recibe 401 en su siguiente request.
- Nueva actividad sospechosa cesa (revisar logs de Edge Functions / Sentry).

## Seguimiento

- Registrar en el issue de incidente qué se revocó y cuándo.
- Si fue una key/secret filtrada: rotarla y buscar dónde se filtró
  (¿un log?, ¿el repo? — `gitleaks` en CI debería haberlo pillado).
