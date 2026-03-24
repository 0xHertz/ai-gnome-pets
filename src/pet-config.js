import GLib from 'gi://GLib';
import Gio from 'gi://Gio';

export class PetConfigManager {
    constructor(settings) {
        this._settings = settings;
    }

    getConfigs() {
        try {
            const configsJson = this._settings.get_string('pet-configs');
            return JSON.parse(configsJson) || {};
        } catch (e) {
            return {};
        }
    }

    setConfigs(configs) {
        this._settings.set_string('pet-configs', JSON.stringify(configs));
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
            personality: 'friendly and playful',
            speakingStyle: 'short and cute',
            background: '',
            enabled: true
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

    addMemory(petId, type, content, partnerPetId = null) {
        const config = this.getPetConfig(petId);
        if (!config.memory) config.memory = [];
        
        const now = Date.now();
        config.memory.push({
            type,
            content,
            partnerPetId,
            timestamp: now
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
        config.memory = config.memory.filter(m => now - m.timestamp < maxAge);
        
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
}

export const DEFAULT_PERSONALITIES = {
    'friendly': 'friendly, cheerful, and always happy to see people',
    'shy': 'shy, quiet, and sometimes nervous around strangers',
    'playful': 'playful, energetic, and loves having fun',
    'wise': 'wise, calm, and gives thoughtful advice',
    'mischievous': 'mischievous, likes pranks and making jokes',
    'caring': 'caring, nurturing, and always worried about others',
    'curious': 'curious, loves exploring and asking questions',
    'lazy': 'lazy, prefers sleeping and relaxing'
};

export const SPEAKING_STYLES = [
    'short and cute',
    'detailed and explanatory',
    'funny and exaggerated',
    'soft and gentle',
    'energetic and enthusiastic',
    'calm and soothing'
];