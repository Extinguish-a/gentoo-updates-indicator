Gentoo Updates Indicator — Icon Notes
====================================

Aggiornamento 2024-09-20 — Allineamento fallback ad Adwaita
-----------------------------------------------------------
- All'avvio verifichiamo se `/usr/share/icons/Adwaita/symbolic/actions` esiste: in tal caso le icone vengono caricate direttamente da lì, così il pannello resta perfettamente allineato al tema della shell. Se la directory non c'è (installazioni minimali o temi custom senza Adwaita) si ricade automaticamente sui fallback in `icons/`.
- I fallback in `icons/` sono copie 1:1 delle versioni simboliche Adwaita (`format-indent-less-rtl-symbolic.svg`, `selection-mode-symbolic.svg`, `action-unavailable-symbolic.svg`, `view-restore-symbolic.svg`, `system-run-symbolic.svg`) per mantenere coerenza anche quando manca il tema di sistema.
- Ogni file resta su canvas `16×16` (`viewBox="0 0 16 16"`) con path puliti allineati alla griglia. I riempimenti usano il colore base `#2e3436` previsto da GNOME; la shell applica poi l'effetto tint per i `system-status-icon` quindi il risultato resta ben visibile sia in light che in dark mode.
- Mappatura stati invariata: checking → `view-restore-symbolic.svg`, unknown → `system-run-symbolic.svg`, updates disponibili → `format-indent-less-rtl-symbolic.svg`, errore → `action-unavailable-symbolic.svg`, tutto aggiornato → `selection-mode-symbolic.svg`. Le notifiche riutilizzano lo stato "updates".
- `_setIndicatorIcon()` (vedi `ICON_NAMES` in `extension.js`) prova prima a caricare l'icona dal tema attivo e ricade automaticamente su queste copie se il tema non espone quel nome.
