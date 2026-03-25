import GObject from 'gi://GObject';
import St from 'gi://St';
import Gio from 'gi://Gio';
import * as PanelMenu from 'resource:///org/gnome/shell/ui/panelMenu.js';
import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';

export const GnomeletIndicator = GObject.registerClass(
    class GnomeletIndicator extends PanelMenu.Button {
        _init(extension, conversationManager) {
            super._init(0.0, 'Gnomelets Indicator');

            this._extension = extension;
            this._manager = extension._manager;
            this._conversationManager = conversationManager;

            let iconPath = extension.dir.get_child('images').get_child('icon.png');
            let gicon = new Gio.FileIcon({ file: iconPath });
            let icon = new St.Icon({
                gicon: gicon,
                style_class: 'system-status-icon',
            });
            this.add_child(icon);

            this._extension._settings.connectObject('changed', (settings, key) => {
                if (key === 'is-enabled') {
                    this._updateToggleLabel();
                }
            }, this);

            this._addMenuItems();
            this._updateToggleLabel();
        }

        _addMenuItems() {
            this.menu.removeAll();

            this.respawnItem = new PopupMenu.PopupMenuItem('Re-spawn Gnomelets');
            this.respawnItem.connectObject('activate', () => {
                this._manager._hardReset();
            }, this);
            this.menu.addMenuItem(this.respawnItem);

            this.toggleItem = new PopupMenu.PopupMenuItem('');
            this.toggleItem.connectObject('activate', () => {
                this._manager.toggleVisualization();
            }, this);
            this.menu.addMenuItem(this.toggleItem);

            this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());

            if (this._conversationManager && this._conversationManager.isEnabled()) {
                const interactItem = new PopupMenu.PopupMenuItem('🐾 Trigger Pet Chat');
                interactItem.connectObject('activate', () => {
                    this._conversationManager.triggerPetInteractionNow();
                }, this);
                this.menu.addMenuItem(interactItem);

                const hintItem = new PopupMenu.PopupMenuItem('💡 Double-click pet to chat');
                hintItem.sensitive = false;
                this.menu.addMenuItem(hintItem);

                this.menu.addMenuItem(new PopupMenu.PopupSeparatorMenuItem());
            }

            this.settingsItem = new PopupMenu.PopupMenuItem('Settings');
            this.settingsItem.connectObject('activate', () => {
                this._extension.openPreferences();
            }, this);
            this.menu.addMenuItem(this.settingsItem);
        }

        _updateToggleLabel() {
            if (this._manager.isVisualizationEnabled) {
                this.toggleItem.label.text = 'Disable Gnomelets';
            } else {
                this.toggleItem.label.text = 'Enable Gnomelets';
            }
        }

        destroy() {
            this._extension._settings.disconnectObject(this);
            super.destroy();
        }
    });
