# Spec: DTE Import Empresa Suggestion + Facturas/Cobranza Consolidation

**Date:** 2026-04-21

## Overview

Two UX improvements:
1. When a DTE XML import fails because the empresa RUT is not in the system, suggest creating it with pre-filled data from the XML.
2. Remove the standalone Facturas page — it duplicates functionality already covered by the Facturas tab inside Cobranza.

---

## Part 1: DTE Import — Suggest Creating Empresa

### Problem

`POST /api/facturas/import/xml/bulk` returns a plain error string when `rut_receptor` doesn't match any empresa. The user sees "Empresa con RUT X no encontrada" but has no path forward from within the import flow.

### Solution

**Backend changes:**

1. **`xml_dte.py` — extract `nombre_receptor`:** Add `RznSocRecep` extraction to `parse_dte_xml`. Return it as `nombre_receptor` in the parsed dict. It may be absent in some XMLs (optional field).

2. **`facturas.py` — `_upsert_from_xml` error detail:** When empresa not found, raise `HTTPException` with a structured dict detail instead of a plain string:
   ```python
   raise HTTPException(status_code=422, detail={
       "message": f"Empresa con RUT {rut} no encontrada en el sistema",
       "empresa_data": {
           "rut": parsed["rut_receptor"],
           "nombre": parsed.get("nombre_receptor") or "",
           "email": parsed.get("correo_receptor") or "",
       }
   })
   ```

3. **`facturas.py` — `ImportXMLError` schema:** Add optional field `empresa_data: dict | None = None`. In `import_xml_bulk`, when catching `HTTPException`, check if `exc.detail` is a dict and extract `message` and `empresa_data` accordingly:
   ```python
   except HTTPException as exc:
       if isinstance(exc.detail, dict):
           errores.append(ImportXMLError(
               filename=f.filename or "unknown",
               message=exc.detail["message"],
               empresa_data=exc.detail.get("empresa_data"),
           ))
       else:
           errores.append(ImportXMLError(filename=f.filename or "unknown", message=exc.detail))
   ```

**Frontend changes:**

4. **`Cobranza.tsx` — ImportModal error rendering:** When an error item has `empresa_data`, render a "Crear empresa →" link alongside the error text:
   ```tsx
   {result.errores.map((e, i) => (
     <div key={i} className="text-xs text-red-500 flex items-center gap-2">
       <span>{e.filename}: {e.message}</span>
       {e.empresa_data && (
         <Link
           to={`/empresas?create=true&rut=${encodeURIComponent(e.empresa_data.rut)}&nombre=${encodeURIComponent(e.empresa_data.nombre)}&email=${encodeURIComponent(e.empresa_data.email)}`}
           className="underline text-blue-600 whitespace-nowrap"
         >
           Crear empresa →
         </Link>
       )}
     </div>
   ))}
   ```

5. **`Empresas.tsx` — read URL params on mount:** On component mount, check `useSearchParams` for `create`, `rut`, `nombre`, `email`. If `create=true`, open the create modal with those fields pre-filled. After opening the modal, clear the query params from the URL (replace history entry) so a refresh doesn't reopen the modal.

   The pre-fill sets the modal form's initial state: `{ rut, nombre, email }`. Other fields remain empty for the user to complete.

---

## Part 2: Remove Standalone Facturas Page

### Problem

`/facturas` (Facturas.tsx) and the "Facturas" tab inside Cobranza show the same invoice list. The Cobranza tab is the more complete version (includes XML import). Having both creates confusion.

### Solution

1. **`frontend/src/router.tsx`:** Remove the `/facturas` route.
2. **`frontend/src/components/layout/Sidebar.tsx`:** Remove the "Facturas" nav item.
3. **`frontend/src/pages/Facturas.tsx`:** Delete the file.

No backend changes needed — the Cobranza tab already calls the same `/api/facturas/` endpoint.

---

## Data Flow

```
XML upload → bulk import API
  → parse_dte_xml() → includes nombre_receptor
  → lookup empresa by rut
    → found: upsert factura
    → not found: error with empresa_data {rut, nombre, email}
  → return ImportXMLResult with errores[].empresa_data

ImportModal renders error list
  → error has empresa_data → show "Crear empresa →" link
  → link: /empresas?create=true&rut=X&nombre=Y&email=Z

Empresas page mounts
  → reads ?create=true&rut=X&nombre=Y&email=Z
  → opens create modal with pre-filled fields
  → clears URL params
```

---

## Edge Cases

- `RznSocRecep` absent in XML → `nombre` passed as empty string → field shows blank but RUT is pre-filled
- `CorreoRecep` absent → `email` passed as empty string
- User navigates to `/empresas?create=true&rut=X` and then refreshes → params cleared after modal opens, so refresh shows normal Empresas page
- Empresa created successfully → user navigates back to Cobranza and retries the XML upload

---

## Out of Scope

- Auto-retry the XML import after empresa creation
- Extracting more fields (giro, dirección) — not mapped to Empresa model fields currently
