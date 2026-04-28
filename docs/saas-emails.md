# Conico — Email Funnel & Copy

> Secuencias de email para todo el ciclo de vida del cliente: trial, onboarding, upgrade, recuperación, cobranza, retención.

Última actualización: 2026-04-24. Documentos relacionados: `docs/saas-gtm.md`, `docs/saas-plan.md`.

---

## Convenciones

- **Idioma:** español Chile, tú/te (no usted, no vos).
- **Remitente:** "Julio de Conico" (humano, no `noreply@`).
- **From email:** `julio@conico.cl` (responde a buzón real).
- **Tono:** cercano, breve, útil. Una idea por email.
- **Longitud:** máximo 150 palabras body. CTA único y claro.
- **Mobile-first:** asunto <50 char, preheader <90 char.
- **Sin emojis en asuntos** (salvo casos puntuales A/B).

---

## 1. Welcome Series (al crear cuenta trial)

### Email 1.1 — Bienvenida (T+0, inmediato)

**Asunto:** Bienvenido a Conico, ¿empezamos?
**Preheader:** Tu cuenta está lista. Te tomará 5 minutos emitir tu primera factura.

```
Hola {{nombre}},

Acabas de crear tu cuenta de Conico. Bienvenido.

Tienes 14 días gratis para probar todo, sin tarjeta. La idea es simple:
emitir tu primera factura hoy y ver si Conico te sirve.

→ Entrar a Conico: {{login_url}}

Si tienes preguntas, respondes este mail y te contesto yo (Julio, fundador).

Saludos,
Julio
```

---

### Email 1.2 — Primera factura (T+1 día, si no emitió aún)

**Asunto:** ¿Necesitas ayuda con tu primera factura?
**Preheader:** Te paso un video de 90 segundos para emitirla sin perder tiempo.

```
Hola {{nombre}},

Vi que aún no has emitido tu primera factura en Conico. Tranquilo, es la
parte que más cuesta arrancar.

Te dejé un video de 90 segundos que te muestra exactamente cómo:
→ {{video_url}}

¿Algo te bloquea? Respóndeme este mail y resolvemos juntos.

Julio
```

---

### Email 1.3 — Trae a tu equipo (T+3 días, si emitió 1ra factura)

**Asunto:** Tu equipo también puede usar Conico
**Preheader:** Invita a tu vendedor o admin para que cotice y facture contigo.

```
Hola {{nombre}},

Felicitaciones por emitir tu primera factura. Eso ya es ganancia.

Conico se vuelve mucho más útil cuando tu equipo entra: que tu vendedor
cotice, que tu admin facture, que todos vean lo mismo.

→ Invita a tu equipo (1 click): {{invite_url}}

Tu plan trial incluye {{users_limit}} usuarios. Aprovéchalos.

Julio
```

---

### Email 1.4 — Día 7 check-in (T+7 días)

**Asunto:** Mitad de tu prueba. ¿Cómo va?
**Preheader:** Si algo no te calza, dímelo y lo conversamos.

```
Hola {{nombre}},

Vas a la mitad de tu prueba de Conico. ¿Cómo te ha ido?

Si algo no te está calzando — la interfaz, una feature que falta, algo
que esperabas distinto — dímelo. Respondes este mail y conversamos.

No vendo nada en este mail. Quiero entender si Conico es para ti o no.

Julio
```

---

### Email 1.5 — Día 12 (T+12 días, antes de fin de trial)

**Asunto:** Te quedan 2 días de prueba
**Preheader:** Sigue facturando sin interrupciones eligiendo un plan.

```
Hola {{nombre}},

Tu prueba de Conico termina el {{end_date}}. Para no perder tus datos ni
las facturas que ya emitiste, elige un plan:

→ Ver planes: {{pricing_url}}

Lo que ya hiciste se mantiene intacto cuando pasas a plan pagado. Solo
sigues trabajando.

¿Dudas con qué plan elegir? Respondes este mail y te ayudo.

Julio
```

---

### Email 1.6 — Día 14 (T+14, último día trial)

**Asunto:** Hoy termina tu prueba
**Preheader:** Activa tu plan en 2 minutos para no perder acceso mañana.

```
Hola {{nombre}},

Hoy es el último día de tu prueba. Mañana tu cuenta queda en pausa
(no se borra nada, pero no podrás emitir DTE).

→ Activa un plan en 2 minutos: {{billing_url}}

Si decidiste que Conico no es para ti, te agradezco igual el haber
probado. Si me cuentas por qué (responde este mail), me sirve un montón.

Julio
```

---

## 2. Win-back (trial expiró sin upgrade)

### Email 2.1 — T+3 días post expiración

**Asunto:** ¿Qué te faltó para quedarte?
**Preheader:** No te vendo nada. Solo me sirve saber.

```
Hola {{nombre}},

Tu prueba de Conico terminó hace 3 días y no elegiste un plan.

No es para venderte: quiero entender qué te faltó. Era el precio,
una feature, no era el momento, encontraste otro?

Respondes este mail con lo que sea. Me ayuda a mejorar Conico.

Julio
```

---

### Email 2.2 — T+30 días (oferta retorno)

**Asunto:** Te dejo 30% off si vuelves este mes
**Preheader:** Cupón {{cupon}} válido hasta {{end_date}}.

```
Hola {{nombre}},

Hace un mes probaste Conico. Si quedaste con la duda, te dejo 30% off
por tus primeros 6 meses si activas un plan antes del {{end_date}}.

Cupón: {{cupon}}

→ Activar: {{checkout_url}}

Sin compromiso de continuidad. Si después no te sirve, cancelas.

Julio
```

---

## 3. Upgrade prompts (cliente pagado tocando límites)

### Email 3.1 — Tocó 80% del cupo DTE

**Asunto:** Vas a 80% de tu cupo de DTE este mes
**Preheader:** Te quedan {{remaining_dte}} documentos antes del recargo.

```
Hola {{nombre}},

Llevas {{used_dte}} DTE emitidos este mes. Tu plan {{plan}} incluye
{{plan_dte}}. Cuando los pases, cobramos {{overage_price}} por DTE adicional.

Si vas a seguir creciendo, conviene subir al plan {{next_plan}} que
incluye {{next_plan_dte}} DTE/mes.

→ Ver plan {{next_plan}}: {{upgrade_url}}

¿Dudas? Respondes y revisamos juntos qué te conviene.

Julio
```

---

### Email 3.2 — Llegó al límite de usuarios

**Asunto:** Quieres invitar a alguien más al equipo?
**Preheader:** Tu plan tiene cupo de {{user_limit}}. Súbete y agrega más.

```
Hola {{nombre}},

Vi que intentaste invitar un usuario al equipo y tu plan {{plan}} ya
está en su tope ({{user_limit}} usuarios).

Plan {{next_plan}} te deja agregar hasta {{next_user_limit}} usuarios y
también incluye {{key_feature}}.

→ Comparar planes: {{pricing_url}}

Cualquier duda, responde este mail.

Julio
```

---

### Email 3.3 — 90 días en plan, propuesta upsell

**Asunto:** Llevas 90 días en Conico. ¿Qué viene?
**Preheader:** Veo cómo usas Conico y tengo una sugerencia.

```
Hola {{nombre}},

Cumpliste 90 días con Conico. Felicitaciones.

Mirando cómo usas el sistema, creo que te conviene activar
{{recommended_addon_or_plan}}: {{benefit_short}}.

Sin presión: si te interesa, lo conversamos. Si no, todo sigue igual.

→ Agendar 15 minutos: {{calendar_url}}

Julio
```

---

## 4. Onboarding técnico (post-pago)

### Email 4.1 — Bienvenido oficial (al primer pago)

**Asunto:** Gracias por confiar en Conico
**Preheader:** Te dejo la guía de configuración para sacarle todo.

```
Hola {{nombre}},

Gracias por elegir el plan {{plan}}. Eres oficialmente cliente Conico.

Para sacarle todo, te recomiendo dejar configurado:

1. Tu certificado SII (para emitir DTE oficial)
2. Tu logo y plantilla PDF
3. Importar tus productos (si aún no lo hiciste)
4. Conectar tu contador externo (le mandamos reportes mensuales)

→ Guía paso a paso: {{onboarding_url}}

¿Necesitas ayuda con el SII? Reservas 30 min conmigo: {{calendar_url}}

Julio
```

---

### Email 4.2 — Conecta tu contador (T+5 días)

**Asunto:** Que tu contador reciba tus reportes automáticamente
**Preheader:** Le mandamos un PDF + Excel cada mes sin que tú hagas nada.

```
Hola {{nombre}},

Una de las cosas que mejor recibe nuestros clientes es el "reporte mensual
al contador". Conico le manda automáticamente cada mes:

- Resumen de ventas del mes
- Listado de DTE emitidos (PDF + XML)
- Pagos recibidos
- Excel listo para conciliar

Solo necesitas el email de tu contador.

→ Configurar contador: {{contador_url}}

Julio
```

---

## 5. Cobranza (cliente con pago vencido)

### Email 5.1 — Tarjeta rechazada (T+0)

**Asunto:** No pudimos cobrar tu plan Conico
**Preheader:** Actualiza tu medio de pago para no perder acceso.

```
Hola {{nombre}},

Intentamos cobrar tu suscripción de Conico hoy y la transacción no pasó
({{decline_reason}}).

Reintenamos en 3 días. Mientras tanto puedes actualizar tu medio de pago:

→ Actualizar tarjeta: {{billing_url}}

Si necesitas cambiar de medio (transferencia, otra tarjeta), respondes y
te ayudo.

Julio
```

---

### Email 5.2 — Segundo intento fallido (T+3)

**Asunto:** Segundo cobro rechazado — tu cuenta queda en pausa en 4 días
**Preheader:** Actualiza tu pago para no perder acceso al sistema.

```
Hola {{nombre}},

Hoy reintenté cobrar y volvió a salir rechazado. Si no logramos cobrar
en los próximos 4 días, tu cuenta queda en pausa (los datos no se
borran, pero no podrás emitir DTE).

→ Actualizar tarjeta: {{billing_url}}
→ Cambiar a transferencia: {{transfer_url}}

¿Necesitas un par de días? Respondes y lo coordinamos.

Julio
```

---

### Email 5.3 — Cuenta pausada (T+7)

**Asunto:** Tu cuenta Conico está en pausa
**Preheader:** Reactívala en 1 click cuando estés listo.

```
Hola {{nombre}},

Tu cuenta Conico quedó pausada hoy por pago no recibido. Tus datos están
intactos. Cuando regularices el pago, todo sigue exactamente donde lo
dejaste.

→ Reactivar: {{reactivate_url}}

Si hay un problema mayor (cierre temporal, cambio de empresa), respondes
y vemos qué hacer (pausa extendida, plan menor, etc).

Julio
```

---

## 6. Retención y reactivación

### Email 6.1 — Cliente inactivo 14 días

**Asunto:** Hace dos semanas que no entras a Conico
**Preheader:** ¿Hay algo que podamos mejorar?

```
Hola {{nombre}},

Vi que llevas 14 días sin entrar a Conico. Te quería preguntar si:

a) Cambiaste a otro sistema (cuéntame cuál y por qué)
b) Estás en temporada baja y volverás
c) No es prioridad ahora pero sigues pagando
d) Otra cosa

Cualquier respuesta me sirve. No es para venderte nada.

Julio
```

---

### Email 6.2 — NPS trimestral

**Asunto:** ¿Qué tan probable es que recomiendes Conico?
**Preheader:** Una pregunta. Toma 10 segundos.

```
Hola {{nombre}},

Llevas {{tenure}} con Conico. Una sola pregunta:

Del 0 al 10, ¿qué tan probable es que le recomiendes Conico a un
colega Pyme?

→ Responder (10 segundos): {{nps_url}}

Después, si tienes 30s más, cuéntame qué pondrías mejor.

Julio
```

---

### Email 6.3 — Aniversario 1 año

**Asunto:** Cumples 1 año en Conico
**Preheader:** Gracias. Te dejo un resumen de lo que hiciste con Conico este año.

```
Hola {{nombre}},

Hoy cumples 1 año como cliente Conico. Te dejo el resumen del año:

- DTE emitidos: {{dte_count}}
- Cotizaciones generadas: {{cot_count}}
- Clientes registrados: {{clientes_count}}
- Productos cargados: {{productos_count}}

Gracias por confiar.

Si quieres conversar cómo aprovechar más Conico el próximo año,
reservas 20 minutos: {{calendar_url}}

Julio
```

---

## 7. Plantillas técnicas (transaccionales)

### Email 7.1 — DTE emitido al cliente final
**Asunto:** Tu factura de {{empresa}} (folio {{folio}})

```
Hola {{cliente_nombre}},

Adjunto tu factura electrónica:

- Folio: {{folio}}
- Total: {{total}}
- Fecha: {{fecha}}

PDF y XML adjuntos para tu contabilidad.

Saludos,
{{empresa}}

[Enviado desde Conico]
```

### Email 7.2 — Pago recibido confirmación
**Asunto:** Recibimos tu pago — Folio {{folio}}

```
Hola {{cliente_nombre}},

Confirmamos recepción de tu pago:

- Documento: Factura {{folio}}
- Monto: {{monto}}
- Fecha: {{fecha}}
- Medio: {{medio}}

Gracias.
{{empresa}}
```

### Email 7.3 — Reporte mensual al contador (auto)
**Asunto:** {{empresa}} — Reporte {{mes}} {{año}}

```
Hola {{contador_nombre}},

Adjunto el reporte mensual de {{empresa}} para {{mes}} {{año}}:

- Resumen de ventas (PDF)
- Listado DTE emitidos (XML + PDF)
- Pagos recibidos (Excel)
- Notas de crédito (PDF)

Cualquier duda, contactas directamente a {{empresa}}.

[Enviado automáticamente desde Conico]
```

---

## 8. A/B testing prioridades

| Email | Hipótesis A | Hipótesis B | Métrica decisora |
| --- | --- | --- | --- |
| 1.5 (T+12) | Asunto: "Te quedan 2 días" | Asunto: "Tus facturas se quedan contigo" | CTR a billing |
| 2.2 (Win-back) | 30% off | 1 mes gratis | Activación |
| 3.1 (DTE 80%) | Soft upgrade | Comparativa numérica directa | Upgrade rate |
| 6.2 (NPS) | Fundador firmando | Sin firma de fundador | Response rate |

Ejecutar A/B con muestra mínima 200 envíos antes de decidir.

---

## 9. Métricas por email (objetivos)

| Tipo | Open rate | CTR | Conversión |
| --- | --- | --- | --- |
| Welcome (1.x) | >55% | >25% | n/a |
| Win-back (2.x) | >35% | >10% | >5% reactivar |
| Upgrade (3.x) | >40% | >15% | >8% upgrade |
| Onboarding técnico (4.x) | >50% | >20% | >40% completa setup |
| Cobranza (5.x) | >60% | >30% | >70% recupera pago |
| Retención (6.x) | >40% | >15% | n/a (señal cualitativa) |

---

## 10. Implementación técnica

- Mailchimp/Resend/Postmark para transaccional + Mailchimp/Customer.io para secuencias.
- Trigger por evento del backend Conico → webhook → email service.
- Personalizaciones con merge tags estándar `{{nombre}}`, `{{plan}}`, etc.
- Dominio email: `mail.conico.cl` con DKIM/SPF/DMARC configurado para deliverability.
- Lista de exclusión: clientes que pidieron no recibir marketing (cumplir Ley 19.628).
- Plain-text fallback siempre incluido.
- Test rendering: Litmus o Email on Acid para top 5 clientes (Gmail, Outlook web, Outlook desktop, iOS Mail, Yahoo).
