import Adw from "gi://Adw";
import Gio from "gi://Gio";
import Gtk from "gi://Gtk";
import GLib from "gi://GLib";

import {
  ExtensionPreferences,
  gettext as _,
} from "resource:///org/gnome/Shell/Extensions/js/extensions/prefs.js";

export default class DesktopGnomeletsPreferences extends ExtensionPreferences {
  fillPreferencesWindow(window) {
    const settings = this.getSettings();

    const page = new Adw.PreferencesPage();
    const group = new Adw.PreferencesGroup();
    page.add(group);

    // Gnomelet Character Group
    const charExpander = new Adw.ExpanderRow({
      title: "Gnomelet Characters",
      subtitle: "Select which gnomelets to display",
    });
    group.add(charExpander);

    // Dynamic listing of gnomelet types
    const file = Gio.File.new_for_uri(import.meta.url);
    const imagesDir = file.get_parent().get_child("images");

    imagesDir.enumerate_children_async(
      "standard::name,standard::type",
      Gio.FileQueryInfoFlags.NONE,
      GLib.PRIORITY_DEFAULT,
      null,
      (obj, res) => {
        let types = [];
        try {
          let enumerator = obj.enumerate_children_finish(res);
          let info;
          while ((info = enumerator.next_file(null))) {
            if (info.get_file_type() === Gio.FileType.DIRECTORY) {
              types.push(info.get_name());
            }
          }
        } catch (e) {
          console.error("Failed to list gnomelet types:", e);
        }

        types.sort();
        if (types.length === 0) types.push("Santa");

        // Get currently selected types (array of strings)
        let currentTypes = settings.get_strv("gnomelet-type");
        // Handle case where migration from string might have left it empty or weird, though schema handles default.
        // Let's assume it works or returns default.

        // Ensure we have a set for easier lookup
        let selectedSet = new Set(currentTypes);

        types.forEach((type) => {
          const row = new Adw.ActionRow({ title: type });
          const check = new Gtk.CheckButton({
            active: selectedSet.has(type),
            valign: Gtk.Align.CENTER,
          });

          check.connect("toggled", () => {
            let current = new Set(settings.get_strv("gnomelet-type"));
            if (check.active) {
              current.add(type);
            } else {
              current.delete(type);
            }
            settings.set_strv("gnomelet-type", [...current]);
          });

          row.add_suffix(check);
          charExpander.add_row(row);
        });
      },
    );

    // Gnomelet Count Row
    const countRow = new Adw.ActionRow({ title: "Number of Gnomelets" });
    const countSpin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 1,
        upper: 20,
        step_increment: 1,
      }),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "gnomelet-count",
      countSpin,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    countRow.add_suffix(countSpin);
    group.add(countRow);

    // Gnomelet Scale Row
    const scaleRow = new Adw.ActionRow({ title: "Gnomelet Size (px)" });
    const scaleSpin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 32,
        upper: 256,
        step_increment: 8,
      }),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "gnomelet-scale",
      scaleSpin,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    scaleRow.add_suffix(scaleSpin);
    group.add(scaleRow);

    // Jump Power Row
    const jumpRow = new Adw.ActionRow({ title: "Jump Power" });
    const jumpSpin = new Gtk.SpinButton({
      adjustment: new Gtk.Adjustment({
        lower: 10,
        upper: 50,
        step_increment: 1,
      }),
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "jump-power",
      jumpSpin,
      "value",
      Gio.SettingsBindFlags.DEFAULT,
    );
    jumpRow.add_suffix(jumpSpin);
    group.add(jumpRow);

    // In Front of Maximized (mapped to floor-z-order)
    const zOrderRow = new Adw.ComboRow({
      title: "In Front of Maximized",
      subtitle: "Choose behavior regarding maximized windows",
      model: new Gtk.StringList({
        strings: [
          "Allow (Overlay)",
          "Partial (Behind Focused)",
          "Disallow (Behind Any)",
        ],
      }),
    });

    // Map config strings to index
    const orderMap = {
      allow: 0,
      partial: 1,
      disallow: 2,
    };
    const indexMap = ["allow", "partial", "disallow"];

    // Set initial selection
    let currentOrder = settings.get_string("floor-z-order");
    if (orderMap.hasOwnProperty(currentOrder)) {
      zOrderRow.set_selected(orderMap[currentOrder]);
    } else {
      zOrderRow.set_selected(0); // Default allow
    }

    zOrderRow.connect("notify::selected", () => {
      let idx = zOrderRow.selected;
      if (idx >= 0 && idx < indexMap.length) {
        settings.set_string("floor-z-order", indexMap[idx]);
      }
    });

    group.add(zOrderRow);

    // In Front of Dock (mapped to dock-z-order)
    const dockZOrderRow = new Adw.ActionRow({
      title: "In Front of Dock",
      subtitle:
        'If enabled, gnomelets appear in front of "Dash to Dock (Ubuntu Dock)" or "Dash to Panel"',
    });
    const dockZOrderSwitch = new Gtk.Switch({
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "dock-z-order",
      dockZOrderSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    dockZOrderRow.add_suffix(dockZOrderSwitch);
    group.add(dockZOrderRow);

    // Dock Support
    const dockSupportRow = new Adw.ComboRow({
      title: "Dock Support",
      subtitle: "Select explicit support for a dock extension",
      model: new Gtk.StringList({
        strings: ["None", "Dash to Dock", "Dash to Panel"],
      }),
    });

    const dockSupportMap = ["none", "dash-to-dock", "dash-to-panel"];
    const dockSupportInverseMap = {
      none: 0,
      "dash-to-dock": 1,
      "dash-to-panel": 2,
    };

    let currentDockSupport = settings.get_string("dock-support");
    if (dockSupportInverseMap.hasOwnProperty(currentDockSupport)) {
      dockSupportRow.set_selected(dockSupportInverseMap[currentDockSupport]);
    } else {
      dockSupportRow.set_selected(0); // Default None
    }

    dockSupportRow.connect("notify::selected", () => {
      let idx = dockSupportRow.selected;
      if (idx >= 0 && idx < dockSupportMap.length) {
        settings.set_string("dock-support", dockSupportMap[idx]);
      }
    });

    group.add(dockSupportRow);

    // Allow Interaction
    const interactionRow = new Adw.ActionRow({
      title: "Allow Interaction",
      subtitle: "Enable dragging gnomelets with the mouse",
    });
    const interactionSwitch = new Gtk.Switch({
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "allow-interaction",
      interactionSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    interactionRow.add_suffix(interactionSwitch);
    group.add(interactionRow);

    // Show Indicator
    const indicatorRow = new Adw.ActionRow({
      title: "Show Menu Indicator",
      subtitle: "Show the gnomelet menu in the top bar",
    });
    const indicatorSwitch = new Gtk.Switch({
      valign: Gtk.Align.CENTER,
    });
    settings.bind(
      "show-indicator",
      indicatorSwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    indicatorRow.add_suffix(indicatorSwitch);
    group.add(indicatorRow);

    // Actions Group
    const actionsGroup = new Adw.PreferencesGroup({ title: "Actions" });
    page.add(actionsGroup);

    const respawnRow = new Adw.ActionRow({ title: "Reset State" });
    const respawnButton = new Gtk.Button({
      label: "Respawn Gnomelets",
      valign: Gtk.Align.CENTER,
    });

    respawnButton.connect("clicked", () => {
      // Toggle the boolean value to trigger a change signal
      let current = settings.get_boolean("reset-trigger");
      settings.set_boolean("reset-trigger", !current);
    });

    respawnRow.add_suffix(respawnButton);
    actionsGroup.add(respawnRow);

    const clearMemoryRow = new Adw.ActionRow({ title: "Clear All Pet Memories" });
    const clearMemoryButton = new Gtk.Button({
      label: "Clear Memories",
      valign: Gtk.Align.CENTER,
    });

    clearMemoryButton.connect("clicked", () => {
      try {
        const configs = JSON.parse(settings.get_string("pet-configs") || "{}");
        for (const petId in configs) {
          if (configs[petId].memory) {
            configs[petId].memory = [];
          }
        }
        settings.set_string("pet-configs", JSON.stringify(configs));
        
        clearMemoryButton.label = "Cleared!";
        setTimeout(() => {
          clearMemoryButton.label = "Clear Memories";
        }, 1500);
      } catch (e) {
        console.error("Failed to clear memories:", e);
      }
    });

    clearMemoryRow.add_suffix(clearMemoryButton);
    actionsGroup.add(clearMemoryRow);

    this._buildAIPreferences(page, settings);

    window.add(page);
  }

  _buildAIPreferences(page, settings) {
    const aiGroup = new Adw.PreferencesGroup({ title: "AI Configuration" });
    page.add(aiGroup);

    const enableAI = new Adw.ActionRow({
      title: "Enable AI",
      subtitle: "Enable AI-powered pet conversations",
    });
    const enableAISwitch = new Gtk.Switch({ valign: Gtk.Align.CENTER });
    settings.bind(
      "ai-enabled",
      enableAISwitch,
      "active",
      Gio.SettingsBindFlags.DEFAULT,
    );
    enableAI.add_suffix(enableAISwitch);
    aiGroup.add(enableAI);

    const providerRow = new Adw.ComboRow({
      title: "AI Provider",
      subtitle: "Select your AI service provider",
      model: new Gtk.StringList({
        strings: [
          "OpenAI",
          "Anthropic",
          "Google",
          "Ollama (本地)",
          "LM Studio (本地)",
          "Azure OpenAI",
          "自定义 (兼容OpenAI)",
        ],
      }),
    });
    const providerMap = {
      openai: 0,
      anthropic: 1,
      google: 2,
      ollama: 3,
      lmstudio: 4,
      azure: 5,
      custom: 6,
    };
    const providerInverseMap = {
      0: "openai",
      1: "anthropic",
      2: "google",
      3: "ollama",
      4: "lmstudio",
      5: "azure",
      6: "custom",
    };
    let currentProvider = settings.get_string("ai-provider");
    providerRow.set_selected(providerMap[currentProvider] || 0);
    providerRow.connect("notify::selected", () => {
      settings.set_string(
        "ai-provider",
        providerInverseMap[providerRow.selected],
      );
    });
    aiGroup.add(providerRow);

    const apiKeyRow = new Adw.ActionRow({ title: "API Key" });
    const apiKeyEntry = new Gtk.Entry({
      placeholder_text: "Enter your API key",
      visibility: false,
      valign: Gtk.Align.CENTER,
      width_chars: 30,
    });
    apiKeyEntry.set_text(settings.get_string("ai-api-key"));
    apiKeyEntry.connect("changed", () => {
      settings.set_string("ai-api-key", apiKeyEntry.get_text());
    });
    apiKeyRow.add_suffix(apiKeyEntry);
    aiGroup.add(apiKeyRow);

    const modelRow = new Adw.ActionRow({ title: "Model" });
    const modelEntry = new Gtk.Entry({
      placeholder_text: "e.g., gpt-3.5-turbo",
      text: settings.get_string("ai-model"),
      valign: Gtk.Align.CENTER,
      width_chars: 25,
    });
    modelEntry.connect("changed", () => {
      settings.set_string("ai-model", modelEntry.get_text());
    });
    modelRow.add_suffix(modelEntry);
    aiGroup.add(modelRow);

    const baseUrlRow = new Adw.ActionRow({ title: "API Base URL" });
    const baseUrlEntry = new Gtk.Entry({
      placeholder_text: "如: http://localhost:11434 (Ollama)",
      text: settings.get_string("ai-base-url"),
      valign: Gtk.Align.CENTER,
      width_chars: 35,
    });
    baseUrlEntry.connect("changed", () => {
      settings.set_string("ai-base-url", baseUrlEntry.get_text());
    });
    baseUrlRow.add_suffix(baseUrlEntry);
    aiGroup.add(baseUrlRow);

    const testRow = new Adw.ActionRow({ title: "Test AI Connection" });
    const testButton = new Gtk.Button({
      label: "Test",
      valign: Gtk.Align.CENTER,
    });
    const testStatusLabel = new Gtk.Label({
      label: "",
      valign: Gtk.Align.CENTER,
    });
    testRow.add_suffix(testButton);
    testRow.add_suffix(testStatusLabel);
    aiGroup.add(testRow);

    testButton.connect("clicked", async () => {
      testButton.label = "Testing...";
      testButton.sensitive = false;
      testStatusLabel.set_label("");

      try {
        const apiKey = settings.get_string("ai-api-key");
        const provider = settings.get_string("ai-provider");
        const model = settings.get_string("ai-model");
        const baseUrl = settings.get_string("ai-base-url");

        if (!apiKey && provider !== "ollama") {
          testStatusLabel.set_label("❌ No API Key");
          testButton.label = "Test";
          testButton.sensitive = true;
          return;
        }

        const result = await this._testAIConnection(
          provider,
          model,
          apiKey,
          baseUrl,
        );
        if (result.success) {
          testStatusLabel.set_label("✅ Connected!");
        } else {
          testStatusLabel.set_label(`❌ ${result.error}`);
        }
      } catch (e) {
        testStatusLabel.set_label(`❌ ${e.message}`);
      }

      testButton.label = "Test";
      testButton.sensitive = true;
    });

    this._buildPetConfigSection(page, settings);
  }

  async _testAIConnection(provider, model, apiKey, baseUrl) {
    const { AIService } = await import("./ai-service.js");
    const testSettings = {
      get_string: (key) => {
        if (key === "ai-provider") return provider;
        if (key === "ai-model") return model;
        if (key === "ai-api-key") return apiKey;
        if (key === "ai-base-url") return baseUrl;
        return "";
      },
    };

    const aiService = new AIService(testSettings);
    return await aiService.testChat(
      'Hello! Say "Hi" if you can hear me.',
      'You are a helpful AI assistant. Reply with just "Hi!"',
    );
  }

  _buildPetConfigSection(page, settings) {
    const petGroup = new Adw.PreferencesGroup({ title: "Pet Personalities" });
    page.add(petGroup);

    const expander = new Adw.ExpanderRow({
      title: "Configure Pet Personalities",
      subtitle: "Set unique personalities for each pet",
    });
    petGroup.add(expander);

    this._loadPetConfigs(settings, expander);
  }

  _loadPetConfigs(settings, expander) {
    try {
      const configs = JSON.parse(settings.get_string("pet-configs") || "{}");
      let petIndex = 0;

      const loadNextPet = () => {
        if (petIndex >= settings.get_int("gnomelet-count")) return;

        const petId = `pet_${petIndex}`;
        const config = configs[petId] || {
          name: `Pet ${petIndex + 1}`,
          personality: "friendly",
          speakingStyle: "short and cute",
          background: "",
        };

        const petCard = new Adw.PreferencesGroup({ title: config.name });

        const nameRow = new Adw.ActionRow({ title: "Name" });
        const nameEntry = new Gtk.Entry({
          text: config.name,
          valign: Gtk.Align.CENTER,
        });
        nameEntry.connect("changed", () => {
          config.name = nameEntry.get_text();
          petCard.title = config.name;
          this._savePetConfig(settings, petId, config);
        });
        nameRow.add_suffix(nameEntry);
        petCard.add(nameRow);

        const personalityRow = new Adw.ComboRow({
          title: "Personality",
          model: new Gtk.StringList({
            strings: [
              "Friendly",
              "Shy",
              "Playful",
              "Wise",
              "Mischievous",
              "Caring",
              "Curious",
              "Lazy",
            ],
          }),
        });
        const personalityMap = {
          friendly: 0,
          shy: 1,
          playful: 2,
          wise: 3,
          mischievous: 4,
          caring: 5,
          curious: 6,
          lazy: 7,
        };
        personalityRow.set_selected(personalityMap[config.personality] || 0);
        personalityRow.connect("notify::selected", () => {
          const personalities = [
            "friendly",
            "shy",
            "playful",
            "wise",
            "mischievous",
            "caring",
            "curious",
            "lazy",
          ];
          config.personality = personalities[personalityRow.selected];
          this._savePetConfig(settings, petId, config);
        });
        petCard.add(personalityRow);

        const styleRow = new Adw.ComboRow({
          title: "Speaking Style",
          model: new Gtk.StringList({
            strings: [
              "Short & Cute",
              "Detailed",
              "Funny",
              "Soft",
              "Energetic",
              "Calm",
            ],
          }),
        });
        const styleMap = {
          "short and cute": 0,
          "detailed and explanatory": 1,
          "funny and exaggerated": 2,
          "soft and gentle": 3,
          "energetic and enthusiastic": 4,
          "calm and soothing": 5,
        };
        styleRow.set_selected(styleMap[config.speakingStyle] || 0);
        styleRow.connect("notify::selected", () => {
          const styles = [
            "short and cute",
            "detailed and explanatory",
            "funny and exaggerated",
            "soft and gentle",
            "energetic and enthusiastic",
            "calm and soothing",
          ];
          config.speakingStyle = styles[styleRow.selected];
          this._savePetConfig(settings, petId, config);
        });
        petCard.add(styleRow);

        const backgroundRow = new Adw.ActionRow({ title: "Background" });
        const backgroundEntry = new Gtk.Entry({
          text: config.background || "",
          placeholder_text: "Brief backstory for the pet",
          valign: Gtk.Align.CENTER,
        });
        backgroundEntry.connect("changed", () => {
          config.background = backgroundEntry.get_text();
          this._savePetConfig(settings, petId, config);
        });
        backgroundRow.add_suffix(backgroundEntry);
        petCard.add(backgroundRow);

        expander.add_row(petCard);
        petIndex++;
        loadNextPet();
      };

      loadNextPet();
    } catch (e) {
      console.error("Failed to load pet configs:", e);
    }
  }

  _savePetConfig(settings, petId, config) {
    try {
      const configs = JSON.parse(settings.get_string("pet-configs") || "{}");
      configs[petId] = config;
      settings.set_string("pet-configs", JSON.stringify(configs));
    } catch (e) {
      console.error("Failed to save pet config:", e);
    }
  }
}
