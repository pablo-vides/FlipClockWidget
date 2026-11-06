// SPDX-License-Identifier: GPL-2.0-or-later
import Adw from 'gi://Adw';
import Gdk from 'gi://Gdk';
import Gio from 'gi://Gio';
import Gtk from 'gi://Gtk';
import {ExtensionPreferences} from 'resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js';

export default class FlipClockPrefs extends ExtensionPreferences {
    fillPreferencesWindow(window) {
        const settings = this.getSettings();
        const page = new Adw.PreferencesPage();
        const group = new Adw.PreferencesGroup({title: 'Flip Clock'});
        page.add(group);
        window.add(page);

        // Monitor
        const model = Gdk.Display.get_default().get_monitors();
        const names = new Gtk.StringList();
        const n = model.get_n_items();
        for (let i = 0; i < n; i++) {
            const m = model.get_item(i);
            const g = m.get_geometry();
            names.append(`Monitor ${i}: ${m.get_connector() ?? ''} (${g.width}×${g.height})`);
        }
        const monitorRow = new Adw.ComboRow({
            title: 'Monitor',
            subtitle: 'If the numbers look swapped, pick the other one',
            model: names,
            selected: Math.min(settings.get_int('monitor'), Math.max(n - 1, 0)),
        });
        monitorRow.connect('notify::selected', () =>
            settings.set_int('monitor', monitorRow.selected));
        group.add(monitorRow);

        const spin = (title, key, lower, upper) => {
            const row = new Adw.SpinRow({
                title,
                adjustment: new Gtk.Adjustment({
                    lower, upper, step_increment: 1, page_increment: 5,
                    value: settings.get_int(key),
                }),
            });
            settings.bind(key, row, 'value', Gio.SettingsBindFlags.DEFAULT);
            group.add(row);
        };
        spin('Size (% of monitor width)', 'size', 10, 100);
        spin('Horizontal position (%)', 'pos-x', 0, 100);
        spin('Vertical position (%)', 'pos-y', 0, 100);

        const hours = new Adw.SwitchRow({title: '24-hour format'});
        settings.bind('use-24h', hours, 'active', Gio.SettingsBindFlags.DEFAULT);
        group.add(hours);
    }
}
