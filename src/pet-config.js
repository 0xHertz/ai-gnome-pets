import GLib from "gi://GLib";
import Gio from "gi://Gio";

export class PetConfigManager {
  constructor(settings) {
    this._settings = settings;
  }

  getConfigs() {
    try {
      const configsJson = this._settings.get_string("pet-configs");
      return JSON.parse(configsJson) || {};
    } catch (e) {
      return {};
    }
  }

  setConfigs(configs) {
    this._settings.set_string("pet-configs", JSON.stringify(configs));
  }

  getPetConfig(petId) {
    const configs = this.getConfigs();
    return configs[petId] || this._getDefaultConfig(petId);
  }

  setPetConfig(petId, config) {
    const configs = this.getConfigs();
    configs[petId] = config;
    this.setConfigs(configs);
  }

  _getDefaultConfig(petId) {
    return {
      name: `Pet ${petId}`,
      personality: "friendly and playful",
      background: "",
      enabled: true,
    };
  }

  getAllPetIds() {
    const configs = this.getConfigs();
    return Object.keys(configs);
  }

  removePet(petId) {
    const configs = this.getConfigs();
    delete configs[petId];
    this.setConfigs(configs);
  }

  addMemory(
    petId,
    type,
    content,
    partnerPetId = null,
    sender = null,
    senderName = null,
  ) {
    const config = this.getPetConfig(petId);
    if (!config.memory) config.memory = [];

    const receiver = sender == partnerPetId ? petId : partnerPetId;
    const receiverName = this.getPetConfig(receiver).name;
    const now = Date.now();
    config.memory.push({
      type,
      content,
      partnerPetId,
      sender,
      senderName,
      receiver: receiver,
      receiverName: receiverName,
      timestamp: now,
    });

    this._cleanExpiredMemory(config);
    this.setPetConfig(petId, config);
  }

  getMemory(petId, maxRounds = 10) {
    const config = this.getPetConfig(petId);
    if (!config.memory || config.memory.length === 0) return [];

    // 提取最近的maxRounds轮对话（每轮2条消息）
    const maxMessages = maxRounds * 2;
    return config.memory.slice(-maxMessages);
  }

  _cleanExpiredMemory(config) {
    if (!config.memory) return;

    const now = Date.now();
    const maxAge = 7 * 24 * 60 * 60 * 1000; // 7天

    // 过滤超过7天的记忆
    config.memory = config.memory.filter((m) => now - m.timestamp < maxAge);

    // 限制最多50条消息（约25轮）
    if (config.memory.length > 50) {
      config.memory = config.memory.slice(-50);
    }
  }

  clearMemory(petId) {
    const config = this.getPetConfig(petId);
    config.memory = [];
    this.setPetConfig(petId, config);
  }

  getPetPairMemory(petId, partnerPetId) {
    const config = this.getPetConfig(petId);
    if (!config.memory) return [];
    return config.memory.filter(
      (m) => m.type === "pet_pair" && m.partnerPetId === partnerPetId,
    );
  }

  getAllPetPairConversations() {
    const configs = this.getConfigs();
    const conversations = [];
    const processedPairs = new Set();

    for (const petId in configs) {
      const config = configs[petId];
      if (!config.memory) continue;

      const petPairs = config.memory.filter((m) => m.type === "pet_pair");
      for (const memory of petPairs) {
        const partnerId = memory.partnerPetId;
        const pairKey = [petId, partnerId].sort().join("|");

        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const partnerMemories = petPairs.filter(
          (m) => m.partnerPetId === partnerId,
        );
        partnerMemories.sort((a, b) => a.timestamp - b.timestamp);

        const pet1Config = configs[petId] || { name: petId };
        const pet2Config = configs[partnerId] || { name: partnerId };

        conversations.push({
          pet1: petId,
          pet2: partnerId,
          pet1Name: pet1Config.name || petId,
          pet2Name: pet2Config.name || partnerId,
          memories: partnerMemories,
        });
      }
    }

    conversations.sort((a, b) => {
      const aTime = a.memories.length > 0 ? a.memories[0].timestamp : 0;
      const bTime = b.memories.length > 0 ? b.memories[0].timestamp : 0;
      return bTime - aTime;
    });

    return conversations;
  }

  calculateRelationshipScore(petId, partnerPetId) {
    const memories = this.getPetPairMemory(petId, partnerPetId);
    if (memories.length === 0) return 0;

    const now = Date.now();
    const oneDay = 24 * 60 * 60 * 1000;
    const lastConversation = Math.max(...memories.map((m) => m.timestamp));
    const daysSinceLastChat = (now - lastConversation) / oneDay;
    const conversationCount = Math.floor(memories.length / 2);

    let score = 0;

    if (conversationCount >= 1) {
      score += 3;
      if (conversationCount <= 5) {
        score += (conversationCount - 1) * 2;
      } else if (conversationCount <= 10) {
        score += 8 + (conversationCount - 5) * 1;
      } else {
        score += 13 + (conversationCount - 10) * 0.5;
      }
    }

    if (score > 40) score = 40;

    const intimacyScore = this.getIntimacyScore(petId, partnerPetId);
    if (intimacyScore) {
      if (intimacyScore === "best_friends") score += 2;
      else if (intimacyScore === "close_friends") score += 1;
      else if (intimacyScore === "strangers") score -= 1;
      else if (intimacyScore === "rivals") score -= 2;
    }

    if (daysSinceLastChat >= 60) score -= 15;
    else if (daysSinceLastChat >= 30) score -= 10;
    else if (daysSinceLastChat >= 14) score -= 5;
    else if (daysSinceLastChat >= 7) score -= 3;
    else if (daysSinceLastChat >= 3) score -= 1;

    if (score < 0) score = 0;

    return score;
  }

  getRelationshipLevel(score) {
    if (score <= 5) return { level: "Stranger", emoji: "👤" };
    if (score <= 10) return { level: "Acquaintance", emoji: "🖐️" };
    if (score <= 20) return { level: "Nodding", emoji: "👋" };
    if (score <= 30) return { level: "Friend", emoji: "🙂" };
    if (score <= 40) return { level: "Close Friend", emoji: "😄" };
    return { level: "Best Friend", emoji: "❤️" };
  }

  setIntimacyScore(petId, partnerPetId, intimacyScore) {
    const config = this.getPetConfig(petId);
    if (!config.intimacyScores) config.intimacyScores = {};
    config.intimacyScores[partnerPetId] = intimacyScore;
    this.setPetConfig(petId, config);
  }

  getIntimacyScore(petId, partnerPetId) {
    const config = this.getPetConfig(petId);
    if (!config.intimacyScores) return null;
    return config.intimacyScores[partnerPetId];
  }
}

export const DEFAULT_PERSONALITIES = {
  friendly: "friendly, cheerful, and always happy to see people",
  shy: "shy, quiet, and sometimes nervous around strangers",
  playful: "playful, energetic, and loves having fun",
  wise: "wise, calm, and gives thoughtful advice",
  mischievous: "mischievous, likes pranks and making jokes",
  caring: "caring, nurturing, and always worried about others",
  curious: "curious, loves exploring and asking questions",
  lazy: "lazy, prefers sleeping and relaxing",
};

export const SPEAKING_STYLES = [
  "short and cute",
  "detailed and explanatory",
  "funny and exaggerated",
  "soft and gentle",
  "energetic and enthusiastic",
  "calm and soothing",
];
