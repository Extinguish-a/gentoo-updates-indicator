/*
    This file is part of Gentoo Updates Indicator

    Gentoo Updates Indicator is free software: you can redistribute it and/or modify
    it under the terms of the GNU General Public License as published by
    the Free Software Foundation, either version 3 of the License, or
    (at your option) any later version.

    Gentoo Updates Indicator is distributed in the hope that it will be useful,
    but WITHOUT ANY WARRANTY; without even the implied warranty of
    MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
    GNU General Public License for more details.

    You should have received a copy of the GNU General Public License
    along with Gentoo Updates Indicator.  If not, see <http://www.gnu.org/licenses/>.

    Copyright 2016-2022 Raphaël Rochet
*/

import Clutter from 'gi://Clutter';
import St from 'gi://St';
import GObject from 'gi://GObject';
import Gio from 'gi://Gio';
import GioUnix from 'gi://GioUnix';
import GLib from 'gi://GLib';

import * as Main from 'resource:///org/gnome/shell/ui/main.js';
import {Button} from 'resource:///org/gnome/shell/ui/panelMenu.js';

import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
import * as MessageTray from 'resource:///org/gnome/shell/ui/messageTray.js';
import * as Util from 'resource:///org/gnome/shell/misc/util.js';
import {Extension, gettext as _, ngettext as __} from 'resource:///org/gnome/shell/extensions/extension.js';

/* RegExp to tell what's an update */
/* I am very loose on this, may make it easier to port to other distros */
const RE_UpdateLine = /^(.+)\s+(\S+)\s+->\s+(.+)$/;

const ICON_NAMES = Object.freeze({
	UNKNOWN: 'system-run-symbolic',
	CHECKING: 'view-restore-symbolic',
	UPDATES: 'format-indent-less-rtl-symbolic',
	UPTODATE: 'selection-mode-symbolic',
	ERROR: 'action-unavailable-symbolic',
	NOTIFICATION_SOURCE: 'format-indent-less-rtl-symbolic',
});

const ADWAITA_ACTIONS_DIR = '/usr/share/icons/Adwaita/symbolic/actions';

/* Options */
let ALWAYS_VISIBLE     = true;
let SHOW_COUNT         = true;
let BOOT_WAIT          = 15;      // 15s
let CHECK_INTERVAL     = 60*60;   // 1h
let NOTIFY             = false;
let HOWMUCH            = 0;
let UPDATE_CMD         = "gnome-terminal -- /bin/sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\" ";
let CHECK_CMD          = "/bin/sh -c \"emerge -puDN @world 2>/dev/null | awk '/\\[ebuild/ && $0 ~ /U/ { if (match($0, /\\[ebuild[^\\]]*\\]\\s+([^ ]+)\\s+\\[([^\\]]+)\\]/, a)) { new=a[1]; old=a[2]; atom=new; sub(/:[^ ]+$/, \\\"\\\" , atom); newver=new; sub(/^.*-/, \\\"\\\" , newver); sub(/:.*/, \\\"\\\" , newver); oldver=old; sub(/:.*/, \\\"\\\" , oldver); pkg=atom; sub(/-[^-]+$/, \\\"\\\" , pkg); printf(\\\"%s %s -> %s\\\\n\\\", pkg, oldver, newver); } }'\"";
let MANAGER_CMD        = "";
let PORTAGE_DIR        = "/var/db/pkg";
let STRIP_VERSIONS     = false;
let STRIP_VERSIONS_N   = true;
let AUTO_EXPAND_LIST   = 0;
let DISABLE_PARSING    = false;
let PACKAGE_INFO_CMD   = "xdg-open https://packages.gentoo.org/packages/%1$s";
let LINKIFY_MENU       = true;
let SHOW_TIMECHECKED   = true;
let AUTO_OPEN_TERMINAL = false;
let SYNC_CMD           = "gnome-terminal -- /bin/sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\" ";
let SYNC_ENABLED       = false;
let SYNC_INTERVAL_VALUE= 24;
let SYNC_INTERVAL_UNIT = 'hours';
let SYNC_FIXED_ENABLED = false;
let SYNC_FIXED_HOUR    = 3;
let SYNC_FIXED_MINUTE  = 0;

/* Variables we want to keep when extension is disabled (eg during screen lock) */
let FIRST_BOOT         = 1;
let UPDATES_PENDING    = -1;
let UPDATES_LIST       = [];
let LAST_CHECK         = undefined;
let LAST_SYNC          = undefined;

export default class GentooUpdateIndicatorExtension extends Extension {
	constructor(metadata) {
		super(metadata);
	}
	init() {
		// GNOME 47+: resource:///org/gnome/shell/misc/format.js was removed.
		// Provide a tiny compatible String.format that supports %s, %d and positional %1$s.
		String.prototype.format = function(...args) {
			let auto = 0;
			return this.replace(/%(\d+\$)?([sd])/g, (m, pos, t) => {
				let idx = pos ? (parseInt(pos) - 1) : (auto++);
				let v = args[idx];
				if (v === undefined || v === null) v = '';
				return String(v);
			});
		};
	}
		enable() {
			this.gentoupdateindicator = new GentooUpdateIndicator(this);
			Main.panel.addToStatusArea('GentooUpdateIndicator', this.gentoupdateindicator);
			this.gentoupdateindicator._positionChanged();
		}
		disable() {
			this.gentoupdateindicator.destroy();
			this.gentoupdateindicator = null;
		}
}

const GentooUpdateIndicator = GObject.registerClass(
		{
			_TimeoutId: null,
			_FirstTimeoutId: null,
			_updateProcess_sourceId: null,
			_updateProcess_stream: null,
			_updateProcess_pid: null,
			_updateList: [],
			_SyncTimeoutId: null,
		},
class GentooUpdateIndicator extends Button {

	_init(ext) {
		console.log(`Gentoo-update : loading`);
		super._init(0.5);
		this._extension = ext;
		this._iconCache = new Map();
		this._adwaitaIconsDir = this._detectAdwaitaIconsDir();
		this._currentIconName = ICON_NAMES.UNKNOWN;
		/* A process builder without i10n for reproducible processing. */
		this.launcher = new Gio.SubprocessLauncher({
			flags: (Gio.SubprocessFlags.STDOUT_PIPE |
				    Gio.SubprocessFlags.STDERR_PIPE)
		});
		this.launcher.setenv("LANG", "C", true);

		this.updateIcon = new St.Icon({gicon: this._getCustIcon(this._currentIconName), style_class: 'system-status-icon'});

		let box = new St.BoxLayout({ vertical: false, style_class: 'panel-status-menu-box' });
		this.label = new St.Label({ text: '',
			y_expand: true,
			y_align: Clutter.ActorAlign.CENTER });

		box.add_child(this.updateIcon);
		box.add_child(this.label);
		this.add_child(box);

		// Prepare the special menu : a submenu for updates list that will look like a regular menu item when disabled
		// Scrollability will also be taken care of by the popupmenu
		this.menuExpander = new PopupMenu.PopupSubMenuMenuItem('');
		this.menuExpanderContainer = new St.BoxLayout({ vertical: true, style_class: 'gentoo-updates-updates-list' });
		this.menuExpander.menu.box.add_child( this.menuExpanderContainer );

		// Other standard menu items
		let settingsMenuItem = new PopupMenu.PopupMenuItem(_('Settings'));
		this.updateNowMenuItem = new PopupMenu.PopupMenuItem(_('Update now'));
		this.managerMenuItem = new PopupMenu.PopupMenuItem(_('Open package manager'));
		this.syncMenuItem = new PopupMenu.PopupMenuItem(_('Sync Portage now'));
		this.rebuildMenuItem = new PopupMenu.PopupMenuItem(_('Rebuild World now'));

		// A special "Checking" menu item with a stop button
		this.checkingMenuItem = new PopupMenu.PopupBaseMenuItem( {reactive:false} );
		let checkingLabel = new St.Label({ text: _('Checking') + " …" });
		let cancelButton = new St.Button({
			child: new St.Icon({ icon_name: 'process-stop-symbolic' }),
			style_class: 'system-menu-action gentoo-updates-menubutton',
			x_expand: true
		});
		cancelButton.set_x_align(Clutter.ActorAlign.END);
		this.checkingMenuItem.add_child( checkingLabel );
		this.checkingMenuItem.add_child( cancelButton  );

		// A little trick on "check now" menuitem to keep menu opened
		this.checkNowMenuItem = new PopupMenu.PopupMenuItem( _('Check now') );
		this.checkNowMenuContainer = new PopupMenu.PopupMenuSection();
		this.checkNowMenuContainer.box.add_child(this.checkNowMenuItem);

		// A placeholder to show the last check time
		this.timeCheckedMenu = new PopupMenu.PopupMenuItem( "-", {reactive:false} );

		// Assemble all menu items into the popup menu
		this.menu.addMenuItem(this.menuExpander);
		this.menu.addMenuItem(this.timeCheckedMenu);
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.menu.addMenuItem(this.updateNowMenuItem);
		this.menu.addMenuItem(this.checkingMenuItem);
		this.menu.addMenuItem(this.checkNowMenuContainer);
		this.menu.addMenuItem(this.managerMenuItem);
		this.menu.addMenuItem(this.syncMenuItem);
		this.menu.addMenuItem(this.rebuildMenuItem);
		this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
		this.menu.addMenuItem(settingsMenuItem);

		// Bind some events
		this.menu.connect('open-state-changed', this._onMenuOpened.bind(this));
		this.checkNowMenuItem.connect('activate', this._checkUpdates.bind(this));
		cancelButton.connect('clicked', this._cancelCheck.bind(this));
		settingsMenuItem.connect('activate', this._openSettings.bind(this));
		this.updateNowMenuItem.connect('activate', this._updateNow.bind(this));
		this.managerMenuItem.connect('activate', this._openManager.bind(this));
		this.syncMenuItem.connect('activate', this._syncNow.bind(this));
		this.rebuildMenuItem.connect('activate', this._rebuildNow.bind(this));

		// Some initial status display
		this._showChecking(false);
		this._updateMenuExpander(false, _('Waiting first check'));
		if (LAST_CHECK) this._updateLastCheckMenu();

		// Restore previous updates list if any
		this._updateList = UPDATES_LIST;

		// Load settings
		this._settings = this._extension.getSettings();
		this._settings.connect('changed', this._positionChanged.bind(this));
		this._settingsChangedId = this._settings.connect('changed', this._applySettings.bind(this));
		this._applySettings();

		if (FIRST_BOOT) {
			// Schedule first check only if this is the first extension load
			// This won't be run again if extension is disabled/enabled (like when screen is locked)
			this._FirstTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, BOOT_WAIT, ()=>{
				this._FirstTimeoutId = null;
				this._checkUpdates();
				FIRST_BOOT = 0;
				return false; // Run once
			});
		}

	}

	_getCustIcon(icon_name) {
		if (!this._iconCache)
			this._iconCache = new Map();

		if (this._adwaitaIconsDir) {
			let adwKey = `adwaita:${icon_name}`;
			if (!this._iconCache.has(adwKey)) {
				try {
					let file = this._adwaitaIconsDir.get_child(`${icon_name}.svg`);
					if (file.query_exists(null))
						this._iconCache.set(adwKey, Gio.FileIcon.new(file));
					else
						this._iconCache.set(adwKey, null);
				} catch (error) {
					console.error('Gentoo Updates Indicator: failed to load Adwaita icon', icon_name, error);
					this._iconCache.set(adwKey, null);
				}
			}
			let icon = this._iconCache.get(adwKey);
			if (icon)
				return icon;
		}

		let fileKey = `file:${icon_name}`;
		if (!this._iconCache.has(fileKey)) {
			let file = this._extension.dir.get_child('icons').get_child(`${icon_name}.svg`);
			this._iconCache.set(fileKey, Gio.FileIcon.new(file));
		}
		return this._iconCache.get(fileKey);
	}

	_detectAdwaitaIconsDir() {
		try {
			let dir = Gio.File.new_for_path(ADWAITA_ACTIONS_DIR);
			if (!dir.query_exists(null))
				return null;
			return dir;
		} catch (error) {
			console.warn('Gentoo Updates Indicator: Adwaita icons unavailable', error);
			return null;
		}
	}

	_setIndicatorIcon(icon_name) {
		this._currentIconName = icon_name;
		this.updateIcon.set_gicon(this._getCustIcon(icon_name));
	}

	_positionChanged(){
		if (this._settings.get_boolean('enable-positioning')) {
			this.container.get_parent().remove_child(this.container);
			let boxes = {
				0: Main.panel._leftBox,
				1: Main.panel._centerBox,
				2: Main.panel._rightBox
			};
			let p = this._settings.get_int('position');
			let i = this._settings.get_int('position-number');
			boxes[p].insert_child_at_index(this.container, i);
		}
	}

	_openSettings() {
		this._extension.openPreferences();
	}

	_openManager() {
		Util.spawnCommandLine(MANAGER_CMD);
	}

	_updateNow() {
		Util.spawnCommandLine(UPDATE_CMD);
	}

	_applySettings() {
		let previousAdwaita = this._adwaitaIconsDir ? this._adwaitaIconsDir.get_path() : null;
		let detectedAdwaita = this._detectAdwaitaIconsDir();
		let currentAdwaita = detectedAdwaita ? detectedAdwaita.get_path() : null;
		if (this._iconCache && previousAdwaita !== currentAdwaita)
			this._iconCache.clear();
		this._adwaitaIconsDir = detectedAdwaita;
		if (previousAdwaita !== currentAdwaita)
			this._setIndicatorIcon(this._currentIconName);
		ALWAYS_VISIBLE = this._settings.get_boolean('always-visible');
		SHOW_COUNT = this._settings.get_boolean('show-count');
		BOOT_WAIT = this._settings.get_int('boot-wait');
		CHECK_INTERVAL = 60 * this._settings.get_int('check-interval');
		NOTIFY = this._settings.get_boolean('notify');
		HOWMUCH = this._settings.get_int('howmuch');
		UPDATE_CMD = this._settings.get_string('update-cmd');
		CHECK_CMD = this._settings.get_string('check-cmd');
		DISABLE_PARSING = this._settings.get_boolean('disable-parsing');
		MANAGER_CMD = this._settings.get_string('package-manager');
		PORTAGE_DIR = this._settings.get_string('portage-dir');
		STRIP_VERSIONS = this._settings.get_boolean('strip-versions');
		STRIP_VERSIONS_N = this._settings.get_boolean('strip-versions-in-notification');
		AUTO_EXPAND_LIST = this._settings.get_int('auto-expand-list');
		PACKAGE_INFO_CMD = this._settings.get_string('package-info-cmd');
		LINKIFY_MENU = this._settings.get_boolean('linkify-menu');
		SHOW_TIMECHECKED = this._settings.get_boolean('show-timechecked');
		AUTO_OPEN_TERMINAL = this._settings.get_boolean('auto-open-terminal');
		SYNC_CMD = this._settings.get_string('sync-cmd');
		this.REBUILD_CMD = this._settings.get_string('rebuild-cmd');
		SYNC_ENABLED = this._settings.get_boolean('sync-schedule-enabled');
		SYNC_INTERVAL_VALUE = this._settings.get_int('sync-interval-value');
		SYNC_INTERVAL_UNIT = this._settings.get_string('sync-interval-unit');
		SYNC_FIXED_ENABLED = this._settings.get_boolean('sync-fixed-enabled');
		SYNC_FIXED_HOUR = this._settings.get_int('sync-fixed-hour');
		SYNC_FIXED_MINUTE = this._settings.get_int('sync-fixed-minute');
		this.managerMenuItem.visible = ( MANAGER_CMD != "" );
		this.syncMenuItem.visible = ( SYNC_CMD != "" );
		this.rebuildMenuItem.visible = ( this.REBUILD_CMD != "" );
		this.timeCheckedMenu.visible = SHOW_TIMECHECKED;
		this._checkShowHide();
		this._updateStatus();
		this._startFolderMonitor();
		this._scheduleCheck();
		this._scheduleSync();
	}

	_scheduleCheck() {
		// Remove previous schedule if any
		if (this._TimeoutId) GLib.source_remove(this._TimeoutId);
		let delay = CHECK_INTERVAL; // seconds before next check
		if (LAST_CHECK) {
			// Adjust the delay so that locking screen or changing settings does not reset
			// the countdown to next check
			// Remove how many seconds already passed since last check
			delay -= ((new Date()) - LAST_CHECK) / 1000;
			// Do not go under "First check delay" setting
			if (delay < BOOT_WAIT) delay = BOOT_WAIT;
		}
		console.log(`Gentoo-update : next update check scheduled in (seconds) ` + delay.toString());
		this._TimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, ()=>{
			this._TimeoutId = null;
			this._checkUpdates();
			return false;
		});
	}

	_scheduleSync() {
		if (this._SyncTimeoutId) GLib.source_remove(this._SyncTimeoutId);
		if (SYNC_FIXED_ENABLED) {
			// schedule for next SYNC_FIXED_HOUR:SYNC_FIXED_MINUTE local time
			let now = new Date();
			let next = new Date(now.getFullYear(), now.getMonth(), now.getDate(), SYNC_FIXED_HOUR, SYNC_FIXED_MINUTE, 0, 0);
			if (next <= now) {
				next.setDate(next.getDate() + 1);
			}
			let delay = Math.max(60, Math.floor((next - now) / 1000));
			this._SyncTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, ()=>{
				this._SyncTimeoutId = null;
				this._autoSyncFixed();
				return false;
			});
		} else if (SYNC_ENABLED) {
			let base = SYNC_INTERVAL_UNIT === 'days' ? (SYNC_INTERVAL_VALUE * 24 * 3600) : (SYNC_INTERVAL_VALUE * 3600);
			let delay = base;
			if (LAST_SYNC) {
				delay -= ((new Date()) - LAST_SYNC) / 1000;
				if (delay < 60) delay = 60;
			}
			this._SyncTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, ()=>{
				this._SyncTimeoutId = null;
				this._autoSync();
				return false;
			});
		}
	}

	_autoSync() {
		// run scheduled sync and reschedule
		try {
			this._syncNow();
		} finally {
			LAST_SYNC = new Date();
			this._scheduleSync();
		}
	}

	_autoSyncFixed() {
		try {
			this._syncNow();
		} finally {
			LAST_SYNC = new Date();
			// schedule strictly next day at fixed time
			let now = new Date();
			let next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, SYNC_FIXED_HOUR, SYNC_FIXED_MINUTE, 0, 0);
			let delay = Math.max(60, Math.floor((next - now) / 1000));
			this._SyncTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, delay, ()=>{
				this._SyncTimeoutId = null;
				this._autoSyncFixed();
				return false;
			});
		}
	}

		destroy() {
			console.log(`Gentoo-update : unloading`);
			this._settings.disconnect( this._settingsChangedId );
		if (this._notifSource) {
			// Delete the notification source, which lay still have a notification shown
			this._notifSource.destroy();
			this._notifSource = null;
		};
		if (this.monitor) {
			// Stop monitoring Portage package DB dir
			this.monitor.cancel();
			this.monitor = null;
		}
		if (this._updateProcess_sourceId) {
			// We leave the checkupdate process end by itself but undef handles to avoid zombies
			GLib.source_remove(this._updateProcess_sourceId);
			this._updateProcess_sourceId = null;
			this._updateProcess_stream = null;
		}
		if (this._FirstTimeoutId) {
			GLib.source_remove(this._FirstTimeoutId);
			this._FirstTimeoutId = null;
		}
		if (this._TimeoutId) {
			GLib.source_remove(this._TimeoutId);
			this._TimeoutId = null;
		}
		if (this._SyncTimeoutId) {
			GLib.source_remove(this._SyncTimeoutId);
			this._SyncTimeoutId = null;
		}
		super.destroy();
	}

	_checkShowHide() {
		if ( UPDATES_PENDING == -3 ) {
			// Do not apply visibility change while checking for updates
			return;
		} else if ( UPDATES_PENDING == -2 ) {
			// Always show indicator if there is an error
			this.visible = true;
		} else if (!ALWAYS_VISIBLE && UPDATES_PENDING < 1) {
			this.visible = false;
		} else {
			this.visible = true;
		}
		this.label.visible = SHOW_COUNT && UPDATES_PENDING > 0;
	}

	_onMenuOpened() {
		// This event is fired when menu is shown or hidden
		// Only open the submenu if the menu is being opened and there is something to show
		this._checkAutoExpandList();
	}

	_checkAutoExpandList() {
		if (this.menu.isOpen && UPDATES_PENDING > 0 && UPDATES_PENDING <= AUTO_EXPAND_LIST) {
			this.menuExpander.setSubmenuShown(true);
		} else {
			this.menuExpander.setSubmenuShown(false);
		}
	}

	_startFolderMonitor() {
		if (this.monitoring && this.monitoring != PORTAGE_DIR) {
			// The path to be monitored has been changed
			this.monitor.cancel();
			this.monitor = null;
			this.monitoring = null;
		}
		if (PORTAGE_DIR && !this.monitoring) {
			// If there's a path to monitor and we're not already monitoring
			this.monitoring = PORTAGE_DIR;
			this.portage_dir = Gio.file_new_for_path(PORTAGE_DIR);
			this.monitor = this.portage_dir.monitor_directory(0, null);
			this.monitor.connect('changed', this._onFolderChanged.bind(this));
		}
	}

	_onFolderChanged() {
		// Folder have changed ! Let's schedule a check in a few seconds
		// This will replace the first check if not done yet, we don't want to do double checking
		if (this._FirstTimeoutId) GLib.source_remove(this._FirstTimeoutId);
		this._FirstTimeoutId = GLib.timeout_add_seconds(GLib.PRIORITY_DEFAULT, 5, ()=>{
			this._FirstTimeoutId = null;
			this._checkUpdates();
			FIRST_BOOT = 0;
			return false;
		});
	}

	_showChecking(isChecking) {
		if (isChecking == true) {
			this._setIndicatorIcon(ICON_NAMES.CHECKING);
			this.checkNowMenuItem.visible = false;
			this.checkingMenuItem.visible = true;
		} else {
			this.checkNowMenuItem.visible = true;
			this.checkingMenuItem.visible = false;
		}
	}

	_updateLastCheckMenu() {
		this.timeCheckedMenu.label.set_text( _("Last checked") + "  " + LAST_CHECK.toLocaleString() );
		this.timeCheckedMenu.visible = SHOW_TIMECHECKED;
	}

	_updateStatus(updatesCount) {
		updatesCount = typeof updatesCount === 'number' ? updatesCount : UPDATES_PENDING;
		if (updatesCount > 0) {
			// Updates pending
				this._setIndicatorIcon(ICON_NAMES.UPDATES);
			this._updateMenuExpander( true, __( "%d update pending", "%d updates pending", updatesCount ).format(updatesCount) );
			this.label.set_text(updatesCount.toString());
			if (NOTIFY && UPDATES_PENDING < updatesCount) {
				if (HOWMUCH > 0) {
					let updateList = [];
					if (HOWMUCH > 1) {
						updateList = this._updateList;
					} else {
						// Keep only packets that was not in the previous notification
						updateList = this._updateList.filter(function(pkg) { return UPDATES_LIST.indexOf(pkg) < 0 });
					}
					// Filter out titles and whatnot
					if (!DISABLE_PARSING) {
						updateList = updateList.filter(function(line) { return RE_UpdateLine.test(line) });
					}
					// If version numbers should be stripped, do it
					if (STRIP_VERSIONS_N == true) {
						updateList = updateList.map(function(p) {
							// Try to keep only what's before the first space
							var chunks = p.split(" ",2);
							return chunks[0];
						});
					}
				if (updateList.length > 0) {
						// Show notification only if there's new updates
						this._showNotification(
							__( "New Gentoo Update", "New Gentoo Updates", updateList.length ),
							updateList.join(', ')
						);
						if (AUTO_OPEN_TERMINAL && UPDATES_PENDING < updatesCount) {
							this._updateNow();
						}
					}
				} else {
					this._showNotification(
						__( "New Gentoo Update", "New Gentoo Updates", updatesCount ),
						__( "There is %d update pending", "There are %d updates pending", updatesCount ).format(updatesCount)
					);
					if (AUTO_OPEN_TERMINAL && UPDATES_PENDING < updatesCount) {
						this._updateNow();
					}
				}
			}
			// Store the new list
			UPDATES_LIST = this._updateList;
		} else {
			this.label.set_text('');
			if (updatesCount == -1) {
				// Unknown
				this._setIndicatorIcon(ICON_NAMES.UNKNOWN);
				this._updateMenuExpander( false, '' );
			} else if (updatesCount == -2) {
					// Error
					this._setIndicatorIcon(ICON_NAMES.ERROR);
					this._updateMenuExpander( false, _('Error') + "\n" + this.lastUnknowErrorString );
			} else {
				// Up to date
					this._setIndicatorIcon(ICON_NAMES.UPTODATE);
				this._updateMenuExpander( false, _('Up to date :)') );
				UPDATES_LIST = []; // Reset stored list
			}
		}
		UPDATES_PENDING = updatesCount;
		this._checkAutoExpandList();
		this._checkShowHide();
	}

	_updateMenuExpander(enabled, label) {
		if (label == "") {
			// No text, hide the menuitem
			this.menuExpander.visible = false;
		} else {
		// We make our expander look like a regular menu label if disabled
			this.menuExpander.reactive = enabled;
			this.menuExpander._triangle.visible = enabled;
			this.menuExpander.label.set_text(label);
			this.menuExpander.visible = true;
			if (enabled && this._updateList.length > 0) {
				this.menuExpanderContainer.destroy_all_children();
				this._updateList.forEach( item => {
					if(DISABLE_PARSING) {
						var menutext = item;
						if (STRIP_VERSIONS) {
							var chunks = menutext.split(" ",2);
							menutext = chunks[0];
						}
						this.menuExpanderContainer.add_child( this._createPackageLabel(menutext) );
					} else {
						let matches = item.match(RE_UpdateLine);
						if (matches == null) {
							// Not an update
							this.menuExpanderContainer.add_child( new St.Label({ text: item, style_class: 'gentoo-updates-update-title' }) );
						} else {
							let hBox = new St.BoxLayout({ vertical: false, style_class: 'gentoo-updates-update-line' });
							hBox.add_child( this._createPackageLabel(matches[1]) );
							if (!STRIP_VERSIONS) {
								hBox.add_child( new St.Label({
									text: matches[2] + " → ",
									y_expand: true,
									y_align: Clutter.ActorAlign.CENTER,
									style_class: 'gentoo-updates-update-version-from' }) );
								hBox.add_child( new St.Label({
									text: matches[3],
									style_class: 'gentoo-updates-update-version-to' }) );
							}
							this.menuExpanderContainer.add_child( hBox );
						}
					}
				} );
			}
		}
		// 'Update now' visibility is linked so let's save a few lines and set it here
		this.updateNowMenuItem.reactive = enabled;
		// Seems that's not done anymore by PopupBaseMenuItem after init, so let's update inactive styling
		if ( this.updateNowMenuItem.reactive ) {
			this.updateNowMenuItem.remove_style_class_name('popup-inactive-menu-item');
		} else {
			this.updateNowMenuItem.add_style_class_name('popup-inactive-menu-item');
		}
		if ( this.menuExpander.reactive ) {
			this.menuExpander.remove_style_class_name('popup-inactive-menu-item');
		} else {
			this.menuExpander.add_style_class_name('popup-inactive-menu-item');
		}
	}

	_createPackageLabel(name) {
		if (PACKAGE_INFO_CMD) {
			let label = new St.Label({
				text: name,
				x_expand: true,
					style_class: LINKIFY_MENU ? 'gentoo-updates-update-name-link': 'gentoo-updates-update-name'
			});
			let button = new St.Button({
				child: label,
				x_expand: true
			});
			button.connect('clicked', this._packageInfo.bind(this, name));
			return button;
		} else {
			return new St.Label({
				text: name,
				x_expand: true,
					style_class: 'gentoo-updates-update-name'
			});
		}
	}

	_packageInfo(item) {
		// Gentoo: open packages.gentoo.org for the package atom
		this.menu.close();
		let command = PACKAGE_INFO_CMD.format(item, "", "");
		Util.spawnCommandLine(command);
	}

	_checkUpdates() {
		// Remove timer if any (in case the trigger was menu or external)
		if (this._TimeoutId) { GLib.source_remove(this._TimeoutId) ; this._TimeoutId = null }
		if(this._updateProcess_sourceId) {
			// A check is already running ! Maybe we should kill it and run another one ?
			return;
		}
		// Run asynchronously, to avoid  shell freeze - even for a 1s check
		this._showChecking(true);
		try {
			// Parse check command line
			let [parseok, argvp] = GLib.shell_parse_argv( CHECK_CMD );
			if (!parseok) { throw 'Parse error' };
			let [res, pid, in_fd, out_fd, err_fd]  = GLib.spawn_async_with_pipes(null, argvp, null, GLib.SpawnFlags.DO_NOT_REAP_CHILD, null);
			// Let's buffer the command's output - that's a input for us !
			this._updateProcess_stream = new Gio.DataInputStream({
				base_stream: new GioUnix.InputStream({fd: out_fd})
			});
			// We will process the output at once when it's done
			this._updateProcess_sourceId = GLib.child_watch_add(0, pid, () => {this._checkUpdatesRead()} );
			this._updateProcess_pid = pid;
		} catch (err) {
			this._showChecking(false);
			this.lastUnknowErrorString = err.message.toString();
			this._updateStatus(-2);
		}
		// Update last check (start) time and schedule next check even if the current one is not done yet
		// doing so makes sure it will be scheduled even if failed or canceled, and we don't end in
		// a looping test
		LAST_CHECK = new Date();
		this._updateLastCheckMenu();
		this._scheduleCheck();
	}

	_cancelCheck() {
		if (this._updateProcess_pid == null) { return; };
		Util.spawnCommandLine( "kill " + this._updateProcess_pid );
		this._updateProcess_pid = null; // Prevent double kill
		this._checkUpdatesEnd();
	}

	_checkUpdatesRead() {
		// Read the buffered output
		let updateList = [];
		let out, size;
		do {
			[out, size] = this._updateProcess_stream.read_line_utf8(null);
			if (out) updateList.push(out);
		} while (out);
		this._updateList = updateList;
		this._checkUpdatesEnd();
	}

	_checkUpdatesEnd() {
		// Free resources
		this._updateProcess_stream.close(null);
		this._updateProcess_stream = null;
		GLib.source_remove(this._updateProcess_sourceId);
		this._updateProcess_sourceId = null;
		this._updateProcess_pid = null;
		// Update indicator
		this._showChecking(false);
		if (DISABLE_PARSING) {
			this._updateStatus(this._updateList.length);
		} else {
			this._updateStatus(this._updateList.filter(function(line) { return RE_UpdateLine.test(line) }).length);
		}
	}

	_showNotification(title, message) {
		// Destroy previous notification if still there
		if (this._notification) {
			this._notification.destroy(MessageTray.NotificationDestroyedReason.REPLACED);
		}
		// Prepare a notification Source with our name and icon
		// It looks like notification Sources are destroyed when empty so we check every time
		if (this._notifSource == null) {
			// We have to prepare this only once
			this._notifSource = new MessageTray.Source({
				title: this._extension.metadata.name.toString(),
					icon: this._getCustIcon(ICON_NAMES.NOTIFICATION_SOURCE),
			});
			// Take care of not leaving unneeded sources
			this._notifSource.connect('destroy', ()=>{this._notifSource = null;});
			Main.messageTray.add(this._notifSource);
		}
		// Creates a new notification
		this._notification = new MessageTray.Notification({
			source: this._notifSource,
			title: title,
			body: message
		});
		this._notification.gicon = this._getCustIcon(ICON_NAMES.UPDATES);
		this._notification.addAction( _('Update now') , ()=>{this._updateNow();} );
		this._notification.connect('destroy', ()=>{this._notification = null;});
		this._notifSource.addNotification(this._notification);
	}

	_syncNow() {
		Util.spawnCommandLine(SYNC_CMD);
	}

	_rebuildNow() {
		Util.spawnCommandLine(this.REBUILD_CMD);
	}
});
