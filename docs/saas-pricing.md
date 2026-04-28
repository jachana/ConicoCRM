# Conico SaaS — Fase 2: Precios y Costos (mercado chileno)

> Snapshot 2026-04-24. Documento técnico-comercial para fijar precios + cupos. Pre-requisito: aprobación de `docs/saas-plan.md` v2.
>
> ⚠️ **Las cifras de proveedores externos (Lioren, Bsale, Defontana, Nubox, Manager) son referenciales de mercado público 2024-2025. Confirmar valores actuales con cada proveedor antes de comunicar precios oficiales.**

---

## 1. Boletas, facturas y demás: ¿son todos DTE?

**Sí.** Cualquier documento que se emite al SII en formato electrónico es un DTE (Documento Tributario Electrónico). El sistema chileno usa códigos:

| Código | Tipo | Quién lo usa | ¿Conico lo cubre hoy? |
| --- | --- | --- | --- |
| **33** | Factura electrónica | B2B, ventas afectas | ✅ Productivo |
| **34** | Factura exenta | Servicios exentos de IVA | ⏳ Backlog Wave 3 |
| **39** | Boleta electrónica | B2C ventas afectas | ⏳ Backlog Wave 1 (W1-04) |
| **41** | Boleta exenta | B2C servicios exentos | ⏳ Backlog Wave 1 (W1-04) |
| **43** | Liquidación factura | Comisionistas | No planeado |
| **46** | Factura de compra | Comprador retiene IVA | ⏳ Backlog Wave 3 |
| **52** | Guía de despacho | Traslado mercadería | ⏳ Backlog Wave 1 (W1-05) |
| **56** | Nota de débito | Aumenta deuda | ✅ Productivo |
| **61** | Nota de crédito | Disminuye deuda | ✅ Productivo |
| **110/111/112** | Factura/NC/ND exportación | Exportadores | No planeado v1 |

**Para efectos de pricing: todos consumen del mismo cupo "DTE / mes".** No diferenciamos boleta vs factura en el contador del cliente — simplifica el mensaje.

---

## 2. Costo por unidad para Conico (vía Lioren)

Lioren es el proveedor SaaS de SII que usamos. Su modelo típico (referencial — verificar contrato):

| Plan Lioren | Mensual base aprox | Documentos incluidos | Sobre el cupo |
| --- | --- | --- | --- |
| Emisor básico | ~$9.000 CLP | 100 docs | ~$50/doc |
| Emisor Pyme | ~$19.000 CLP | 500 docs | ~$40/doc |
| Emisor avanzado | ~$39.000 CLP | 2.000 docs | ~$30/doc |
| Volumen (negociado) | desde $79.000 | 10.000+ | ~$15-20/doc |

**Costo blendeado para Conico:** asumir **~$40 CLP por documento** como costo unitario operacional inicial (incluye prorrateo del fee mensual de Lioren amortizado por volumen agregado de toda nuestra base de clientes).

A medida que crezca la base, el costo cae a $20-25 CLP/doc por economía de escala (saltando a planes de mayor volumen Lioren).

**Otros costos marginales por documento:**
- Storage del XML firmado: ~$0,1 CLP (despreciable)
- Email envío PDF: ~$0,5 CLP (SMTP propio o via Mailgun/SendGrid)
- Compute (PDF generation, signing, polling): ~$2-5 CLP
- Soporte prorrateado: ~$10-30 CLP/doc (depende del plan)

**Costo total Conico por DTE: ~$50-80 CLP/doc** (incluyendo overhead operacional).

### Implicancia para pricing
Para tener margen del 60-70% en DTE, debemos cobrar **al menos $130-200 CLP por DTE de overage**. Bsale cobra ~$300 CLP por documento sobre cupo en planes pequeños; Manager cobra similar. Hay espacio competitivo.

---

## 3. Benchmark mercado chileno — competencia directa

Cifras públicas 2024-2025 (mensuales, IVA incluido):

### Bsale (POS + facturación, foco retail/Pyme)
| Plan | Precio aprox | Usuarios | Docs DTE incluidos | Notas |
| --- | --- | --- | --- | --- |
| Emprendedor | $14.990 | 1 | ~50 | Boletas + facturas |
| Pyme | $24.990 | 2 | ~200 | + inventario |
| Pro | $44.990 | 5 | ~500 | + reportes |
| Empresa | $89.990 | 15 | ~2.000 | + multi-sucursal |
| Sobre cupo | ~$200/doc | | | |

### Defontana (ERP completo, foco mediana empresa)
| Plan | Precio aprox | Notas |
| --- | --- | --- |
| Pyme | $39.990 | 2 usuarios |
| Empresarial | $89.990+ | + módulos |
| Total Cloud | $150.000-300.000 | ERP + contabilidad full |
| Por usuario adicional | $19.990-29.990 | |

### Nubox (facturación + contabilidad)
| Plan | Precio aprox | Notas |
| --- | --- | --- |
| Facturación Lite | $12.990 | DTE básico |
| Facturación Pro | $22.990 | + reportes |
| Contabilidad | $34.990 | + libros + F29 |
| Empresarial | $59.990 | full pack |

### Manager.cl
| Plan | Precio aprox | Notas |
| --- | --- | --- |
| Emprendedor | $9.990 | 1 user, cupo bajo |
| Pyme | $19.990 | 2 users |
| Pro | $39.990 | + inventario |
| Plus | $79.990 | multi-sucursal |

### Haulmer
| Plan | Precio aprox | Notas |
| --- | --- | --- |
| Emisor SII | $6.000-12.000 | Solo emisión, sin CRM/inventario |
| Bsale-clone | $19.000-49.000 | full |

### Toteat (POS gastronomía/retail)
| Plan | Precio | Notas |
| --- | --- | --- |
| Punto de venta | $29.990-69.990 | foco POS |

### Conclusiones del benchmark

1. **Floor del mercado:** $9.990-15.000 CLP para emprendedor / 1 usuario.
2. **Sweet spot Pyme:** $19.990-44.990 CLP (Bsale Pyme/Pro, Manager Pyme/Pro, Nubox).
3. **Mediana:** $50.000-90.000 (Empresa Bsale, Pyme Defontana).
4. **Mediana grande:** $90.000-300.000 (Defontana Total, ERPs).
5. **Cupos DTE típicos:** 50 / 200 / 500 / 2.000 (escalado x4 entre tiers).
6. **Overage:** $150-300 CLP/doc.
7. **Por usuario adicional:** $5.000-30.000/mes (depende del tier).

---

## 4. Posicionamiento de Conico

Dos escenarios. Recomiendo el **mixto** (Pro un poco más barato que Bsale Pro, Business equivalente).

### Escenario A — Agresivo (capturar share)
- 10-15% **bajo** Bsale en cada tier.
- Cupos DTE iguales o un poco superiores.
- Apuesta: viralidad + boca a boca + adopción rápida.
- Riesgo: margen bajo en años 1-2; competencia matchea precio.

### Escenario B — Premium (margen mejor producto)
- 15-25% **sobre** Bsale en Pro/Business.
- Justificado por: aprobaciones crédito/margen, reportes por marca, Cmd+K, simplicidad.
- Apuesta: vender valor, no precio.
- Riesgo: ciclo de venta más largo; pierde Pymes muy price-sensitive.

### Escenario C — Recomendado (mixto / "valor honesto")
- Starter **al floor del mercado** (gancho de adquisición).
- Pro **5-10% bajo Bsale Pro** (ofrece más por menos en sweet spot).
- Business **paridad con Empresa Bsale** (justificado por features extra).
- Enterprise **paridad con Defontana mid** (ahorra vs Defontana Total).

---

## 5. Propuesta de precios (Escenario C — recomendado)

### Mensual (precios CLP, IVA incluido) — v2 con margen verificado

| Plan | Mensual | Anual (mes equiv. con 17% off) | Anual total |
| --- | --- | --- | --- |
| **Conico Cotiza (gratis)** | $0 | $0 | $0 |
| **Starter** | $12.990 | $10.790 | $129.490 |
| **Pro** | $34.990 | $29.040 | $348.490 |
| **Business** | $74.990 | $62.240 | $746.890 |
| **Enterprise** | "Contáctanos" desde **$149.990** | desde $124.490 | desde $1.493.890 |

### Cupos finales (verificados contra costo Conico)

| Plan | Users | SKUs | DTE/mes | Modelo DTE | Bodegas | Storage | Reglas auto | Reportes pesados | Customer Portal |
| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |
| Cotiza | 1 | 50 | 0 | Sin DTE | 0 | 100 MB | 0 | 0 | — |
| Starter | 1 | 200 | **60** | All-inclusive | 1 | 2 GB | 1 | 0 | — |
| Pro | 5 | 5.000 | **250** | All-inclusive | 2 | 20 GB | 6 | 20 | 50 |
| Business | 15 | 50.000 | **Ilimitado** | **BYOL** (cliente trae Lioren) | 10 | 100 GB | 6 + custom | 200 | 500 |
| Enterprise | Ilim | Ilim | **Ilimitado** | **BYOL** | Ilim | 1 TB+ | Ilim | Ilim | Ilim |

> **BYOL = Bring Your Own Lioren.** El cliente contrata Lioren (o el proveedor SII que prefiera) directamente. Conico se integra y opera sin asumir costo por documento. Es el estándar en Business+ porque a ese volumen el cliente ya tiene proveedor SII propio.

### Add-ons (precios CLP/mes, IVA incl.)

| Add-on | Precio | Notas |
| --- | --- | --- |
| Usuario adicional | $4.990 | desde Starter |
| Pack 1.000 SKUs | $5.990 | |
| Pack 100 DTE | $9.990 | overage prepago |
| DTE individual sobre cupo | $200/doc | pay-as-you-go |
| Pack 10 GB storage | $3.990 | |
| Bodega adicional | $7.990 | desde Pro |
| Customer Portal +500 clientes | $9.990 | desde Pro |
| Conciliación bancaria (1 banco) | $14.990 | desde Pro |
| Conciliación bancaria (multi-banco) | $24.990 | hasta 3 bancos |
| Pasarela pago Webpay | 1,9% por trans + setup | |
| Pasarela pago Mercado Pago | 1,5% por trans | |
| WhatsApp Business pack 500 msg | $9.990 | |
| API + webhooks (cap mayor) | $29.990 | desde Business |
| Conector contable Defontana | $19.990 | desde Business |
| Conector contable Softland | $19.990 | desde Business |
| Multi-moneda + UF | $9.990 | desde Business |
| **Servicios one-time** | | |
| Onboarding asistido Pro | $99.990 | migración + setup + 2 caps |
| Onboarding Business | $249.990 | + on-site + 4 caps |
| Onboarding Enterprise | $499.990+ | dedicado |
| Setup DTE Lioren + CAF | $39.990 | si cliente no lo tiene |
| Capacitación on-site (4h) | $149.990 | |

---

## 6. Math de margen por plan (cost-check con números v2)

Asumiendo costo Conico de **$50 CLP/DTE** (Lioren retail) + **infra prorrateada** (servidor, email, storage, soporte):

| Plan | Precio mensual | DTE | Costo DTE | Infra prorrateada | Costo total | Margen $ | Margen % |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Starter | $12.990 | 60 | $3.000 | $1.500 | $4.500 | $8.490 | **65%** ✅ |
| Pro | $34.990 | 250 | $12.500 | $3.000 | $15.500 | $19.490 | **56%** ✅ |
| Business | $74.990 | BYOL ($0) | $0 | $8.000 | $8.000 | $66.990 | **89%** ✅ |
| Enterprise | $149.990+ | BYOL ($0) | $0 | $15.000 | $15.000 | $134.990 | **90%** ✅ |

**Sin pérdidas.** Ningún plan al uso máximo deja a Conico en negativo. Cada tier tiene margen >55%.

### Por qué BYOL en Business+

A 500 DTE/mes (volumen típico Business), Conico estaría asumiendo $25.000/mes en costo Lioren. Si el cliente sube a 2.000 DTE, costo escala a $100.000/mes — un cliente solo destruye el margen.

**BYOL = el cliente contrata Lioren directo.** El cliente Business típico **ya tiene** proveedor SII (porque hoy ya factura con Bsale, Manager o un emisor SII). Cambiar a Conico es cambiar el CRM/operación, no el emisor.

Pricing transparente:
- "Conico Business: $74.990/mes. Tu plan Lioren va aparte (~$19-39k/mes según volumen)."
- O paquete combinado: "Conico Business + Lioren incluido: $99.990/mes" (Conico paga Lioren a tarifa volumen y aplica margen).

### Cómo proteger margen en Starter/Pro (overage agresivo)

- Cliente cerca del cupo recibe alerta a 80%.
- Sobre el cupo: **$200 CLP/doc** (4× costo Conico → margen 75% en overage).
- Notificación in-app: "Excediste tu cupo. Paga overage o sube a Pro y ahorra".

### Costo adicional a considerar (no contemplado arriba)

- **Adquisición** (CAC): para que el LTV/CAC funcione necesitamos retención >12 meses + CAC < 3× MRR mensual. Esto se valida en Fase 3.
- **Soporte humano:** un agente atiende 100-200 cuentas. Cada plan asume canal distinto (email Starter, chat Pro, prioritario Business+).
- **Overhead corporativo** (legal, contabilidad de Conico mismo, marketing): suele ser 15-25% adicional sobre costo de servicio. No incluido en el margen bruto arriba; el margen bruto debe cubrirlo.

### Margen real esperado por plan (incluyendo CAC + overhead corporativo)

| Plan | Margen bruto | – CAC amortizado* | – Overhead 20% | **Margen neto** |
| --- | --- | --- | --- | --- |
| Starter | 65% | -15% | -20% | **30%** |
| Pro | 56% | -10% | -20% | **26%** |
| Business | 89% | -8% | -20% | **61%** |
| Enterprise | 90% | -5% | -20% | **65%** |

*CAC amortizado asumiendo retención 24 meses promedio.

**Conclusión:** Starter y Pro tienen margen neto modesto (típico Pyme SaaS) pero positivo. Business y Enterprise son las cash cows.

---

## 7. Modelo DTE final

| Plan | Modelo DTE | Cupo | Overage |
| --- | --- | --- | --- |
| Cotiza | Sin DTE | — | — |
| Starter | All-inclusive | 60 docs/mes | $200/doc |
| Pro | All-inclusive | 250 docs/mes | $200/doc |
| Business | **BYOL** (cliente trae Lioren) | Ilimitado | — |
| Enterprise | **BYOL** | Ilimitado | — |

### Ofertas de transición para evitar fricción BYOL en Business

- **Combinado "Conico + Lioren":** Conico revende Lioren al cliente Business como add-on optativo. $24.990-49.990/mes según volumen. Margen Conico 15-25% en el revendido.
- **Setup Lioren asistido:** $39.990 one-time si el cliente no tiene proveedor SII. Incluye certificado digital + onboarding Lioren + integración Conico.
- **Migración desde otro proveedor SII:** gratis (tomamos los CAF y configuramos).

### Riesgo de adopción BYOL

⚠️ **Hipótesis no validada:** asumimos que cliente Business "ya tiene Lioren" o no le importa contratarlo. En la realidad puede haber resistencia: "yo quiero un solo proveedor, una sola factura, un solo soporte". Si BYOL frena conversión, hay tres planes B:

**Plan B-1 — Combo "todo incluido" como default visible:**
- En la landing y onboarding, el plan Business muestra precio "todo incluido" ($99.990 con Lioren incluido, no BYOL).
- BYOL queda como opción avanzada para quienes ya tienen Lioren ("ya soy cliente Lioren" → descuento $24.990).
- Margen Conico baja a ~25% bruto en Business (igual que Pro), pero la conversión sube.

**Plan B-2 — Cupo Business all-inclusive con tope alto:**
- Business: 800 DTE incluidos all-inclusive a $89.990 (en vez de BYOL).
- Sobre 800: $150/doc.
- Margen al máximo uso: $89.990 - (800 × $50) - $8.000 = $41.990 = **47%**. Aceptable.
- Bajo este escenario subimos precio Business de $74.990 a $89.990.

**Plan B-3 — Negociar Lioren a tarifa volumen agresiva:**
- A 5.000+ DTE/mes agregados Conico negocia $20-25/doc.
- Con $20/doc costo, 2.000 DTE = $40k → Business $89.990 deja $50k margen = **55%**.
- Plan factible una vez que tengamos 50+ clientes. Mientras tanto Plan B-1 o B-2.

**Decisión final pendiente para Fase 3:** validar con 5-10 entrevistas a Pymes target qué tan abiertos están a BYOL. Mientras tanto **landing v1 muestra Plan B-1 (combo todo incluido visible) con BYOL como opción de power user**.

---

## 8. Comparativa final con competencia directa (precios CLP/mes)

> Ya no comparamos contra Defontana/Softland — esos no son nuestro target (apuntan a empresas que internalizan contabilidad). Conico es para Pymes con contador externo.

| | **Conico Starter** | Bsale Emprendedor | Manager Emprendedor | Nubox Facturación Lite |
| --- | --- | --- | --- | --- |
| Precio | $12.990 | $14.990 | $9.990 | $12.990 |
| Users | 1 | 1 | 1 | 1 |
| DTE incluidos | 60 | ~50 | ~50 | ~100 |
| Inventario | ✅ básico | ❌ | ❌ | ❌ |
| CRM (clientes + empresas) | ✅ | ❌ | parcial | parcial |
| Cmd+K | ✅ | ❌ | ❌ | ❌ |
| Reporte mensual al contador | ✅ | ❌ | ❌ | ❌ |
| **Veredicto** | **igual precio, mejor producto** | | | |

| | **Conico Pro** | Bsale Pro | Manager Pro | Nubox Facturación Pro |
| --- | --- | --- | --- | --- |
| Precio | **$34.990** | $44.990 | $39.990 | $22.990 |
| Users | 5 | 5 | 5 | 3 |
| DTE incluidos | 250 | ~500 | ~500 | ~300 |
| Inventario serio | ✅ | ✅ | ✅ | ❌ |
| OC a proveedores | ✅ | parcial | parcial | ❌ |
| Aprobaciones crédito/margen | ✅ | ❌ | ❌ | ❌ |
| Reportes por marca | ✅ | ❌ | ❌ | ❌ |
| Cmd+K | ✅ | ❌ | ❌ | ❌ |
| Customer Portal | ✅ toggle | ❌ | ❌ | ❌ |
| Pipeline / Oportunidades | ✅ toggle | ❌ | ❌ | ❌ |
| Reporte mensual al contador | ✅ | ❌ | ❌ | parcial |
| **Veredicto** | **22% más barato que Bsale Pro + más features** | | | |

| | **Conico Business** | Bsale Empresa | Manager Plus | Haulmer (full) |
| --- | --- | --- | --- | --- |
| Precio | **$74.990** | $89.990 | $79.990 | $49.000+ |
| Users | 15 | 15 | 10 | 10+ |
| DTE | Ilim BYOL | ~2.000 | ~2.000 | varía |
| Multi-bodega | 10 | sí | sí | parcial |
| Pipeline / CRM | ✅ | ❌ | ❌ | ❌ |
| Customer Portal | 500 | ❌ | ❌ | ❌ |
| Audit log | ✅ | parcial | parcial | ❌ |
| Lote/serie | ✅ | parcial | parcial | ❌ |
| Reporte mensual al contador | ✅ | ❌ | ❌ | ❌ |
| **Veredicto** | **17% más barato que Bsale + CRM serio** | | | |

| | **Conico Enterprise** | Bsale (no tiene) | Manager (no tiene) |
| --- | --- | --- | --- |
| Precio | **desde $149.990** | — | — |
| Multi-tenant interno | ✅ | — | — |
| API + webhooks | ✅ | — | — |
| Customer Portal ilim | ✅ | — | — |
| SSO | ✅ | — | — |
| **Veredicto** | nicho sin competencia directa en este segmento | | |

---

## 9. Estrategia de descuentos y promociones

| Mecanismo | Descuento | Cuándo |
| --- | --- | --- |
| Pago anual | 17% off (≈ 2 meses gratis) | Siempre |
| Pago bianual (Enterprise) | 25% off | Solo Enterprise |
| Lanzamiento (primeros 100 clientes) | 30% off primer año | Primeros 6 meses post-launch |
| Referido | 1 mes gratis para ambos | Permanente |
| Conversión Cotiza→Starter | 50% off primer mes | Permanente |
| Migración desde competidor (Bsale/Manager/Nubox) | 2 meses gratis + onboarding gratis | Permanente |
| Partner contador | 15% recurring para el contador | Programa partners |
| Educación (.edu, ONG) | 50% off | Verificación caso a caso |

---

## 10. Calculadora de ejemplo (para landing) — v2

**Emprendedor de servicios, 1 persona, 30 facturas/mes:**
- Plan recomendado: **Starter** ($12.990/mes anual = $10.790)
- Cupos: ✅ users 1/1, ✅ DTE 30/60
- **Total: $10.790/mes** ($129.490/año)

**Pyme distribuidora, 4 vendedores, 800 productos, 200 facturas/mes, 1 bodega:**
- Plan recomendado: **Pro** ($34.990/mes anual = $29.040)
- Cupos: ✅ users 4/5, ✅ SKUs 800/5.000, ✅ DTE 200/250, ✅ bodega 1/2
- Add-ons: ninguno
- **Total: $29.040/mes** ($348.490/año) — todo incluido, ni siquiera necesita Lioren aparte

**Pyme retail, 12 vendedores, 8.000 productos, 1.500 docs/mes (factura+boleta), 4 sucursales:**
- Plan recomendado: **Business** ($74.990/mes anual = $62.240)
- DTE: BYOL — cliente contrata Lioren ~$39.000/mes (o "Conico + Lioren combo" $99.990)
- Cupos: ✅ users 12/15, ✅ SKUs 8.000/50.000, ✅ bodegas 4/10
- Add-ons: Pasarela Webpay (1,9% por transacción)
- **Total Conico: $62.240/mes** + Lioren del cliente

**Distribuidora mayorista, 25 vendedores, 30.000 productos, 5.000 docs/mes, 8 bodegas, multi-RUT:**
- Plan recomendado: **Enterprise** (desde $149.990/mes anual = $124.490)
- BYOL Lioren plan volumen
- Add-ons: API, Audit extendido, soporte SLA
- **Total negociado:** ~$179.990-219.990/mes

---

## 11. Preguntas que resuelve este documento

1. ✅ **¿Las boletas son DTE?** Sí, código 39/41.
2. ✅ **¿Cuánto me cuesta cada DTE?** ~$40-60 CLP en Conico (Lioren + overhead).
3. ✅ **¿Cuánto cobra el mercado?** $9.990-300.000 CLP/mes según tier.
4. ✅ **¿Qué precios poner?** Tabla sección 5 (escenario C).
5. ✅ **¿Cómo me cuadra el margen en DTE alto?** BYOL en Business+ (sección 6-7).
6. ✅ **¿Cómo comparo con Bsale/Defontana/Nubox/Manager?** Tabla sección 8.

---

## 12. Decisiones que necesito de ti antes de Fase 3 (landing + GTM)

1. **Modelo DTE:** ¿escenario all-inclusive o BYOL híbrido? (recomendación: híbrido — Starter/Pro all-inclusive, Business+ BYOL).
2. **Precios finales:** ¿escenario C (recomendado) o ajustamos?
3. **Cupos finales:** ¿80/400/2.000 DTE o ajustamos?
4. **Promo de lanzamiento:** ¿30% off primer año primeros 100 clientes?
5. **Pricing display:** ¿IVA incluido (más claro Pyme) o IVA aparte (estándar B2B)?
6. **Moneda:** ¿solo CLP o también USD para Enterprise/exportación?
7. **Tier Enterprise display:** "Desde $249.990" público o "Contáctanos" cerrado?
8. **Add-ons en landing:** ¿mostramos toda la tabla o solo top 5 más vendibles?
9. **Pasarelas pago para cobrar a clientes Conico:** ¿Stripe (USD) + Flow (CLP) + Khipu? Define el cobro nuestro al cliente final.

---

## 13. Próximos pasos

Si apruebas Fase 2:

- **Fase 3 (GTM + landing + scripts):**
  - Landing page completa HTML standalone con planes, calculadora, CTA, FAQ.
  - 3 scripts video (60s vendedor / 30s dueño / 15s ad).
  - Email funnel (welcome, onboarding, upgrade prompt, win-back).
  - Plan canales (SEO keywords, Google Ads, partners contadores, eventos).
  - Copy: ad headlines, body, CTAs.
  - Métricas de éxito por etapa del funnel.

¿Vamos con escenario C + híbrido DTE? ¿Algún ajuste antes de Fase 3?
