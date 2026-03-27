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
    this._lastPetInteractionTime = {};
    this._minCooldownMs = 2 * 60 * 1000;
    this._maxCooldownMs = 4 * 60 * 1000;
    this._nextCheckTime = 0;
    this._autoTriggerTimeout = null;

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
    const config = this.getPetConfig(petId);

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

    this._petConfigManager.addMemory(
      petId,
      "owner",
      message,
      "owner",
      "owner",
      "owner",
    );
    if (result.success) {
      this._petConfigManager.addMemory(
        petId,
        "owner",
        result.response,
        "owner",
        petId,
        config.name,
      );
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
      "mixed",
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
        null,
        null,
      );

      // 保存记忆（主人参与的对话，保存为mixed类型）
      this._petConfigManager.addMemory(pet1, "mixed", message, pet2);
      this._petConfigManager.addMemory(pet1, "mixed", result.response, pet2);
      this._petConfigManager.addMemory(pet2, "mixed", message, pet1);
      this._petConfigManager.addMemory(pet2, "mixed", result.response, pet1);
    }

    await this._delay(3000);
    gnomelet1.stopChatting();
    gnomelet2.stopChatting();
    this._activePetPair = null;
  }

  async _calculatePersonalityScore(pet1Id, pet2Id) {
    const config1 = this.getPetConfig(pet1Id);
    const config2 = this.getPetConfig(pet2Id);

    const personality1 = config1.personality || "friendly";
    const personality2 = config2.personality || "friendly";
    const like_dislike1 = config1.background || "";
    const like_dislike2 = config2.background || "";

    const systemPrompt =
      "You are an assistant that analyzes personality compatibility between two characters.";
    const prompt = `Analyze the personality compatibility between two pets:

Pet 1: ${config1.name}
Personality: ${personality1}
like and dislike: ${like_dislike1}

Pet 2: ${config2.name}
Personality: ${personality2}
like and dislike: ${like_dislike2}

Based on their information, rate how likely they are to initiate a conversation with each other.

Reply with a number from -10 to +10:
- +10: They would be very eager to talk to each other
- 0: Neutral, depends on other factors
- -10: They would be very reluctant to interact

Just reply with the number only, nothing else.`;

    try {
      const result = await this._aiService.chat(
        prompt,
        systemPrompt,
        "Analyzer",
      );
      if (result.success) {
        const response = result.response.trim();
        const score = parseInt(response, 10);
        if (!isNaN(score)) {
          return Math.max(-10, Math.min(10, score));
        }
      }
    } catch (e) {
      console.error("Failed to calculate personality score:", e);
    }
    return 0;
  }

  _calculateTriggerScore(pet1Id, pet2Id, personalityScore = 0) {
    let memoryScore = 0;
    let proximityScore = 15;
    let idleScore = 10;
    let randomFactor = Math.random() * 10;
    const config1 = this.getPetConfig(pet1Id);
    const config2 = this.getPetConfig(pet2Id);
    const memory1 = config1.memory || [];
    const memory2 = config2.memory || [];
    const petPair1 = memory1.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet2Id,
    );
    const petPair2 = memory2.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet1Id,
    );
    const owner1 = memory1.filter((m) => m.type === "owner");
    const owner2 = memory2.filter((m) => m.type === "owner");
    if (petPair1.length > 0 || petPair2.length > 0) {
      memoryScore = 40;
    } else if (owner1.length > 0 || owner2.length > 0) {
      memoryScore = 20;
    }
    const gnomelet1 = this._findGnomeletByPetId(pet1Id);
    const gnomelet2 = this._findGnomeletByPetId(pet2Id);
    if (gnomelet1 && gnomelet2) {
      const dx = Math.abs(gnomelet1._x - gnomelet2._x);
      const dy = Math.abs(gnomelet1._y - gnomelet2._y);
      const distance = Math.sqrt(dx * dx + dy * dy);
      if (distance < 200) proximityScore = 30;
      else if (distance < 500) proximityScore = 20;
      else proximityScore = 10;
      const state1 = gnomelet1._state;
      const state2 = gnomelet2._state;
      const State = {
        FALLING: "falling",
        IDLE: "idle",
        WALKING: "walking",
        JUMPING: "jumping",
      };
      const isIdle1 = state1 === State.IDLE || state1 === "idle";
      const isIdle2 = state2 === State.IDLE || state2 === "idle";
      if (isIdle1 && isIdle2) idleScore = 20;
      else if (isIdle1 || isIdle2) idleScore = 10;
      else idleScore = 0;
    }
    return (
      memoryScore + proximityScore + idleScore + randomFactor + personalityScore
    );
  }
  _getCooldownMs(pet1Id, pet2Id) {
    const config1 = this.getPetConfig(pet1Id);
    const config2 = this.getPetConfig(pet2Id);
    const memory1 = config1.memory || [];
    const memory2 = config2.memory || [];
    const petPair1 = memory1.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet2Id,
    );
    const petPair2 = memory2.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet1Id,
    );
    const owner1 = memory1.filter((m) => m.type === "owner").length;
    const owner2 = memory2.filter((m) => m.type === "owner").length;
    if (petPair1.length > 0 || petPair2.length > 0) {
      return 2 * 60 * 1000 + Math.random() * 2 * 60 * 1000;
    } else if (owner1 > 0 || owner2 > 0) {
      return 4 * 60 * 1000 + Math.random() * 2 * 60 * 1000;
    } else {
      return 8 * 60 * 1000 + Math.random() * 4 * 60 * 1000;
    }
  }
  _canTriggerInteraction(pet1Id, pet2Id) {
    const now = Date.now();
    const pairKey = [pet1Id, pet2Id].sort().join("|");
    const lastTime = this._lastPetInteractionTime[pairKey] || 0;
    const cooldownMs = this._getCooldownMs(pet1Id, pet2Id);
    return now - lastTime >= cooldownMs;
  }
  _recordInteractionTime(pet1Id, pet2Id) {
    const pairKey = [pet1Id, pet2Id].sort().join("|");
    this._lastPetInteractionTime[pairKey] = Date.now();
    this._nextCheckTime =
      Date.now() +
      this._minCooldownMs +
      Math.random() * (this._maxCooldownMs - this._minCooldownMs);
  }

  _generateConversationPrompt(pet1Id, pet2Id) {
    const config1 = this.getPetConfig(pet1Id);
    const config2 = this.getPetConfig(pet2Id);
    const memory1 = config1.memory || [];
    const memory2 = config2.memory || [];

    const petPair1 = memory1.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet2Id,
    );
    const petPair2 = memory2.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === pet1Id,
    );

    if (petPair1.length > 0 || petPair2.length > 0) {
      const allMessages = [...petPair1, ...petPair2].sort(
        (a, b) => a.timestamp - b.timestamp,
      );
      // 根据content去重（保留最早出现的）
      const seen = new Set();
      const uniqueMessages = allMessages.filter((m) => {
        const key = m.content.substring(0, 30); // 用前30个字符作为key
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
      const lastMessages = uniqueMessages
        .slice(-4)
        .map((m) => {
          const senderName = m.senderName;
          const receiverName = m.receiverName;
          return `${senderName} said to ${receiverName}: ${m.content}`;
        })
        .join("\n");
      const prompt = `Based on previous conversation with ${config2.name}:\n${lastMessages}\n\n${config1.name} wants to continue the conversation naturally.`;
      return {
        prompt: prompt,
        hasMemory: true,
        rounds: 3 + Math.floor(Math.random() * 2),
      };
    }

    const owner1 = memory1.filter((m) => m.type === "owner").slice(-3);
    const owner2 = memory2.filter((m) => m.type === "owner").slice(-3);

    if (owner1.length > 0 || owner2.length > 0) {
      const recentOwner2 = owner2.map((m) => m.content).join(" | ");
      return {
        prompt: `${config1.name} knows that ${config2.name} recently talked with owner about: ${recentOwner2}. ${config1.name} wants to start a conversation based on this, but doesn't mention the owner directly.`,
        hasMemory: true,
        rounds: 2 + Math.floor(Math.random() * 2),
      };
    }

    return {
      prompt: `${config1.name} sees ${config2.name} nearby and wants to say hello. This is your first meeting.
      You should:
      - Introduce your name and what you are
      - Greet them`,
      hasMemory: false,
      rounds: 1,
    };
  }
  async triggerPetInteraction() {
    const now = Date.now();
    const cooldownMs =
      this._minCooldownMs +
      Math.random() * (this._maxCooldownMs - this._minCooldownMs);
    this._scheduleAutoTrigger(cooldownMs);
    if (now < this._nextCheckTime) {
      return;
    }
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

    // const personalityScores = {};
    // const scorePromises = [];
    // for (let i = 0; i < petIds.length; i++) {
    //   for (let j = i + 1; j < petIds.length; j++) {
    //     const pet1 = petIds[i];
    //     const pet2 = petIds[j];
    //     const pairKey = [pet1, pet2].sort().join("|");
    //     scorePromises.push(
    //       this._calculatePersonalityScore(pet1, pet2).then((score) => {
    //         personalityScores[pairKey] = score;
    //       }),
    //     );
    //   }
    // }
    // await Promise.all(scorePromises);

    let bestPair = null;
    let bestScore = 0;

    for (let i = 0; i < petIds.length; i++) {
      for (let j = i + 1; j < petIds.length; j++) {
        const pet1 = petIds[i];
        const pet2 = petIds[j];
        // const pairKey = [pet1, pet2].sort().join("|");
        // const personalityScore = personalityScores[pairKey] || 0;

        if (!this._canTriggerInteraction(pet1, pet2)) {
          continue;
        }

        const score = this._calculateTriggerScore(pet1, pet2, 0);
        if (score > bestScore) {
          bestScore = score;
          bestPair = [pet1, pet2];
        }
      }
    }

    if (bestPair && Math.random() < 0.5) {
      const gnomelet1 = this._findGnomeletByPetId(bestPair[0]);
      const gnomelet2 = this._findGnomeletByPetId(bestPair[1]);
      let distance = 9999;
      if (gnomelet1 && gnomelet2) {
        const dx = Math.abs(gnomelet1._x - gnomelet2._x);
        const dy = Math.abs(gnomelet1._y - gnomelet2._y);
        distance = Math.sqrt(dx * dx + dy * dy);
      }

      if (bestScore >= 50 || distance < 500) {
        this._recordInteractionTime(bestPair[0], bestPair[1]);
        await this._startPetChat(bestPair[0], bestPair[1]);
      } else {
        this._nextCheckTime =
          now +
          this._minCooldownMs +
          Math.random() * (this._maxCooldownMs - this._minCooldownMs);
      }
    } else {
      this._nextCheckTime =
        now +
        this._minCooldownMs +
        Math.random() * (this._maxCooldownMs - this._minCooldownMs);
    }
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

    const convInfo = this._generateConversationPrompt(pet1Id, pet2Id);
    const { prompt, rounds } = convInfo;
    const totalRounds = rounds;

    const systemPrompt1 = buildSystemPrompt(
      config1,
      config1.name,
      config1.typeName,
      "pet_pair",
    );
    gnomelet1.showLoadingBubble();
    gnomelet2.showLoadingBubble();
    const result1 = await this._aiService.chat(
      prompt,
      systemPrompt1,
      config1.name,
    );

    if (result1.success) {
      chatHistory.push({ role: "assistant", content: result1.response });
      gnomelet1.showBubble(result1.response, false);

      await this._delay(2500);
      await this._petRespondInChat(
        pet2Id,
        result1.response,
        gnomelet2,
        chatHistory,
        config2,
        gnomelet1,
      );

      for (let i = 2; i < totalRounds; i++) {
        await this._delay(2500);
        const lastMsg = chatHistory[chatHistory.length - 1].content;
        await this._petRespondInChat(
          i % 2 === 0 ? pet1Id : pet2Id,
          lastMsg,
          i % 2 === 0 ? gnomelet1 : gnomelet2,
          chatHistory,
          i % 2 === 0 ? config1 : config2,
          i % 2 === 0 ? gnomelet2 : gnomelet1,
        );
      }
    }

    await this._delay(3000);
    gnomelet1.stopChatting();
    gnomelet2.stopChatting();

    for (let i = 0; i < chatHistory.length; i++) {
      const msg = chatHistory[i];
      if (msg.role === "assistant") {
        const sender = i % 2 === 0 ? pet1Id : pet2Id;
        const senderName = i % 2 === 0 ? config1.name : config2.name;

        this._petConfigManager.addMemory(
          pet1Id,
          "pet_pair",
          msg.content,
          pet2Id,
          sender,
          senderName,
        );
        this._petConfigManager.addMemory(
          pet2Id,
          "pet_pair",
          msg.content,
          pet1Id,
          sender,
          senderName,
        );
      }
    }

    this._analyzePetIntimacy(pet1Id, pet2Id, config1, config2);

    this._activePetPair = null;
  }

  async _analyzePetIntimacy(pet1Id, pet2Id, config1, config2) {
    const memories1 = this._petConfigManager.getPetPairMemory(pet1Id, pet2Id);
    if (memories1.length < 2) return;

    const recentMemories = memories1.slice(-6);
    let conversationText = "";
    for (let i = 0; i < recentMemories.length; i += 2) {
      const msg1 = recentMemories[i];
      const msg2 = recentMemories[i + 1];
      if (msg1) conversationText += `${config1.name}: ${msg1.content}\n`;
      if (msg2) conversationText += `${config2.name}: ${msg2.content}\n`;
    }

    const systemPrompt = `You are a helpful assistant that analyzes the intimacy level between two characters based on their conversations.`;
    const prompt = `Analyze these two pets' conversations and rate their intimacy level.

Conversations:
${conversationText}

How close are these two pets?
Reply with one word only: best_friends, close_friends, friends, acquaintances, strangers, or rivals`;

    try {
      const result = await this._aiService.chat(
        prompt,
        systemPrompt,
        "Analyzer",
      );

      if (result.success) {
        const response = result.response.toLowerCase().trim();
        let intimacy = null;
        if (response.includes("best_friends")) intimacy = "best_friends";
        else if (response.includes("close_friends")) intimacy = "close_friends";
        else if (response.includes("friends")) intimacy = "friends";
        else if (response.includes("acquaintances")) intimacy = "acquaintances";
        else if (response.includes("strangers")) intimacy = "strangers";
        else if (response.includes("rivals")) intimacy = "rivals";

        if (intimacy) {
          this._petConfigManager.setIntimacyScore(pet1Id, pet2Id, intimacy);
          this._petConfigManager.setIntimacyScore(pet2Id, pet1Id, intimacy);
        }
      }
    } catch (e) {
      console.error("Failed to analyze pet intimacy:", e);
    }
  }

  _scheduleAutoTrigger(delayMs) {
    if (this._autoTriggerTimeout) {
      GLib.source_remove(this._autoTriggerTimeout);
    }

    this._autoTriggerTimeout = GLib.timeout_add(
      GLib.PRIORITY_DEFAULT,
      delayMs,
      () => {
        this.triggerPetInteraction();
        this._autoTriggerTimeout = null;
        return GLib.SOURCE_REMOVE;
      },
    );
  }

  async _petRespondInChat(
    petId,
    previousMessage,
    gnomelet,
    chatHistory,
    configPartner = null,
    gnomeletPartner = null,
  ) {
    const config = this.getPetConfig(petId);
    const systemPrompt = buildSystemPrompt(
      config,
      config.name,
      config.typeName,
      "pet_pair",
    );

    let prompt = `${config.name} responds to the previous message naturally.`;
    if (configPartner && gnomeletPartner && chatHistory.length > 0) {
      const recentMessages = chatHistory
        .slice(-4)
        .map((m) => m.content)
        .join("\n");
      prompt = `${config.name} continues the conversation based on:\n${recentMessages}\n\nRespond naturally to continue the chat.`;
    }

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
      "owner",
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
      "pet_pair",
    );
    const systemPrompt2 = buildSystemPrompt(
      config2,
      config2.name,
      config2.typeName,
      "pet_pair",
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

  async triggerPetInteractionNow() {
    if (!this._isEnabled) return;
    if (this._activePetPair !== null) return;

    const gnomelets = this._petManager._gnomelets;
    for (const g of gnomelets) {
      if (g.isChatting()) return;
    }

    const configs = this._petConfigManager.getConfigs();
    const petIds = Object.keys(configs);
    if (petIds.length < 2) return;

    const shuffled = petIds.sort(() => Math.random() - 0.5);
    const pet1 = shuffled[0];
    const pet2 = shuffled[1];

    this._recordInteractionTime(pet1, pet2);
    await this._startPetChat(pet1, pet2);
  }
}
