/* extension.js
 *
 * This program is free software: you can redistribute it and/or modify
 * it under the terms of the GNU General Public License as published by
 * the Free Software Foundation, either version 2 of the License, or
 * (at your option) any later version.
 *
 * This program is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.  See the
 * GNU General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this program.  If not, see <http://www.gnu.org/licenses/>.
 *
 * SPDX-License-Identifier: GPL-2.0-or-later
 */

import GLib from 'gi://GLib'
import GObject from 'gi://GObject'
import St from 'gi://St'
import { Extension, gettext as _ } from 'resource:///org/gnome/shell/extensions/extension.js'
import * as Main from 'resource:///org/gnome/shell/ui/main.js'
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js'
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js'

const Indicator = GObject.registerClass(
  class Indicator extends PanelMenu.Button {
    _init() {
      super._init(0.0, _('System Fans Running'))

      //Adwaita/symbolic/status/dialog-warning-symbolic.svg
      //Adwaita/symbolic/status/power-profile-performance-symbolic.svg
      //Adwaita/symbolic/actions/object-rotate-right-symbolic.svg
      this.add_child(
        new St.Icon({
          icon_name: 'power-profile-performance-symbolic',
          style_class: 'system-status-icon',
        }),
      )

      let item = new PopupMenu.PopupMenuItem(_('Fan Speed: ' + 10000 + ' RPM'))
      /*item.connect('activate', () => {
            Main.notify(_('Whatʼs up, folks?'));
        });*/
      this.menu.addMenuItem(item)
    }
  },
)

export default class FanIndicatorExtension extends Extension {
  #showIndicator() {
    this._indicator = new Indicator()
    Main.panel.addToStatusArea(this.uuid, this._indicator)
  }

  #hideIndicator() {
    this.#indicator?.destroy()
    this.#indicator = null
  }

  #retrieveFanSpeeds() {
    // Execute sensors command and filter by consecutive newlines,
    // then take the first line, then filter RPMs, then remove any without RPM
    // Parse into an object et voila
  }

  #retrievePowerProfile() {
    // TODO: Maybe we can hook into the quick settings?
  }

  #pollFunction() {
    // TODO: If any fan is over 0 RPM
    // - Add the indicator if it's not there
    // - Update fan speeds inside the indicator
    // Else remove it
  }

  #execute() {
    return new Promise((resolve, reject) => {
      const proc = Gio.Subprocess.new(
        this._argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      )

      proc.communicate_utf8_async(null, null, (proc, result) => {
        try {
          let [, stdout, stderr] = proc.communicate_utf8_finish(result)

          this._output = stdout ? stdout.split('\n') : []
          this._error_output = stderr ? stderr.split('\n') : []
        } catch (e) {
          logError(e)
        } finally {
          callback()
          this._updated = true
        }
      })
    })
  }

  enable() {
    // TODO: Complete metadata.json
    this.#sensorsPath = GLib.find_program_in_path('sensors')
    this.#interval = setInterval(this.#pollFunction, 1000)

    showIndicator()
  }

  disable() {
    clearInterval(this.#interval)
    hideIndicator()
  }
}
