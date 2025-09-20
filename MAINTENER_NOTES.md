    Gentoo Updates Indicator — Maintainer Notes (for future me)

  Purpose

  - This is a Gentoo port of the original “Arch Linux Updates Indicator” by Raphaël Rochet.
  - It preserves the UX: a top‑bar indicator with count, a list of updates, a one‑click update, and notifications — adapted
  to Portage.

  Identity (names, domains, schema)

  - Folder/UUID: gentoo-updates-indicator@local
  - metadata.json
      - name: Gentoo Updates Indicator
      - uuid: gentoo-updates-indicator@local
      - gettext-domain: gentoo-updates-indicator
      - settings-schema: org.gnome.shell.extensions.gentoo-updates-indicator
      - shell-version: ["47","48","49"] (adjust as needed)
  - GSettings schema: schemas/org.gnome.shell.extensions.gentoo-updates-indicator.gschema.xml
  - Prefs XML domain: gentoo-updates-indicator

  Commands (defaults)

  - Check (no root):
      - emerge -puDN @world | awk …
      - The awk extracts lines like: "category/pkg oldver -> newver" (so our regex works: /^(.+)\s+(\S+)\s+->\s+(.+)$/).
  - Update (root via sudo in a terminal):
      - gnome-terminal -- /bin/sh -c "sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _"
  - Sync (root):
      - gnome-terminal -- /bin/sh -c "sudo emaint sync -a ; echo Done - Press enter to exit; read _"
  - Rebuild World (root, optional deep rebuild):
      - gnome-terminal -- /bin/sh -c "sudo emerge -e -av @world ; echo Done - Press enter to exit; read _"

  Portage specifics implemented

  - Periodic checks (minutes) with first‑boot delay, same as upstream UX.
  - Optional notification on new updates.
  - Optional auto‑open terminal when new updates appear (runs update-cmd once).
  - "Sync Portage now" menu item (runs sync-cmd).
  - "Rebuild World now" menu item (runs rebuild-cmd).
  - Scheduled sync options:
      - Interval mode: every N hours/days.
      - Fixed daily time: run every day at HH:MM (local time). Fixed schedule has priority over interval.
  - Directory monitor switched to /var/db/pkg; when it changes, we schedule a check soon after.

  Preferred terminal presets

  - Setting preferred-terminal with presets: gnome-terminal, tilix, terminator, kitty, alacritty, foot, custom.
  - Changing the preset auto‑fills both update-cmd and sync-cmd unless preset is custom.

  Files you will care about next time

  - extension.js
      - Classes renamed; panel button, menu, timers, notifications.
      - Imports: note Format import is required for String.prototype.format = Format.format.
      - Icons: costanti `ICON_NAMES` mappano gli stati su nomi standard (`format-indent-less-rtl-symbolic`, `selection-mode-symbolic`, `action-unavailable-symbolic`, `system-run-symbolic`, `view-restore-symbolic`). All'avvio cerchiamo `/usr/share/icons/Adwaita/symbolic/actions` e, se presente, carichiamo da lì gli SVG; in caso contrario si ricade sui fallback locali con gli stessi nomi in `icons/`.
      - Monitors: Gio file monitor on /var/db/pkg.
      - Schedulers: _scheduleCheck, _scheduleSync, _autoSync, _autoSyncFixed.
  - prefs.js / prefs.xml
      - GTK4/Libadwaita UI with GSettings bindings.
      - Controls for automation, scheduling, fixed time, preferred terminal.
  - schemas/org.gnome.shell.extensions.gentoo-updates-indicator.gschema.xml
      - All defaults and new keys are declared here.
  - metadata.json
      - UUID and domains; must match folder name.
  - stylesheet.css
      - CSS class prefix is gentoo-updates-*.
  - locale/
      - Domain: gentoo-updates-indicator. Languages: it_IT, fr, de_DE, es (.po and .mo present).
  - scripts/
      - scripts/compile-locales.sh: compile all .po -> .mo
      - scripts/update-pot.sh: regenerate POT (xgettext for JS, itstool for XML), merge with msgcat

  Installation (dev workflow)

  - Folder must be named exactly the UUID: gentoo-updates-indicator@local
  - User install:
      - mkdir -p ~/.local/share/gnome-shell/extensions
      - cp -r gentoo-updates-indicator@local ~/.local/share/gnome-shell/extensions/
      - or symlink for dev: ln -s $(pwd)/gentoo-updates-indicator@local ~/.local/share/gnome-shell/extensions/gentoo-updates-
  indicator@local
      - Reload Shell (Alt+F2 -> r on Xorg) or relogin (Wayland); then gnome-extensions enable gentoo-updates-indicator@local

  Important invariants

  - metadata.json UUID matches folder name.
  - gettext-domain in metadata matches .mo filenames.
  - settings-schema in metadata matches schema id and compiled schemas.
  - schemas/gschemas.compiled must be kept in sync with the XML.
  - The awk in check-cmd assumes emerge -puDN output with [ebuild …] new [old]; adjust if Portage format changes.

  Troubleshooting

  - Shell crash on enable: likely missing import or schema mismatch. Check: journalctl --user -f | rg -i 'gnome-shell|
  extensions'
  - No translations: ensure the session language and domain gentoo-updates-indicator.
  - Terminal doesn’t open: terminal binary missing; change preset or command.
  - No updates detected: parser too strict; simplify awk or enable "Disable output parsing".

  Release hygiene

  - After schema changes: glib-compile-schemas schemas
  - After string changes: scripts/update-pot.sh && scripts/compile-locales.sh
  - Verify shell-version in metadata for your GNOME version.

  TODO (nice-to-have)

  - Health check in prefs for terminal presence.
  - Combined maintenance action (sync -> update -> optional rebuild) with confirmation.
  - Small test for awk parser to catch format drift.

  Quick map of key settings

  - check-cmd (string)
  - update-cmd (string)
  - package-manager (string)
  - package-info-cmd (string)
  - portage-dir (string, default /var/db/pkg)
  - auto-open-terminal (bool)
  - sync-cmd (string)
  - sync-schedule-enabled (bool); sync-interval-value (int); sync-interval-unit (hours|days)
  - sync-fixed-enabled (bool); sync-fixed-hour (0–23); sync-fixed-minute (0–59)
  - preferred-terminal (string)

  End.
  EOF
