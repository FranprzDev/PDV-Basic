# Política de seguridad

## Versiones soportadas

| Versión | Soportada |
|---------|-----------|
| última  | ✅        |

## Reportar una vulnerabilidad

Si encontrás una vulnerabilidad de seguridad en PDV-Basic, **no abras un issue
público**. Usá el **reporte privado de vulnerabilidades de GitHub** (pestaña
*Security* → *Report a vulnerability*) del repositorio.

Incluí:

1. Descripción de la vulnerabilidad
2. Pasos para reproducirla
3. Impacto potencial
4. Fix sugerido (si lo tenés)

Vas a recibir una respuesta acusando recibo dentro de las **72 horas**.

## Alcance

Vulnerabilidades relevantes:

- Bypass de autenticación o de autorización (por ejemplo, ver datos de otro usuario)
- Inyección SQL o exposición de datos
- Fuga de `BETTER_AUTH_SECRET` o de claves/credenciales
- Cross-site scripting (XSS) o CSRF

## Proceso

1. **Acuse**: respuesta dentro de 72h
2. **Triaje**: evaluación de severidad
3. **Fix**: parche en una rama privada
4. **Release**: versión parcheada publicada
5. **Divulgación**: aviso público una vez disponible el fix

> PDV-Basic es un derivado de [FinOpenPOS](https://github.com/JoaoHenriqueBarbosa/FinOpenPOS)
> (MIT). La política de seguridad del proyecto original no aplica a este fork.
