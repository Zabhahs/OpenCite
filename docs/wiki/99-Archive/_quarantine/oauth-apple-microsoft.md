---
machine_ids: ["components.Layout"]
findings: [F-305]
runtime: client
status: quarantined
tags: [archive, quarantine, deadcode, frontend, auth]
---

# 🔒 Quarantine — Apple / Microsoft OAuth providers (Layout.jsx sign-in dropdown)

> **Removed in v0.41.** The `PROVIDERS` array in `Layout.jsx` listed `apple` and
> `microsoft-entra-id` with `active: false`; the sign-in dropdown rendered them as greyed,
> non-clickable "↳ Apple — soon" / "↳ Microsoft — soon" items for every unauthenticated user.
> No OAuth integration exists for either — only Google is wired. The dead UI created visual noise
> and false expectations. Justified by finding **F-305**.

## Verbatim source

Only the two inactive entries were removed from the `PROVIDERS` array; the `google` entry remains
and is now the sole entry. The dropdown `.map()` render was simplified to drop the
`active ? <button> : <div>…— soon</div>` ternary, since every surviving provider is active.

**Removed PROVIDERS entries:**

```jsx
{ id: "apple",              label: "Apple",     active: false },
{ id: "microsoft-entra-id", label: "Microsoft", active: false },
```

**Removed inactive-branch JSX from the dropdown `.map()`:**

```jsx
) : (
  <div
    key={p.id}
    className="block w-full text-left mono-font text-xs uppercase tracking-widest text-stone-400 px-4 py-3 border-b border-stone-100 last:border-0 cursor-default select-none"
  >
    ↳ {p.label} <span className="text-[9px] tracking-wider">— soon</span>
  </div>
)
```

## Revival checklist

1. Implement Apple and/or Microsoft OAuth in the Auth.js config (`AuthContext.jsx` / the Auth.js
   handler) — provider config, client IDs, secrets in env.
2. Re-add the entry/entries to the `PROVIDERS` array in `Layout.jsx` with `active: true`.
3. Restore the `active ? … : …` ternary in the dropdown `.map()` ONLY if you intend to show "soon"
   placeholders again; otherwise keep all entries active.
4. Test the full sign-in flow end-to-end for each revived provider before shipping.

## Findings

**F-305** — Apple and Microsoft OAuth providers rendered as disabled dead UI for all users.

## See also

[[_index]] · [[01-Frontend/UI-Map]]
