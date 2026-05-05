# Lioren Cost Tariff Maintenance

## Overview

Each call to the Lioren DTE API is instrumented with a cost estimate in CLP, sourced from the `cost_tariff` table. This allows per-empresa attribution and profitability analysis in telemetry dashboards.

## Tariff Slugs

| Slug | DTE tipo | Description |
|------|----------|-------------|
| `factura_emision` | 033 | Factura Electrónica |
| `factura_exenta` | 034 | Factura Exenta |
| `nota_credito` | 061 | Nota de Crédito |
| `nota_debito` | 056 | Nota de Débito |
| `guia_despacho` | 052 | Guía de Despacho |
| `boleta` | 039 | Boleta Electrónica |
| `boleta_exenta` | 041 | Boleta Exenta |
| `factura_compra` | 046 | Factura de Compra |
| `libro_envio` | — | Envío Libro de Ventas/Compras |

## Updating Prices When Lioren Changes Rates

Run this SQL against the production database (replace `<costo>` with the new price in CLP):

```sql
UPDATE cost_tariff SET costo_clp = <costo>, updated_at = NOW()
WHERE slug = '<slug>';
```

Example — Lioren raises factura_emision to 350 CLP:

```sql
UPDATE cost_tariff SET costo_clp = 350, updated_at = NOW()
WHERE slug = 'factura_emision';
```

## Verifying Log Output

After updating tariffs, emit a test DTE (sandbox mode) and confirm the log line contains the new cost:

```bash
# In staging/dev, tail logs and look for lioren.call entries:
docker logs conico-backend 2>&1 | grep '"message":"lioren.call"' | tail -5 | python -m json.tool
```

Expected fields in the log record extras:

```json
{
  "endpoint": "https://api.lioren.cl/v1/documentos",
  "method": "POST",
  "empresa_id": 1,
  "dte_tipo": "033",
  "latency_ms": 312,
  "http_status": 200,
  "req_size": 1024,
  "resp_size": 128,
  "cost_clp": 350
}
```

## Initial Tariffs

All tariffs were seeded with `costo_clp = 0` (migration `a6b7c8d9e0f1`). Update them to the actual Lioren contract prices before enabling cost reporting in dashboards.
