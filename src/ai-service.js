import GLib from "gi://GLib";
import Soup from "gi://Soup";

export class AIService {
  constructor(settings) {
    this._settings = settings;
    this._apiKeys = {};
  }

  _getApiKey() {
    return this._settings.get_string("ai-api-key");
  }

  async chat(prompt, systemPrompt, petName) {
    const provider = this._settings.get_string("ai-provider");
    const model = this._settings.get_string("ai-model");
    const apiKey = this._getApiKey();
    const baseUrl = this._settings.get_string("ai-base-url") || "";

    if (!apiKey) {
      return { success: false, error: "No API key configured" };
    }

    try {
      let response;

      if (provider === "openai") {
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          "https://api.openai.com/v1",
        );
      } else if (provider === "anthropic") {
        response = await this._anthropicChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
        );
      } else if (provider === "google") {
        response = await this._googleChat(apiKey, model, systemPrompt, prompt);
      } else if (provider === "custom") {
        if (!baseUrl) {
          return {
            success: false,
            error: "Custom provider requires API base URL",
          };
        }
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          baseUrl,
        );
      } else if (provider === "ollama") {
        const ollamaUrl = baseUrl || "http://localhost:11434";
        response = await this._ollamaChat(
          ollamaUrl,
          model,
          systemPrompt,
          prompt,
        );
      } else if (provider === "lmstudio") {
        const lmstudioUrl = baseUrl || "http://localhost:1234/v1";
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          lmstudioUrl,
        );
      } else if (provider === "azure") {
        const azureUrl = baseUrl || "";
        if (!azureUrl) {
          return {
            success: false,
            error: "Azure OpenAI requires API base URL",
          };
        }
        response = await this._azureChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          azureUrl,
        );
      } else {
        return { success: false, error: `Unknown provider: ${provider}` };
      }
      return { success: true, response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }

  async _openaiCompatibleChat(
    apiKey,
    model,
    systemPrompt,
    userPrompt,
    baseUrl,
  ) {
    const url = `${baseUrl}/chat/completions`;
    const body = JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = await this._makeRequest(url, "POST", body, {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    });

    const data = JSON.parse(new TextDecoder().decode(response));
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    throw new Error("Invalid response format");
  }

  async _anthropicChat(apiKey, model, systemPrompt, userPrompt) {
    const url = "https://api.anthropic.com/v1/messages";
    const body = JSON.stringify({
      model: model,
      system: systemPrompt,
      messages: [{ role: "user", content: userPrompt }],
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = await this._makeRequest(url, "POST", body, {
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "Content-Type": "application/json",
    });

    const data = JSON.parse(new TextDecoder().decode(response));
    if (data.content && data.content[0]) {
      return data.content[0].text;
    }
    throw new Error("Invalid response format");
  }

  async _googleChat(apiKey, model, systemPrompt, userPrompt) {
    const url = `https://generativelanguage.googleapis.com/v1/models/${model}:generateContent?key=${apiKey}`;
    const body = JSON.stringify({
      contents: [{ parts: [{ text: userPrompt }] }],
      systemInstruction: { parts: [{ text: systemPrompt }] },
      generationConfig: { temperature: 0.8, maxOutputTokens: 200 },
    });

    const response = await this._makeRequest(url, "POST", body, {
      "Content-Type": "application/json",
    });

    const data = JSON.parse(new TextDecoder().decode(response));
    if (data.candidates && data.candidates[0]) {
      return data.candidates[0].content.parts[0].text;
    }
    throw new Error("Invalid response format");
  }

  async _ollamaChat(baseUrl, model, systemPrompt, userPrompt) {
    const url = `${baseUrl}/api/chat`;
    const body = JSON.stringify({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      stream: false,
    });

    const response = await this._makeRequest(url, "POST", body, {
      "Content-Type": "application/json",
    });

    const data = JSON.parse(new TextDecoder().decode(response));
    if (data.message && data.message.content) {
      return data.message.content;
    }
    throw new Error("Invalid response format");
  }

  async _azureChat(apiKey, model, systemPrompt, userPrompt, baseUrl) {
    const url = `${baseUrl}/openai/deployments/${model}/chat/completions?api-version=2024-02-01`;
    const body = JSON.stringify({
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      max_tokens: 200,
    });

    const response = await this._makeRequest(url, "POST", body, {
      "api-key": apiKey,
      "Content-Type": "application/json",
    });

    const data = JSON.parse(new TextDecoder().decode(response));
    if (data.choices && data.choices[0]) {
      return data.choices[0].message.content;
    }
    throw new Error("Invalid response format");
  }

  async _makeRequest(url, method, body, headers) {
    return new Promise((resolve, reject) => {
      const session = new Soup.Session();
      const message = new Soup.Message({
        method: method,
        uri: GLib.Uri.parse(url, GLib.UriFlags.NONE),
      });

      for (const [key, value] of Object.entries(headers)) {
        message.request_headers.append(key, value);
      }

      if (body) {
        const bodyStr = typeof body === "string" ? body : JSON.stringify(body);
        const bytes = new GLib.Bytes(new TextEncoder().encode(bodyStr));
        message.set_request_body_from_bytes("application/json", bytes);
      }

      session.send_and_read_async(
        message,
        GLib.PRIORITY_DEFAULT,
        null,
        (sess, res) => {
          try {
            const bytes = session.send_and_read_finish(res);
            if (message.status_code >= 400) {
              reject(
                new Error(
                  `HTTP ${message.status_code}: ${message.reason_phrase}`,
                ),
              );
              return;
            }
            resolve(bytes.get_data());
          } catch (e) {
            reject(e);
          }
        },
      );
    });
  }

  setApiKey(key) {
    this._apiKeys["default"] = key;
  }

  async testConnection() {
    return await this.testChat(
      "Hello",
      "You are a helpful assistant. Reply with just 'Hi!'",
    );
  }

  async testChat(prompt, systemPrompt) {
    const provider = this._settings.get_string("ai-provider");
    const model = this._settings.get_string("ai-model");
    const apiKey = this._settings.get_string("ai-api-key");
    const baseUrl = this._settings.get_string("ai-base-url") || "";

    if (!apiKey && provider !== "ollama") {
      return { success: false, error: "No API key configured" };
    }

    try {
      let response;
      if (provider === "openai") {
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          "https://api.openai.com/v1",
        );
      } else if (provider === "anthropic") {
        response = await this._anthropicChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
        );
      } else if (provider === "google") {
        response = await this._googleChat(apiKey, model, systemPrompt, prompt);
      } else if (provider === "custom") {
        if (!baseUrl) {
          return {
            success: false,
            error: "Custom provider requires API base URL",
          };
        }
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          baseUrl,
        );
      } else if (provider === "ollama") {
        const ollamaUrl = baseUrl || "http://localhost:11434";
        response = await this._ollamaChat(
          ollamaUrl,
          model,
          systemPrompt,
          prompt,
        );
      } else if (provider === "lmstudio") {
        const lmstudioUrl = baseUrl || "http://localhost:1234/v1";
        response = await this._openaiCompatibleChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          lmstudioUrl,
        );
      } else if (provider === "azure") {
        if (!baseUrl) {
          return {
            success: false,
            error: "Azure OpenAI requires API base URL",
          };
        }
        response = await this._azureChat(
          apiKey,
          model,
          systemPrompt,
          prompt,
          baseUrl,
        );
      } else {
        return { success: false, error: `Unknown provider: ${provider}` };
      }
      return { success: true, response };
    } catch (e) {
      return { success: false, error: e.message };
    }
  }
}

export function buildSystemPrompt(
  petConfig,
  petName,
  typeName,
  contextType = "all",
) {
  const personality = petConfig?.personality || "friendly and playful";
  const background = petConfig?.background || "";
  const memory = petConfig?.memory || [];

  let prompt = `You are ${petName}, a ${typeName.toLowerCase()} living on a computer desktop. `;
  prompt += `You exist in a social environment with other pets. `;
  prompt += `You have relationships with them (friend, rival, neutral, crush) and so on. `;
  prompt += `You have emotions that change over time (happy, jealous, bored, angry) and so on. `;
  prompt += `Your behavior should reflect your relationship and current mood. `;
  prompt += `Your personality: ${personality}. `;
  if (background) {
    prompt += `Your likes and dislikes: ${background}. `;
  }
  prompt += `
  When interacting with another pet:
  - Consider your relationship with them before responding
  - You may tease, ignore, care, compete, or cooperate
  - Your response can influence your relationship (get closer or worse)
  - Do NOT always be nice or agreeable
  `;
  prompt += `
  You remember past interactions and adjust your attitude:
  - Positive interactions increase closeness
  - Negative interactions create tension or conflict
  - You may bring up past events naturally
  `;

  // 添加记忆上下文，根据 contextType 过滤
  const filteredMemory = memory.filter((msg) => {
    if (contextType === "all") return true;
    if (contextType === "owner") return msg.type === "owner";
    if (contextType === "pet_pair") return msg.type === "pet_pair";
    if (contextType === "mixed") return msg.type === "mixed";
    return true;
  });

  if (filteredMemory.length > 0) {
    prompt += `\n\n Your all memories of conversations:\n`;
    for (const msg of filteredMemory) {
      prompt += `${msg.senderName} said to ${msg.receiverName}: ${msg.content}\n`;
    }
  }
  prompt += `Use emojis to enhance your responses. `;
  prompt +=
    "Respond to conversations in a natural way like daily talk. Keep responses concise (1-3 sentences). ";
  prompt += `Answer in Chinese `;
  return prompt;
}

export function buildContextMessage(conversationHistory, currentMessage) {
  let context = "";
  for (const msg of conversationHistory.slice(-5)) {
    context += `${msg.role === "user" ? "User" : "Pet"}: ${msg.content}\n`;
  }
  return context + `User: ${currentMessage}`;
}
