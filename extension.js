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

import Gio from 'gi://Gio'
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
      // FIXME: Something to do with fire or heat too perhaps?
      this.add_child(
        new St.Icon({
          icon_name: 'power-profile-performance-symbolic',
          style_class: 'system-status-icon',
        }),
      )
    }

    updateFans(fanGroups) {
      this.menu.removeAll() // FIXME: Diff against the existing menu and only update changed items

      for (const fanGroup in fanGroups) {
        const fans = fanGroups[fanGroup]

        this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem(fanGroup))

        for (const fan in fans) {
          const label = fan + ': ' + fans[fan] + ' rpm'
          const menuItem = new PopupMenu.PopupImageMenuItem(
            label,
            'object-rotate-right-symbolic', // FIXME: Better icon
            { activate: false /*, can_focus: false, hover: false - Does nothing */ },
          )
          this.menu.addMenuItem(menuItem)
        }
      }
    }
  },
)

export default class FanIndicatorExtension extends Extension {
  #indicator = null
  #sensorsPath = null
  #interval = null

  // TODO: More efficient way of doing this without recreating the indicator?
  #showIndicator() {
    this.#indicator = new Indicator()
    Main.panel.addToStatusArea(this.uuid, this.#indicator)
  }

  #hideIndicator() {
    this.#indicator?.destroy()
    this.#indicator = null
  }

  #executeCommand(...argv) {
    return new Promise((resolve, reject) => {
      const proc = Gio.Subprocess.new(
        argv,
        Gio.SubprocessFlags.STDOUT_PIPE | Gio.SubprocessFlags.STDERR_PIPE,
      )

      proc.communicate_utf8_async(null, null, (proc, result) => {
        try {
          let [, stdout, stderr] = proc.communicate_utf8_finish(result)
          resolve([stdout, stderr])
        } catch (e) {
          reject(e)
        }
      })
    })
  }

  async #retrieveFanSpeeds() {
    // Execute sensors command
    const [sensorsOutput, sensorsError] = await this.#executeCommand(this.#sensorsPath, '-j')
    if (sensorsError.trim()) {
      throw new Error('error executing sensors command: ' + sensorsError.trim())
    }

    // Parse output
    const sensorGroups = JSON.parse(sensorsOutput)
    const fanGroups = {}

    // Filter down to fans only
    for (const sensorGroupName in sensorGroups) {
      const sensorGroup = sensorGroups[sensorGroupName]
      const fans = {}
      for (const sensorName in sensorGroup) {
        if (sensorName === 'Adapter') continue
        const sensor = sensorGroup[sensorName]

        // Find the sensor's fan input parameter
        for (const parameterName in sensor) {
          if (parameterName.match(/fan\d+_input/)) {
            fans[sensorName] = sensor[parameterName]
            break
          }
        }
      }

      // If there are fans in this sensor group, add it to fan groups
      if (Object.keys(fans).length > 0) {
        fanGroups[sensorGroupName] = fans
      }
    }
    return fanGroups
  }

  #retrievePowerProfile() {
    const powerProfilesIndicator = Main.panel.statusArea.quickSettings._powerProfiles
    const [powerProfilesToggle] = powerProfilesIndicator.quickSettingsItems
    // TODO: Does this actually improve performance?
    return powerProfilesToggle._proxy.ActiveProfile
  }

  async #pollFunction() {
    // Skip polling if we're not in power saver and ensure to hide indicator
    const powerProfile = this.#retrievePowerProfile()
    if (powerProfile !== 'power-saver') {
      if (this.#indicator) this.#hideIndicator()
      return
    }

    const fanGroups = await this.#retrieveFanSpeeds()
    // If any fan is over 0 RPM
    for (const fanGroupName in fanGroups) {
      const fanGroup = fanGroups[fanGroupName]
      for (const fan in fanGroup) {
        if (fanGroup[fan] > 0) {
          // Add the indicator if it's not there
          if (!this.#indicator) this.#showIndicator()
          this.#indicator.updateFans(fanGroups)
          return
        }
      }
    }

    // Else remove it
    if (this.#indicator) this.#hideIndicator()
  }

  enable() {
    // FIXME: Complete metadata.json
    this.#sensorsPath = GLib.find_program_in_path('sensors')
    this.#interval = setInterval(() => {
      this.#pollFunction().catch(console.error)
    }, 1000)
  }

  disable() {
    clearInterval(this.#interval)
    this.#hideIndicator()
  }
}
