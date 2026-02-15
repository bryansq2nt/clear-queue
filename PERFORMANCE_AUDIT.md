# Performance Audit

**Date:** 2025-02-15  
**Source:** Terminal logs from navigation (`npm run dev`).  
**Target:** Apply `docs/patterns/data-loading.md` to pages with > 5 POSTs.

---

## Current state (from logs)

| Page                 | POSTs       | Load Time  | Status     |
| -------------------- | ----------- | ---------- | ---------- |
| /profile             | 4           | ~0.9s      | ✅ Fixed   |
| /dashboard           | ~3–4 (est.) | <1s (est.) | ✅ Fixed   |
| /projects            | ~3–4 (est.) | <1s (est.) | ✅ Fixed   |
| /settings/appearance | ~3–4 (est.) | <1s (est.) | ✅ Fixed   |
| /ideas               | ~2–3 (est.) | <1s (est.) | ✅ Fixed   |
| /todo                | ~2–3 (est.) | <1s (est.) | ✅ Fixed   |
| /todo/list/[id]      | 8+          | ~1.1s      | 🔜 Pending |
| /budgets             | ~2–3 (est.) | <1s (est.) | ✅ Fixed   |
| /budgets/[id]        | 6+          | ~1s        | 🔜 Pending |
| /clients             | ~2–3 (est.) | <1s (est.) | ✅ Fixed   |
| /clients/[id]        | 9+          | ~1s        | 🔜 Pending |
| /businesses          | ~2–3 (est.) | <1s (est.) | ✅ Fixed   |
| /billings            | ~3–4 (est.) | <1s (est.) | ✅ Fixed   |
| /notes               | ~2–4 (est.) | <1s (est.) | ✅ Fixed   |
| /notes/[id]          | 2+          | ~0.4s      | 🔜 Pending |
| /project/[id]        | ~3–4 (est.) | <1s (est.) | ✅ Fixed   |

---

## Priority order (fix one by one)

1. **Dashboard** – Most visited
2. **Projects**
3. **Clients**
4. **Businesses**
5. **Billings**
6. **Budgets**
7. **Ideas**
8. **Notes**
9. **Todo**
10. **Settings (appearance)**

Remaining: /todo/list/[id], /budgets/[id], /clients/[id], /notes/[id]

---

## How to update this file

After fixing a page:

1. Re-run the app, open that page, count POSTs and note load time.
2. Update the row: set POSTs, Load Time, and Status to `✅ Fixed`.
3. Commit the audit update with the same commit as the fix (or a follow-up).
