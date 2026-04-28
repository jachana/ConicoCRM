# Conico SaaS — Plan de Comercialización (v2)

> Fase 1 de 3: separación de planes y estrategia de monetización.
>
> **Filosofía v2 (corrección 2026-04-24):** gate por **costo real para Conico**, no por feature. Los features que no representan costo marginal están disponibles en **todos los tiers**; lo que se cobra es lo que escala el costo: usuarios, DTE, inventario, almacenamiento, bodegas, automatizaciones, multi-tenant, jobs pesados, soporte. La simplicidad para Pymes muy pequeñas se resuelve con **toggles de módulos** y **wizard de onboarding**, no escondiendo features detrás de paywall.
>
> Fases siguientes (pendientes de aprobación de este documento):
> - **Fase 2:** plan de precios numérico (CLP, USD, descuentos, comparativa competencia).
> - **Fase 3:** plan go-to-market, landing page, scripts videos promocionales, copy.
>
> Snapshot 2026-04-24. Documentos relacionados: `docs/state-of-product.html`, `docs/backlog.md`, `docs/architecture.md`.

---

## 1. Posicionamiento

**Conico es el software operativo diario de la Pyme chilena que tiene contador externo.** Es para el dueño, el vendedor y el bodeguero. Para emitir documentos (boletas, facturas, NC, ND, guías, OC), ordenar el negocio y mantener control interno. **No es contabilidad** — eso lo sigue haciendo el contador con su software (Softland / Nubox / Defontana / ContaNet).

### Target ideal de cliente
Pyme chilena con:
- 1 a 30 personas
- Vende productos o servicios (B2B, B2C, o mixto)
- **Tiene contador externo** que lleva la contabilidad mensual
- Hoy emite DTE con Bsale / Manager / Nubox facturación / Excel + Word
- Necesita: emitir documentos rápido, controlar clientes, controlar inventario, cotizar bien, ordenar al equipo

### Competencia directa
| Competidor | Foco | Diferencia con Conico |
| --- | --- | --- |
| **Bsale** | POS retail + facturación | Conico es más fuerte en B2B, aprobaciones, CRM serio |
| **Manager.cl** | Facturación Pyme básica | Conico tiene CRM completo, no solo emisor |
| **Nubox (módulo facturación)** | Facturación liviana | Conico tiene inventario serio, OC, pipeline |
| **Haulmer** | Solo emisor SII económico | Conico es producto completo, no solo DTE |

### Quiénes NO son competencia (no apuntamos al mismo nicho)
| | Por qué no |
| --- | --- |
| **Defontana / Softland** | ERP+contabilidad caro y pesado. Apunta a empresas que internalizan contabilidad. |
| **HubSpot / Pipedrive** | CRM puro sin DTE chileno. |
| **Toteat / Bsale POS** | POS de gastronomía/retail con caja física. |

### Diferenciadores defendibles
1. **Flujo Cotización → NV → Factura → Pago** integrado con DTE en una sola pantalla.
2. **Aprobaciones de crédito y márgenes** asíncronas (vendedor propone, admin aprueba) — única en el segmento.
3. **Reportes por marca + filtros multi-cliente** ya productivos.
4. **Búsqueda global Cmd+K**.
5. **Tareas automáticas** que cierran el loop comercial.
6. **Dashboard configurable** por rol con drag-and-drop.
7. **Simplicidad escalable:** Pyme nueva ve sólo lo que necesita; cuando crece, activa módulos.
8. **Reporte mensual al contador automático.** Un click → email al contador con ventas, compras, NC, ND del mes en formato Excel, listo para que él suba a Softland/Nubox/lo que use. Diferenciador único en el segmento.

### Posicionamiento explícito
> **"Tu software. Tu contador sigue con el suyo."**
> Conico maneja la operación diaria; tu contador hace la contabilidad mensual. Cada uno con su herramienta.

---

## 2. Principios de empaquetamiento (v2)

### Eje de cobro: cost-based gating

Cobramos por lo que **a Conico le cuesta entregar**:

| Recurso | Por qué tiene costo marginal |
| --- | --- |
| **Usuarios** | Soporte + auth + sesiones + carga API |
| **DTE folios/mes** | Lioren cobra por documento emitido al SII |
| **SKUs en catálogo** | Storage + índices de búsqueda + sugerencias |
| **Almacenamiento** | PDFs producto, documentos RRHH, XMLs DTE |
| **Bodegas/Sedes** | Cómputo de movimientos por bodega + reportes |
| **Automatizaciones activas** | Celery jobs horarios — escala con datos |
| **Reportes pesados** | Jobs background, agregaciones grandes |
| **Multi-tenant** | Aislamiento, infra dedicada, soporte separado |
| **API calls / webhooks** | Tráfico, rate limits, abuse |
| **Retención de auditoría** | Storage acumulativo |
| **Soporte** | SLA, canales (email/chat/WhatsApp) |

### Eje de UX: feature-toggles (no paywall)

Features de UI con **costo marginal nulo o despreciable** están **disponibles en todos los tiers**, pero **ocultos por defecto** para Pymes que no los usan:

- Pipeline / Oportunidades
- Customer Portal *(capeado por N clientes externos según tier — el cap sí escala costo)*
- Aprobaciones crédito/margen
- Tareas (con reglas auto activables individualmente)
- Plantillas email configurables
- Notas y llamadas registradas
- Timeline unificado por cliente/empresa
- Dashboard configurable
- Cmd+K
- 2FA opcional (Business+ obligatorio)
- Bulk actions
- Importación masiva (capeada por límite de inventario)
- Reportes por marca *(generación interactiva — no cuenta como pesado)*
- Permisos granulares por usuario

**Cómo lo hacemos visible-pero-opcional:**
1. **Wizard de onboarding:** primer login pregunta perfil ("¿qué hace tu negocio?") y activa los módulos pertinentes. Lo demás queda oculto.
2. **`/configuracion` → Módulos:** usuario activa/desactiva módulos individuales. Sidebar refleja la selección.
3. **Modo Simple vs Avanzado:** toggle global — Simple oculta todo no activado; Avanzado muestra todo.
4. **Activación contextual:** si usuario hace click en "Convertir cotización a oportunidad" y Pipeline está oculto, modal "¿Quieres activar Pipeline? Es gratis en tu plan."

---

## 3. Estructura de planes (v2)

### Tabla principal — todos los gates son cost-based (v2 verificada contra margen)

| | **Starter** | **Pro** | **Business** | **Enterprise** |
| --- | --- | --- | --- | --- |
| **Precio mensual (CLP IVA incl)** | **$12.990** | **$34.990** | **$74.990** | **desde $149.990** |
| **Para quién** | Emprendedor / 1 RUT, baja emisión | Pyme operando (3-10 personas) | Pyme con bodegas / equipo comercial | Multi-empresa, alto volumen, integración |
| **Empresas (RUT facturador)** | 1 | 1 | 1 | Multi |
| **Usuarios incluidos** | 1 | 5 | 15 | Ilimitado |
| **SKUs catálogo** | 200 | 5.000 | 50.000 | Ilimitado |
| **Documentos DTE / mes** | 60 (incluido) | 250 (incluido) | **Ilimitado BYOL** | **Ilimitado BYOL** |
| **Modelo DTE** | All-inclusive | All-inclusive | Cliente trae Lioren | Cliente trae Lioren |
| **Bodegas / sedes despacho** | 1 | 2 | 10 | Ilimitado |
| **Almacenamiento (PDFs, docs)** | 2 GB | 20 GB | 100 GB | 1 TB+ |
| **Reglas de automatización activas** | 1 | 6 | 6 + custom | Ilimitado |
| **Reportes pesados (jobs background)** | — | 20 / mes | 200 / mes | Ilimitado |
| **Auditoría — retención** | 30 días | 90 días | 1 año | Personalizado |
| **Customer Portal — clientes externos** | — | 50 | 500 | Ilimitado |
| **API + webhooks** | — | — | 5k calls/día | 100k+ /día |
| **Multi-tenant interno** | — | — | — | Sí |
| **Soporte** | Email 48h | Email + chat 24h | Chat prioritario 8h | SLA + WhatsApp + AM |
| **Margen Conico esperado** | 65% bruto / 30% neto | 56% bruto / 26% neto | 89% bruto / 61% neto | 90% bruto / 65% neto |

### Capacidades (qué módulos están **disponibles** en cada tier)

> Regla v2: si una capacidad no agrega costo material, **está en todos los planes** desactivada por defecto. Lo que diferencia tiers son los **límites duros** de la tabla anterior.

#### Disponible en TODOS los planes (incluido Starter)

Bloque **Comercial** (núcleo del flujo):
- Cotizaciones (PDF, email, validez, descuento por línea, márgenes)
- Notas de Venta (chain locking, sede de despacho, retiro en local)
- Facturas (DTE 33, banco receptor, método pago)
- Notas de Crédito y Débito (DTE 61, 56)
- Pagos múltiples por factura
- Boletas electrónicas DTE 39/41 *(consume del cupo DTE)*
- Guías de despacho electrónica DTE 52 *(consume del cupo DTE)*

Bloque **Maestros**:
- Productos (con marca, IVA configurable, hasta 5 PDFs por producto)
- Listas de precios (Excel/CSV upload, costo stale)
- Clientes (campos CRM)
- Empresas con sedes 1..N
- Proveedores

Bloque **CRM**:
- Pipeline / Oportunidades *(toggle)*
- Timeline unificado por cliente/empresa *(toggle)*
- Notas y llamadas registradas *(toggle)*
- Plantillas email configurables *(toggle)*
- Aprobaciones de crédito y margen *(toggle)*

Bloque **Operación**:
- Órdenes de Compra (PDF, email proveedor)
- Inventario (movimientos, ajustes manuales)
- Trazabilidad por lote / serie *(toggle)*
- Multi-bodega *(capeado por tier)*
- Cobranza (vista, recordatorios manuales)

Bloque **Plataforma**:
- Auth + JWT + 2FA *(opcional Pro, obligatorio Business)*
- Permisos granulares por usuario
- Búsqueda global Cmd+K
- Dashboard configurable (drag-and-drop)
- Reportes interactivos (ventas, top clientes, top productos, por marca, por vendedor)
- Excel export
- Bulk actions
- Importación masiva clientes/empresas/productos *(capeada por límite SKU)*
- Customer Portal *(toggle, capeado por tier)*
- RRHH básico *(toggle)*
- Tareas y recordatorios *(reglas auto capeadas por tier)*

#### Lo único exclusivo de tiers altos (porque sí escala costo)

**Pro y superior** (cuando active uso compute / volumen):
- Reglas de tareas auto-generadoras completas (las 6 reglas Celery)
- Reportes background pesados con scheduling
- Conciliación bancaria *(add-on en Pro, incluida en Business)*
- Comisiones por vendedor automáticas

**Business y superior** (cuando justifica el aislamiento operativo):
- Auditoría retención > 90 días con vista admin avanzada
- API + webhooks salientes
- Reportes financieros (cash flow, P&L básico)
- Importación masiva ilimitada
- Programación de reportes recurrentes
- Notificaciones email digest configurable

**Enterprise exclusivo** (multi-tenant + cumplimiento):
- Multi-tenant interno (varias empresas/RUT en una cuenta, switch en UI)
- SSO Google / Microsoft / SAML
- Recepción / intercambio DTE de proveedores (RCV)
- Libro de compras y ventas electrónico (XML SII)
- Propuesta F29 mensual
- Multi-moneda + UF + tipo de cambio histórico
- Exportación a contabilidad (Defontana / Softland / ContaNet)
- Facturación recurrente / suscripciones
- SLA contractual
- Onboarding dedicado on-site
- Single sign-on con Active Directory

---

## 4. Add-ons (todos los tiers)

Los add-ons son **paquetes de capacidad o features de cost real** que el cliente compra sin cambiar de tier:

| Add-on | Cobro | Disponible desde | Por qué add-on |
| --- | --- | --- | --- |
| Usuarios adicionales | Por usuario / mes | Starter | Costo soporte directo |
| SKU adicionales (pack 1.000) | Pack / mes | Starter | Storage + índices |
| DTE adicionales (overage) | Por documento | Starter | Pass-through Lioren |
| Almacenamiento (pack 10 GB) | Pack / mes | Starter | Storage |
| Bodega adicional | Por bodega / mes | Pro | Cómputo + reportes |
| Customer Portal (cap mayor) | Pack 500 clientes / mes | Pro | Auth + carga |
| Conciliación bancaria | Mensual + por banco | Pro | Compute + parsers |
| Pasarela de pago (Webpay/Mercado Pago/Khipu) | % por transacción | Pro | Revenue share |
| WhatsApp Business para envío | Pack mensual + por mensaje | Pro | Pass-through proveedor |
| API + webhooks (cap mayor) | Mensual fijo | Business | Tráfico |
| Conector contable (Defontana/Softland) | Mensual fijo / conector | Business | Mantenimiento integración |
| Multi-moneda + UF | Mensual fijo | Business | Cómputo histórico |
| Auditoría retención > 1 año | Mensual por GB | Business | Storage acumulativo |
| Migración asistida (one-time) | Cargo único | Cualquiera | Servicio humano |
| Capacitación on-site | Por sesión | Cualquiera | Servicio humano |
| Setup DTE asistido (Lioren + CAF) | One-time | Cualquiera | Servicio especializado |

---

## 5. Mecánicas de monetización

### Modelo principal: suscripción mensual o anual
- **Mensual:** precio base.
- **Anual:** 15-20% descuento (pago adelantado).
- **Bianual (Enterprise):** 25% descuento.

### Usage-based para DTE (controla margen)
- Cada plan incluye un cupo mensual de DTE (factura + boleta + guía + NC + ND).
- Sobre el cupo, cobro por documento (pricing transparente, mostrado en dashboard).
- Cliente puede subir tier o pagar overage. Notificación a 80% de cupo.
- Folios SII (CAF) son del cliente; Conico no resell folios.

### Setup fee opcional
- **Self-service onboarding:** gratis, con wizard + plantillas Excel.
- **Onboarding asistido:** cargo único, incluye migración (productos + clientes desde Excel/competidor), configuración DTE Lioren + certificado, 2 capacitaciones remotas.
- **Onboarding Enterprise:** visita on-site, capacitación grupal, configuración roles, integración contabilidad.

### Risk reversal
- **Trial 14 días sin tarjeta** (Starter o Pro).
- **Garantía 30 días devolución** del primer mes.
- **Sin permanencia** en mensual.
- **Migración out gratuita:** export CSV/Excel de todos los datos + PDFs descargables al cancelar.

### Captura: gancho gratuito "Conico Cotiza"

Plan **gratuito permanente** limitado a:
- 1 usuario
- Hasta 20 cotizaciones / mes
- 50 SKUs, 50 clientes
- **Sin DTE, sin Notas de Venta, sin Facturas**
- Marca de agua "Hecho con Conico" en PDFs

Objetivo: SEO + lead nurturing. Cliente prueba la calidad del editor; sube a Starter cuando necesita facturar.

### Programa de partners
- **Contadores (10-15% recurring):** referencia + onboarding de su cartera.
- **Consultores TI (15-20% primer año):** implementan Pro/Business.
- **Marketplace SII / Lioren:** estar listado como "software DTE".

### Expansión (land & expand)
- Add-ons aumentan MRR sin upgrade.
- Customer success identifica candidates a upgrade (DTE > 80% cupo, users en límite, SKUs en límite).
- Email automático: "Llegaste al 80% del cupo este mes — sube a Pro y recibe X".

---

## 6. Cómo se ve la simplicidad para un cliente Starter

Pyme nueva, dueño solo, vende servicios sin inventario:

1. **Onboarding wizard** pregunta:
   - ¿Tienes inventario físico? **No** → desactiva Inventario, OC, Multi-bodega, Lotes, Listas precios.
   - ¿Tienes equipo de ventas? **No** → desactiva Pipeline, Aprobaciones, Comisiones, Notas/Llamadas.
   - ¿Tus clientes son recurrentes? **No** → desactiva Customer Portal, Timeline.
   - ¿Quieres recordatorios automáticos? **Sí** → activa solo regla "factura vencida".
2. **Sidebar resultante:** Cotizaciones · Notas de Venta · Facturas · Productos · Clientes · Empresas · Reportes (básicos) · Configuración. Nada más.
3. **Dashboard inicial:** template "Cotizador" con 3 widgets (cotizaciones del mes, top clientes, ventas trimestre).

Cuando crece y necesita más, va a `/configuracion → Módulos` y activa lo que necesite. No paga upgrade — si está dentro de los límites de su plan.

---

## 7. Tabla resumen de decisión por plan

| Pregunta | Starter | Pro | Business | Enterprise |
| --- | --- | --- | --- | --- |
| ¿Más de 1 vendedor? | No | Sí | Sí | Sí |
| ¿Más de 200 productos? | No | Sí | Sí | Sí |
| ¿Más de 50 facturas/mes? | No | Sí | Sí | Sí |
| ¿Varias bodegas/sedes? | No | 2 | 10 | Ilim |
| ¿Equipo + automatizaciones avanzadas? | No | Sí | Sí | Sí |
| ¿Conector bancario para conciliación? | — | Add-on | Sí | Sí |
| ¿Reportes financieros (cash flow, P&L)? | No | No | Sí | Sí |
| ¿API para integrar otros sistemas? | No | No | Sí | Sí |
| ¿Más de 1 RUT facturador? | No | No | No | Sí |
| ¿Conector contable? | No | No | Add-on | Sí |
| ¿SSO/SAML, F29, libros SII? | No | No | No | Sí |

---

## 8. Estimación de TAM por tier (Pymes Chile)

Orden de magnitud (cifras SII 2024):
- **Microempresas** (<UF 2.400 ventas/año): ~600 mil. Target Conico Cotiza gratuito → Starter.
- **Pequeñas** (UF 2.400-25.000): ~200 mil. Target Pro **(sweet spot)**.
- **Medianas** (UF 25.000-100.000): ~25 mil. Target Business.
- **Grandes** (>UF 100.000): ~12 mil. Target Enterprise selectivo.

**Sweet spot inicial: Pro.** Volumen suficiente, willingness-to-pay validada por competencia (Bsale/Defontana cobran ahí), churn manejable con tareas auto y aprobaciones.

---

## 9. Riesgos y mitigaciones

| Riesgo | Mitigación |
| --- | --- |
| Cliente Starter sub-utiliza DTE y churn | Free tier "Cotiza" es la entrada real; Starter solo si va a facturar. |
| Cliente Pro pide pipeline / customer portal y se enoja por upgrade | **No se enoja: ya está disponible en Pro**. Solo escala cuando excede cap (clientes externos del portal). |
| Pyme se siente abrumada con 15+ módulos | Wizard onboarding + Modo Simple. Sidebar muestra solo lo activado. |
| DTE Lioren sube precio | Cláusula "ajuste por costos de proveedores SII"; pass-through contractual. |
| Competencia (Bsale, Defontana) baja precios | Diferenciar por aprobaciones + reportes por marca + Cmd+K + simplicidad — feature parity no es la pelea. |
| Pyme no quiere SaaS, quiere on-prem | Plan Enterprise on-prem como opción premium (licencia anual + soporte). |
| Soporte caro escala con clientes | Self-service onboarding + base conocimiento + chatbot tier 1. Soporte humano solo Pro+. |
| Pyme llega al cap de inventario / users / DTE de golpe | Upgrade in-app 1 click; prorrateado al ciclo de cobro. |

---

## 10. Decisiones que necesito de ti antes de Fase 2 (precios)

1. **Cupos de Starter** — ¿50 DTE, 200 SKUs, 1 user es lo justo? Trade-off: muy generoso = canibaliza Pro; muy chico = churn temprano.
2. **Free tier "Cotiza"** — ¿lo activamos como gancho o lo dejamos fuera para no diluir marca?
3. **Pasarela de pago como add-on** — ¿queremos revenue share (% por transacción) o solo un fee fijo?
4. **On-prem para Enterprise** — ¿lo ofrecemos? Aumenta soporte, baja escalabilidad.
5. **Programa de partners contadores** — ¿lo lanzamos en v1 o esperamos product-market fit?
6. **Mercado objetivo inicial** — ¿solo Chile o también Perú/Colombia desde día 1?
7. **Posicionamiento competencia directa** — ¿competir contra Bsale (mismo precio, diferenciar feature) o entrar premium (15-25% más caro, mejor producto y soporte)?
8. **Trial** — ¿14 días sin tarjeta o 30 días con tarjeta? Trade-off lead vs conversion.
9. **Tier Enterprise** — ¿precio público o "Contáctanos"?
10. **Onboarding asistido** — ¿obligatorio en Business+ (más MRR + activación) o opcional?
11. **Configurabilidad de módulos** — ¿el toggle por usuario o por cuenta? Si es por usuario, vendedor puede tener vista distinta a admin.
12. **Modo Simple por defecto** — ¿Pymes nuevas entran en Simple y se les enseña Avanzado, o entran con todo visible?

---

## 11. Trabajo técnico nuevo derivado de esta filosofía

Lo siguiente debe entrar al backlog (`docs/backlog.md`) — son requisitos de la propuesta v2:

- **W2-08 — Módulos toggleables por cuenta.** Tabla `feature_toggles(account_id, module, enabled)`. Sidebar y router consultan toggles. Default por wizard.
- **W2-09 — Wizard de onboarding.** Primera sesión: 6-8 preguntas → activa módulos. Posibilidad de reconfigurar después.
- **W2-10 — Modo Simple vs Avanzado.** Setting global por cuenta; toggle en `/configuracion`.
- **W2-11 — Activación contextual.** Click en feature oculta → modal "¿activar?" — un solo paso.
- **W6-01b (refinamiento) — Caps de plan en runtime.** Hook que valida límites (users, SKUs, DTE, bodegas, jobs) y bloquea con mensaje claro + upgrade prompt.
- **W6-08 — Self-serve billing.** Stripe / Flow / Khipu integrado; downgrade/upgrade self-service; prorrateo.
- **W6-09 — Customer Success dashboard interno.** Vista admin Conico: cuentas cerca de límite, churn risk, candidates a upgrade.

---

## 12. Estado de fases

- **Fase 1 (separación tiers):** ✅ completa. Ver tabla principal y `docs/saas-pricing.md`.
- **Fase 2 (precios):** ✅ completa. Ver `docs/saas-pricing.md` con margen verificado y BYOL adoption risk + planes B-1/B-2/B-3.
- **Fase 3 (GTM + landing + scripts + emails):** ✅ completa. Entregables:
  - **Landing page:** `docs/saas-landing.html` (HTML standalone listo para deploy en `conico.cl`).
  - **Video scripts:** `docs/saas-video-scripts.md` (60s/30s/15s + variantes A/B + opciones producción).
  - **GTM plan:** `docs/saas-gtm.md` (ICP, funnel, KPIs, canales, presupuesto 6 meses, lanzamiento por fases).
  - **Email funnel:** `docs/saas-emails.md` (welcome series, win-back, upgrade, cobranza, retención, transaccional).

## 13. Próximos pasos accionables

1. Deploy landing a `conico.cl` (o subdominio `app.conico.cl` para producto).
2. Producción de 3 videos (opción ligera ~$1.5M CLP, 3 semanas).
3. Setup stack GTM: Google Ads, HubSpot, Mailchimp, Cal.com (ver `docs/saas-gtm.md` §6).
4. Identificar y contactar 20 contadores chilenos para programa "Contador Aliado".
5. Beta cerrada con 5-10 Pymes amigas antes de soft launch público.
6. Implementar multi-tenant técnico (Wave 6 backend, ver `docs/backlog.md`).
7. Implementar billing/Stripe + control de cupos DTE/usuarios/SKUs.
