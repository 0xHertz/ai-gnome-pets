import GObject from "gi://GObject";
import St from "gi://St";
import Clutter from "gi://Clutter";
import GLib from "gi://GLib";
import * as Main from "resource:///org/gnome/shell/ui/main.js";

import {
  AIService,
  buildSystemPrompt,
  buildContextMessage,
} from "./ai-service.js";
import { PetConfigManager } from "./pet-config.js";

export class ConversationManager {
  constructor(settings, petManager) {
    this._settings = settings;
    this._petManager = petManager;
    this._aiService = new AIService(settings);
    this._petConfigManager = new PetConfigManager(settings);
    this._conversationHistory = {};
    this._isEnabled = false;
    this._currentChatPet = null;
    this._inputActor = null;
    this._inputField = null;
    this._activePetPair = null;
    this._ownerParticipating = false;
    this._inputBubbleFollowPet = true;
    this._isProcessingMessage = false;

    this._settings.connectObject(
      "changed",
      (s, key) => {
        if (key === "ai-enabled") {
          this._isEnabled = s.get_boolean("ai-enabled");
        }
      },
      this,
    );

    this._isEnabled = this._settings.get_boolean("ai-enabled");
  }

  isEnabled() {
    return this._isEnabled;
  }

  getPetConfig(petId) {
    return this._petConfigManager.getPetConfig(petId);
  }

  setPetConfig(petId, config) {
    this._petConfigManager.setPetConfig(petId, config);
  }
  initPet(petId, typeName) {
    if (!this._conversationHistory[petId]) {
      this._conversationHistory[petId] = [];
    }
    const config = this.getPetConfig(petId);
    if (!config.typeName) {
      config.typeName = typeName;
      this.setPetConfig(petId, config);
    }
  }
  triggerChat(petId) {
    this._currentChatPet = petId;
    this._showInputBubble(petId);
  }

  _showInputBubble(petId) {
    const oldInputActor = this._inputActor;
    const oldInputField = this._inputField;
    this._inputActor = null;
    this._inputField = null;
    this._inputFieldHint = null;
    this._currentChatPet = null;
    this._inputBubbleFollowPet = false;

    if (oldInputActor && oldInputActor.get_parent()) {
      oldInputActor.get_parent().remove_child(oldInputActor);
    }
    if (oldInputActor) {
      oldInputActor.destroy();
    }

    const gnomelet = this._findGnomeletByPetId(petId);
    if (!gnomelet) return;

    gnomelet.startChatting();
    this._currentChatPet = petId;
    this._inputBubbleFollowPet = true;

    const config = this.getPetConfig(petId);
    const monitor = Main.layoutManager.primaryMonitor;

    this._inputActor = new St.BoxLayout({
      x: Math.max(10, Math.min(gnomelet._x - 150, monitor.width - 320)),
      y: gnomelet._y - 50,
      width: 280,
      height: 36,
      style:
        "background-color: #ffffff; border: 3px solid #000000; border-radius: 0px;",
    });

    const entry = new St.Entry({
      text: "",
      hint_text: `跟 ${config.name} 说...`,
      x_expand: true,
      y_expand: true,
      style:
        "background-color: transparent; border: none; padding: 4px 8px; color: #000000; font-family: monospace; font-size: 14px;",
    });

    this._inputField = entry.clutter_text;
    this._inputFieldHint = entry.get_hint_actor();

    this._inputField.connect("notify::text", () => {
      if (this._inputFieldHint) {
        this._inputFieldHint.opacity = this._inputField.text ? 0 : 255;
      }
    });

    this._inputField.connect("activate", () => {
      if (this._isProcessingMessage) return;

      const text = this._inputField.get_text();
      if (text && text.trim().length > 0) {
        const message = text.trim();
        this._inputField.set_text("");
        this._isProcessingMessage = true;
        this._handleOwnerMessage(message).catch((e) => {
          console.error("Chat error:", e);
          this._isProcessingMessage = false;
        });
      }
    });

    this._inputActor.add_child(entry);
    Main.uiGroup.add_child(this._inputActor);

    this._inputField.grab_key_focus();
  }

  isCurrentChatPet(petId) {
    return this._inputActor !== null && this._currentChatPet === petId;
  }

  closeCurrentChat() {
    if (this._inputActor) {
      const gnomelet = this._findGnomeletByPetId(this._currentChatPet);
      if (gnomelet) {
        gnomelet.stopChatting();
      }
      this._closeInputBubble();
    }
  }

  _closeInputBubble() {
    const oldInputActor = this._inputActor;
    this._inputActor = null;
    this._inputField = null;
    this._inputFieldHint = null;
    this._currentChatPet = null;
    this._inputBubbleFollowPet = false;

    if (oldInputActor) {
      if (oldInputActor.get_parent()) {
        oldInputActor.get_parent().remove_child(oldInputActor);
      }
      oldInputActor.destroy();
    }
  }

  updateInputBubblePosition() {
    if (
      !this._inputActor ||
      !this._currentChatPet ||
      !this._inputBubbleFollowPet
    )
      return;

    const gnomelet = this._findGnomeletByPetId(this._currentChatPet);
    if (!gnomelet) return;

    const monitor = Main.layoutManager.primaryMonitor;
    const x = Math.max(10, Math.min(gnomelet._x - 150, monitor.width - 320));
    const y = gnomelet._y - 50;

    this._inputActor.set_position(x, y);
  }

  _findGnomeletByPetId(petId) {
    const gnomelets = this._petManager._gnomelets;
    for (const g of gnomelets) {
      if (g._petId === petId) {
        return g;
      }
    }
    return null;
  }

  async _handleOwnerMessage(message) {
    const petId = this._currentChatPet;
    if (!petId) {
      return;
    }

    this._closeInputBubble();

    if (this._activePetPair) {
      await this._handleOwnerInPetChat(message);
    } else {
      await this._handleOwnerToPetChat(petId, message);
    }

    this._isProcessingMessage = false;
  }

  async _handleOwnerToPetChat(petId, message) {
    const gnomelet = this._findGnomeletByPetId(petId);

    if (!gnomelet) {
      return;
    }

    gnomelet.startChatting();
    gnomelet.showBubble(message, true);

    await this._delay(1500);

    gnomelet.showLoadingBubble();

    const result = await this.sendMessage(petId, message);

    if (result.success) {
      gnomelet.showBubble(result.response, false);
    } else {
      gnomelet.showBubble(`错误: ${result.error}`, false);
    }

    await this._delay(3000);
    gnomelet.stopChatting();

    this._petConfigManager.addMemory(petId, "owner", message);
    if (result.success) {
      this._petConfigManager.addMemory(petId, "owner", result.response);
    }
  }

  async _handleOwnerInPetChat(message) {
    const { pet1, pet2, chatHistory } = this._activePetPair;
    const gnomelet1 = this._findGnomeletByPetId(pet1);
    const gnomelet2 = this._findGnomeletByPetId(pet2);

    chatHistory.push({ role: "user", content: message });

    gnomelet1.showBubble(message, true);

    await this._delay(1500);

    const config1 = this.getPetConfig(pet1);
    const systemPrompt = buildSystemPrompt(
      config1,
      config1.name,
      config1.typeName,
    );
    const context = buildContextMessage(chatHistory, message);

    gnomelet1.showLoadingBubble();
    const result = await this._aiService.chat(
      context,
      systemPrompt,
      config1.name,
    );

    if (result.success) {
      chatHistory.push({ role: "assistant", content: result.response });
      gnomelet1.showBubble(result.response, false);

      await this._delay(2000);

      await this._petRespondInChat(
        pet2,
        result.response,
        gnomelet2,
        chatHistory,
      );

      // 保存记忆（主人参与的对话，只保存到pet1）
      this._petConfigManager.addMemory(pet1, "owner", message);
      this._petConfigManager.addMemory(pet1, "owner", result.response);
    }

    await this._delay(3000);
    gnomelet1.stopChatting();
    gnomelet2.stopChatting();
    this._activePetPair = null;
  }

  async _petRespondInChat(petId, previousMessage, gnomelet, chatHistory) {
    const config = this.getPetConfig(petId);
    const systemPrompt = buildSystemPrompt(
      config,
      config.name,
      config.typeName,
    );
    const prompt = `${config.name} responds to ${previousMessage}.`;

    gnomelet.showLoadingBubble();
    const result = await this._aiService.chat(
      prompt,
      systemPrompt,
      config.name,
    );

    if (result.success) {
      chatHistory.push({ role: "assistant", content: result.response });
      gnomelet.showBubble(result.response, false);
    }
  }

  async sendMessage(petId, message) {
    const config = this.getPetConfig(petId);

    const systemPrompt = buildSystemPrompt(
      config,
      config.name,
      config.typeName,
    );

    if (!this._conversationHistory[petId]) {
      this._conversationHistory[petId] = [];
    }
    const context = buildContextMessage(
      this._conversationHistory[petId],
      message,
    );

    try {
      const result = await this._aiService.chat(
        context,
        systemPrompt,
        config.name,
      );

      if (result.success) {
        this._conversationHistory[petId].push({
          role: "user",
          content: message,
        });
        this._conversationHistory[petId].push({
          role: "assistant",
          content: result.response,
        });
        return { success: true, response: result.response };
      }
      return { success: false, error: result.error };
    } catch (e) {
      console.error(`[AI Chat] Exception in sendMessage:`, e);
      return { success: false, error: e.message };
    }
  }

  async triggerPetInteraction() {
    if (!this._isEnabled) return;

    if (this._activePetPair !== null) {
      return;
    }

    const gnomelets = this._petManager._gnomelets;
    for (const g of gnomelets) {
      if (g.isChatting()) {
        return;
      }
    }

    const configs = this._petConfigManager.getConfigs();
    const petIds = Object.keys(configs);

    if (petIds.length < 2) return;

    const shuffled = petIds.sort(() => Math.random() - 0.5);
    const pet1 = shuffled[0];
    const pet2 = shuffled[1];

    await this._startPetChat(pet1, pet2);
  }

  async _startPetChat(pet1Id, pet2Id) {
    const gnomelet1 = this._findGnomeletByPetId(pet1Id);
    const gnomelet2 = this._findGnomeletByPetId(pet2Id);

    if (!gnomelet1 || !gnomelet2) return;

    gnomelet1.startChatting(true);
    gnomelet2.startChatting(true);

    const config1 = this.getPetConfig(pet1Id);
    const config2 = this.getPetConfig(pet2Id);

    const chatHistory = [];
    this._activePetPair = {
      pet1: pet1Id,
      pet2: pet2Id,
      chatHistory: chatHistory,
    };

    const greeting = `${config1.name} sees ${config2.name} nearby and wants to say hello.`;

    const systemPrompt1 = buildSystemPrompt(
      config1,
      config1.name,
      config1.typeName,
    );
    gnomelet1.showLoadingBubble();
    const result1 = await this._aiService.chat(
      greeting,
      systemPrompt1,
      config1.name,
    );

    if (result1.success) {
      chatHistory.push({ role: "assistant", content: result1.response });
      gnomelet1.showBubble(result1.response, false);

      await this._delay(2000);

      await this._petRespondInChat(
        pet2Id,
        result1.response,
        gnomelet2,
        chatHistory,
      );
    }

    await this._delay(3000);
    gnomelet1.stopChatting();
    gnomelet2.stopChatting();

    // 保存宠物对话记忆（双方都保存）
    for (const msg of chatHistory) {
      if (msg.role === "assistant") {
        this._petConfigManager.addMemory(
          pet1Id,
          "pet_pair",
          msg.content,
          pet2Id,
        );
        this._petConfigManager.addMemory(
          pet2Id,
          "pet_pair",
          msg.content,
          pet1Id,
        );
      }
    }

    this._activePetPair = null;
  }

  async _petRespondInChat(petId, previousMessage, gnomelet, chatHistory) {
    const config = this.getPetConfig(petId);
    const systemPrompt = buildSystemPrompt(
      config,
      config.name,
      config.typeName,
    );
    const prompt = `${config.name} responds to ${previousMessage}.`;

    const result = await this._aiService.chat(
      prompt,
      systemPrompt,
      config.name,
    );

    if (result.success) {
      chatHistory.push({ role: "assistant", content: result.response });
      gnomelet.showBubble(result.response, false);
    }
  }

  async petToPetChat(petId1, petId2, initiatorMessage = null) {
    const config1 = this.getPetConfig(petId1);
    const config2 = this.getPetConfig(petId2);

    const prompt1 =
      initiatorMessage ||
      `${config1.name} sees ${config2.name} nearby and wants to say hello. Generate a greeting.`;
    const prompt2 = `${config2.name} responds to ${config1.name}'s greeting naturally.`;

    const systemPrompt1 = buildSystemPrompt(
      config1,
      config1.name,
      config1.typeName,
    );
    const systemPrompt2 = buildSystemPrompt(
      config2,
      config2.name,
      config2.typeName,
    );

    const result1 = await this._aiService.chat(
      prompt1,
      systemPrompt1,
      config1.name,
    );

    if (result1.success) {
      const result2 = await this._aiService.chat(
        prompt2 + ` The other pet said: "${result1.response}"`,
        systemPrompt2,
        config2.name,
      );
      return {
        success: true,
        exchange: [
          { petId: petId1, message: result1.response },
          { petId: petId2, message: result2.success ? result2.response : null },
        ],
      };
    }
    return { success: false, error: result1.error };
  }

  clearHistory(petId) {
    if (this._conversationHistory[petId]) {
      this._conversationHistory[petId] = [];
    }
  }

  getHistory(petId) {
    return this._conversationHistory[petId] || [];
  }

  showNotification(petId, message) {
    const gnomelet = this._findGnomeletByPetId(petId);
    if (gnomelet) {
      gnomelet.showBubble(message, false);
    }
  }

  _delay(ms) {
    return new Promise((resolve) =>
      GLib.timeout_add(GLib.PRIORITY_DEFAULT, ms, resolve),
    );
  }

  destroy() {
    this._closeInputBubble();
    this._activePetPair = null;
  }
}
