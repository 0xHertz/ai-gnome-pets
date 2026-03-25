import * as Main from "resource:///org/gnome/shell/ui/main.js";
import GLib from "gi://GLib";
import { Extension } from "resource:///org/gnome/shell/extensions/extension.js";

import { GnomeletManager } from "./manager.js";
import { GnomeletIndicator } from "./indicator.js";
import { ConversationManager } from "./conversation.js";

/**
 * Extension Entry Point
 */
export default class DesktopGnomeletsExtension extends Extension {
  enable() {
    this._settings = this.getSettings();
    this._manager = new GnomeletManager(this._settings);

    this._conversationManager = new ConversationManager(
      this._settings,
      this._manager,
    );
    this._manager.setConversationManager(this._conversationManager);

    this._manager.enable();

    this._indicator = null;
    this._settings.connectObject(
      "changed::show-indicator",
      () => this._updateIndicator(),
      this,
    );

    this._updateIndicator();

    this._setupInteraction();
  }

  disable() {
    if (this._indicator) {
      this._indicator.destroy();
      this._indicator = null;
    }

    if (this._manager) {
      this._manager.disable();
      this._manager = null;
    }

    if (this._conversationManager) {
      this._conversationManager.destroy();
      this._conversationManager = null;
    }

    if (this._settings) {
      this._settings.disconnectObject(this);
      this._settings = null;
    }
  }

  _setupInteraction() {
    if (!this._conversationManager.isEnabled()) {
      return;
    } else {
      this._conversationManager.triggerPetInteraction();
    }
  }

  _updateIndicator() {
    let show = this._settings.get_boolean("show-indicator");
    if (show) {
      if (!this._indicator) {
        this._indicator = new GnomeletIndicator(
          this,
          this._conversationManager,
        );
        Main.panel.addToStatusArea("gnomelets-indicator", this._indicator);
      }
    } else {
      if (this._indicator) {
        this._indicator.destroy();
        this._indicator = null;
      }
    }
  }
}
