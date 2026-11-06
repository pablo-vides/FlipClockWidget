// SPDX-License-Identifier: GPL-2.0-or-later
import Cairo from 'gi://cairo';
import GLib from 'gi://GLib';
import St from 'gi://St';
import {Extension} from 'resource:///org/gnome/shell/extensions/extension.js';
import * as Main from 'resource:///org/gnome/shell/ui/main.js';

const FLIP_DUR = 0.6;
const GAP_IN = 0.04;
const GAP_GRP = 0.18;
const ASPECT = 0.75;
const TOTAL = 4 * ASPECT + 2 * GAP_IN + GAP_GRP;

class Tile {
    constructor() {
        this.cur = ' ';
        this.prev = ' ';
        this.t0 = -100;
    }

    set(ch, now) {
        if (ch !== this.cur) {
            this.prev = this.cur;
            this.cur = ch;
            this.t0 = now;
        }
    }
}

function roundedRect(cr, x, y, w, h, r) {
    cr.newSubPath();
    cr.arc(x + w - r, y + r, r, -Math.PI / 2, 0);
    cr.arc(x + w - r, y + h - r, r, 0, Math.PI / 2);
    cr.arc(x + r, y + h - r, r, Math.PI / 2, Math.PI);
    cr.arc(x + r, y + r, r, Math.PI, 1.5 * Math.PI);
    cr.closePath();
}

function drawHalf(cr, x, y, w, h, ch, top) {
    const hh = h / 2;
    cr.save();
    cr.rectangle(x, top ? y : y + hh, w, hh);
    cr.clip();
    roundedRect(cr, x, y, w, h, h * 0.07);
    const shade = top ? 0.125 : 0.105;
    cr.setSourceRGB(shade, shade, shade);
    cr.fill();
    if (ch.trim() !== '') {
        cr.selectFontFace('Sans', Cairo.FontSlant.NORMAL, Cairo.FontWeight.BOLD);
        cr.setFontSize(h * 0.80);
        const e0 = cr.textExtents('0');
        const e = cr.textExtents(ch);
        cr.moveTo(
            x + w / 2 - (e.xBearing + e.width / 2),
            y + h / 2 - (e0.yBearing + e0.height / 2));
        cr.setSourceRGB(0.86, 0.86, 0.86);
        cr.showText(ch);
    }
    cr.restore();
}

function drawTile(cr, x, y, w, h, tile, now) {
    const p = (now - tile.t0) / FLIP_DUR;
    const mid = y + h / 2;
    if (p >= 1) {
        drawHalf(cr, x, y, w, h, tile.cur, true);
        drawHalf(cr, x, y, w, h, tile.cur, false);
    } else {
        drawHalf(cr, x, y, w, h, tile.cur, true);
        drawHalf(cr, x, y, w, h, tile.prev, false);
        cr.save();
        cr.translate(0, mid);
        if (p < 0.5) {
            cr.scale(1, Math.max(0.001, 1 - p * 2));
            cr.translate(0, -mid);
            drawHalf(cr, x, y, w, h, tile.prev, true);
        } else {
            cr.scale(1, Math.max(0.001, (p - 0.5) * 2));
            cr.translate(0, -mid);
            drawHalf(cr, x, y, w, h, tile.cur, false);
        }
        cr.restore();
    }
    cr.setSourceRGB(0, 0, 0);
    cr.rectangle(x, mid - h * 0.006, w, h * 0.012);
    cr.fill();
}

export default class FlipClockExtension extends Extension {
    enable() {
        this._settings = this.getSettings();
        this._tiles = [new Tile(), new Tile(), new Tile(), new Tile()];
        this._last = '';
        this._loopId = 0;
        this._relayoutId = 0;

        this._area = new St.DrawingArea({reactive: false});
        this._area.connect('repaint', () => this._draw());
        Main.layoutManager._backgroundGroup.add_child(this._area);

        this._settingsId = this._settings.connect('changed', () => this._relayout());
        this._monitorsId = Main.layoutManager.connect('monitors-changed', () => {
            if (this._relayoutId)
                GLib.Source.remove(this._relayoutId);
            this._relayoutId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, 500, () => {
                this._relayoutId = 0;
                this._relayout();
                return GLib.SOURCE_REMOVE;
            });
        });

        this._update(true);
        this._relayout();
        this._loop();
    }

    disable() {
        if (this._loopId) {
            GLib.Source.remove(this._loopId);
            this._loopId = 0;
        }
        if (this._relayoutId) {
            GLib.Source.remove(this._relayoutId);
            this._relayoutId = 0;
        }
        if (this._monitorsId) {
            Main.layoutManager.disconnect(this._monitorsId);
            this._monitorsId = 0;
        }
        if (this._settingsId) {
            this._settings.disconnect(this._settingsId);
            this._settingsId = 0;
        }
        this._area?.destroy();
        this._area = null;
        this._settings = null;
        this._tiles = null;
    }

    _relayout() {
        if (!this._area)
            return;
        const mons = Main.layoutManager.monitors;
        if (!mons.length)
            return;
        const s = this._settings;
        const idx = Math.min(Math.max(s.get_int('monitor'), 0), mons.length - 1);
        const m = mons[idx];

        const w = Math.round(m.width * s.get_int('size') / 100);
        const h = Math.round(w / TOTAL);
        let x = Math.round(m.x + m.width * s.get_int('pos-x') / 100 - w / 2);
        let y = Math.round(m.y + m.height * s.get_int('pos-y') / 100 - h / 2);
        x = Math.max(m.x, Math.min(x, m.x + m.width - w));
        y = Math.max(m.y, Math.min(y, m.y + m.height - h));

        this._area.set_size(w, h);
        this._area.set_position(x, y);
        // asegurarse de que queda por encima del fondo de pantalla
        Main.layoutManager._backgroundGroup.set_child_above_sibling(this._area, null);
        this._area.queue_repaint();
    }

    _update(first = false) {
        const dt = GLib.DateTime.new_now_local();
        const use24 = this._settings.get_boolean('use-24h');
        let hour = dt.get_hour();
        if (!use24)
            hour = hour % 12 || 12;
        let hs = String(hour).padStart(2, '0');
        if (!use24 && hs[0] === '0')
            hs = ` ${hs[1]}`;
        const text = hs + String(dt.get_minute()).padStart(2, '0');
        if (text === this._last)
            return;
        const now = GLib.get_monotonic_time() / 1e6;
        for (let i = 0; i < 4; i++) {
            if (first || this._last === '') {
                this._tiles[i].cur = this._tiles[i].prev = text[i];
            } else {
                this._tiles[i].set(text[i], now);
            }
        }
        this._last = text;
    }

    _loop() {
        this._loopId = 0;
        if (!this._area)
            return;
        this._update();
        const now = GLib.get_monotonic_time() / 1e6;
        const animating = this._tiles.some(t => now - t.t0 < FLIP_DUR + 0.1);
        if (animating)
            this._area.queue_repaint();
        this._loopId = GLib.timeout_add(GLib.PRIORITY_DEFAULT, animating ? 33 : 250, () => {
            this._loop();
            return GLib.SOURCE_REMOVE;
        });
        GLib.Source.set_name_by_id(this._loopId, '[flip-clock-widget] loop');
    }

    _draw() {
        const cr = this._area.get_context();
        const [w, h] = this._area.get_surface_size();
        const tw = h * ASPECT;
        const x0 = (w - TOTAL * h) / 2;
        const xs = [
            x0,
            x0 + tw + GAP_IN * h,
            x0 + 2 * tw + (GAP_IN + GAP_GRP) * h,
            x0 + 3 * tw + (2 * GAP_IN + GAP_GRP) * h,
        ];
        const now = GLib.get_monotonic_time() / 1e6;
        for (let i = 0; i < 4; i++)
            drawTile(cr, xs[i], 0, tw, h, this._tiles[i], now);
        cr.$dispose();
    }
}
