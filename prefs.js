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

import Gio from "gi://Gio";
import Gtk from 'gi://Gtk';

import {ExtensionPreferences} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js"

export default class GentooUpdatePreferences extends ExtensionPreferences {

	fillPreferencesWindow(window) {
		// Prepare labels and controls
		let buildable = new Gtk.Builder();
		buildable.add_from_file( this.dir.get_path() + '/prefs.xml' );

		// Fill in about page from metadata
		const iconsDir = this.dir.get_child('icons');
		const logoImage = buildable.get_object('about_logo');
		const pngLogo = iconsDir.get_child('gentoo-updates-logo.png');
		const svgLogo = iconsDir.get_child('gentoo-updates-logo.svg');
		if (pngLogo.query_exists(null))
			logoImage.set_from_file(pngLogo.get_path());
		else if (svgLogo.query_exists(null))
			logoImage.set_from_file(svgLogo.get_path());
		buildable.get_object('about_name').set_text(this.metadata.name.toString());
		const versionLabel = buildable.get_object('about_version');
		versionLabel.set_text('v0.1 (unreleased)');
		versionLabel.set_visible(true);
		buildable.get_object('about_description').set_text(this.metadata.description.toString());
		buildable.get_object('about_url').set_markup("<a href=\"" + this.metadata.url.toString() + "\">" + this.metadata.url.toString() + "</a>");

		// Bind fields to settings
		let settings = this.getSettings();
		settings.bind('boot-wait' , buildable.get_object('field_wait') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('check-interval' , buildable.get_object('field_interval') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('always-visible' , buildable.get_object('field_visible') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-count' , buildable.get_object('field_count') , 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('notify' , buildable.get_object('field_notify') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('howmuch', buildable.get_object('field_howmuch'), 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('strip-versions' , buildable.get_object('field_stripversions') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('strip-versions-in-notification' , buildable.get_object('field_stripversionsnotifications') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('check-cmd' , buildable.get_object('field_checkcmd') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('disable-parsing', buildable.get_object('field_disableparsing'), 'active', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('update-cmd' , buildable.get_object('field_updatecmd') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('portage-dir' , buildable.get_object('field_portagedir') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('auto-expand-list', buildable.get_object('field_autoexpandlist'), 'value', Gio.SettingsBindFlags.DEFAULT);
		settings.bind('package-manager' , buildable.get_object('field_packagemanager') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('auto-open-terminal' , buildable.get_object('field_autoopenterminal') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-cmd' , buildable.get_object('field_synccmd') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-schedule-enabled' , buildable.get_object('field_sync_enabled') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-interval-value' , buildable.get_object('field_sync_value') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-interval-unit' , buildable.get_object('field_sync_unit') , 'active-id' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-fixed-enabled' , buildable.get_object('field_sync_fixed_enabled') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-fixed-hour' , buildable.get_object('field_sync_fixed_hour') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('sync-fixed-minute' , buildable.get_object('field_sync_fixed_minute') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('preferred-terminal' , buildable.get_object('field_preferred_terminal') , 'active-id' , Gio.SettingsBindFlags.DEFAULT);

		// Update command templates when preferred terminal changes (unless custom)
		const updateEntry = buildable.get_object('field_updatecmd');
		const syncEntry = buildable.get_object('field_synccmd');
		const termCombo = buildable.get_object('field_preferred_terminal');

		function buildUpdateCmd(term) {
			switch (term) {
				case 'tilix': return "tilix -e /bin/sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\"";
				case 'terminator': return "terminator -e \"/bin/sh -c 'sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _'\"";
				case 'kitty': return "kitty -e /bin/sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\"";
				case 'alacritty': return "alacritty -e /bin/sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\"";
				case 'foot': return "foot -e sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\"";
				case 'gnome-terminal':
				default:
					return "gnome-terminal -- /bin/sh -c \"sudo emerge -avuDN @world ; echo Done - Press enter to exit; read _\"";
			}
		}
		function buildSyncCmd(term) {
			switch (term) {
				case 'tilix': return "tilix -e /bin/sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\"";
				case 'terminator': return "terminator -e \"/bin/sh -c 'sudo emaint sync -a ; echo Done - Press enter to exit; read _'\"";
				case 'kitty': return "kitty -e /bin/sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\"";
				case 'alacritty': return "alacritty -e /bin/sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\"";
				case 'foot': return "foot -e sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\"";
				case 'gnome-terminal':
				default:
					return "gnome-terminal -- /bin/sh -c \"sudo emaint sync -a ; echo Done - Press enter to exit; read _\"";
			}
		}

		termCombo.connect('changed', () => {
			let term = termCombo.active_id;
			if (term === 'custom') return;
			updateEntry.set_text(buildUpdateCmd(term));
			syncEntry.set_text(buildSyncCmd(term));
		});
		settings.bind('enable-positioning' , buildable.get_object('field_enablepositioning') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('enable-positioning' , buildable.get_object('box_position') , 'sensitive' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('position' , buildable.get_object('field_position') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('position-number' , buildable.get_object('field_positionnumber') , 'value' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('package-info-cmd' , buildable.get_object('field_packageinfocmd') , 'text' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('linkify-menu' , buildable.get_object('field_linkifymenu') , 'active' , Gio.SettingsBindFlags.DEFAULT);
		settings.bind('show-timechecked' , buildable.get_object('field_showtimechecked') , 'active' , Gio.SettingsBindFlags.DEFAULT);

		// Pref window layout
		window.search_enabled = true;
		window.add( buildable.get_object('page_basic') );
		window.add( buildable.get_object('page_advanced') );
		window.add( buildable.get_object('page_about') );
	}

}
