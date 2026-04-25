# Runbook — Boleta DTE rechazada o sin respuesta

> Owner: backend. Last updated: 2026-04-25. Tarea: W1-04.

Este runbook describe cómo diagnosticar y remediar boletas electrónicas (DTE 39/41) que quedaron en estado inconsistente: rechazadas por SII, atascadas en `procesando` o con stock descontado sin documento emitido.

---

## Síntoma A: Boleta queda en `dte_estado=rechazada`

1. Revisar `dte_emisiones.respuesta_sii` para la boleta en cuestión.
2. El sistema ya marcó `boleta.estado='anulada'` y revirtió stock automáticamente.
3. Operador debe corregir datos y emitir boleta nueva.

## Síntoma B: Boleta queda en `dte_estado=procesando` por >24h

1. Revisar logs Celery del job `poll_dte_status` (puede haber timeout/error con Lioren).
2. Verificar Lioren API status.
3. Si Lioren responde aceptada manualmente, marcar via SQL controlado:
   ```sql
   UPDATE boletas SET dte_estado='aceptada' WHERE id=X;
   UPDATE dte_emisiones SET estado='aceptada' WHERE boleta_id=X;
   ```
4. Si Lioren responde rechazada, ejecutar:
   ```sql
   UPDATE boletas SET dte_estado='rechazada', estado='anulada' WHERE id=X;
   ```
   Y reversar stock manualmente (ver `app/services/boleta_stock.py::revertir_stock_boleta`).

## Síntoma C: Stock descontado pero boleta nunca emitida

Caso edge: backend crashea entre `descontar_stock_boleta` y `db.commit()`. Por transacción, ambos se rollbackean juntos. Si no es así (bug), reconciliar:

```sql
SELECT b.id, b.numero, b.estado, b.dte_estado FROM boletas b
WHERE b.estado='emitida' AND b.dte_estado='no_emitida';
```

Para cada boleta huérfana, decidir: emitir manualmente o anular.
