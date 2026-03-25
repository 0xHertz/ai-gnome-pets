# AI-Gnome-Pets 🎅

Brighten up your GNOME desktop with **AI-Gnome-Pets**! This extension brings small, animated 2D characters to life, letting them roam freely across your screen. They walk, jump, and even balance on top of your open windows.

Watch as they fall from the top of the screen, land on your active windows, and explore your desktop environment with charming pixel-art animations.

## Original Project

[Gnomelets](https://github.com/ihpled/gnomelets)

## Features

*   **Custom Characters**: Easily add your own pixel-art characters.
*   **Physics-based Movement**: Gnomelets obey gravity, falling naturally and landing on solid surfaces.
*   **Window Interaction**: They detect open windows and can walk along their title bars and top edges.
*   **Pixel-Art Animations**: Smooth idle, walking, jumping, and falling animations.
*   **State Persistence**: Gnomelets remember where they were even after you restart the shell or disable/enable the extension.
*   **Multi-Monitor Support**: They can travel and spawn across all your connected screens.
*   **Smart AI Behavior**: Gnomelets employ intelligent jumping mechanics, detecting edges to perform daring leaps and predicting reachable windows to climb upwards dynamically.
*   **Top Bar Controls**: A convenient menu in the top bar lets you instantly re-spawn all gnomelets or toggle their visibility on/off without opening settings.
*   **Interactive Drag & Drop with Momentum**: Pick up gnomelets with your mouse and toss them! They now support physics-based throwing—release them while moving the mouse to fling them across the screen.
*   **Dash to Dock (Ubuntu Dock) & Dash to Panel Support**: Gnomelets can now recognize, land on, and explore both Dash to Dock (Ubuntu Dock) and Dash to Panel if they are present on your screen!

## AI-Powered Conversations

Gnomelets now feature **AI-powered conversations**! Your desktop companions can talk with you and each other using large language models.

### Features

*   **Chat with Your Pet**: Double-click on a gnomelet to start a conversation! An input bubble will appear, following the pet as it moves around your screen.
*   **Multi-Provider Support**: Connect to various AI services:
    *   OpenAI (GPT-4, GPT-3.5 Turbo)
    *   Anthropic (Claude)
    *   Google Gemini
    *   Ollama (local models)
    *   LM Studio (local models)
    *   Azure OpenAI
    *   Custom OpenAI-compatible APIs
*   **Pet Personalities**: Customize each pet's:
    *   **Personality**: Set how your pet behaves (friendly, playful, shy, etc.)
    *   **Background**: Give your pet a unique backstory
    *   **Speaking Style**: Configure how they talk (cute, formal, casual, etc.)
*   **Conversation Memory**: Pets remember recent conversations and can reference them in future chats
*   **Pet-to-Pet Chat**: Two gnomelets can have conversations with each other! They can discuss topics, play games, or just hang out
*   **Memory-Based Dialog**: When pets talk to each other, their conversations are based on shared memories:
    *   If they have previous conversations, they reference past topics ("Hey, how's that thing going?")
    *   If they only have owner conversations, they can start topics based on what they learned from you
    *   If they have no memory, they just say hello like before
*   **Smart Trigger System**: Pet-to-pet conversations are triggered intelligently:
    *   **Multi-factor scoring**: Trigger score = memory score (0-40) + proximity score (5-30) + idle score (0-20) + random factor (0-10)
    *   **Memory score**: Has pet_pair memory = 40pts, has owner memory = 20pts, no memory = 0pts
    *   **Proximity score**: Distance <150px = 30pts, <300px = 25pts, <500px = 20pts, <800px = 15pts, <1200px = 10pts, ≥1200px = 5pts
    *   **Idle score**: Both idle = 20pts, one idle = 10pts, both moving = 0pts
    *   **Threshold**: Triggers when score ≥ 50 OR distance < 500px
*   **Manual Trigger**: Use the menu "Trigger Pet Chat" button to force a conversation regardless of score
*   **Auto-Trigger**: After each pet conversation completes, the system automatically schedules the next check after cooldown period
*   **Clear Memories**: Clear all pet conversation memories from the settings page

### Quick Start

1.  Enable AI in extension settings
2.  Select your AI provider and enter your API key
3.  Double-click on a gnomelet to start chatting!
4.  Customize your pet's personality in the settings

## Configuration

You can customize your experience via the extension settings:

*   **Character Selection**: Select one or more characters (e.g., Kitten, Santa Claus, etc.) from the list. If multiple are selected, they will appear randomly! The list automatically updates with any new folders found in the `images` directory.
*   **Population Control**: Decide how many gnomelets you want roaming your screen at once.
*   **Scale**: Adjust the size of the characters to fit your screen resolution or preference.
*   **In Front of Maximized**: Choose whether gnomelets walk in front of your windows or behind them. Use **Partial** or **Disallow** for a "distraction-free" experience: Partial intelligently hides gnomelets only when a maximized window is focused, while Disallow keeps them hidden behind maximized windows.
*   **Dock Support**: Explicitly select "Dash to Dock (Ubuntu Dock)", "Dash to Panel", or "None" to optimize interaction.
*   **Allows Interaction**: Now you can enable/disable the ability to drag and drop gnomelets with your mouse!
*   **Jump Power**: Configure the vertical jump strength to make gnomelets hop higher or lower.

### AI Configuration

In the extension settings, you can configure:

*   **Enable AI**: Toggle AI features on/off
*   **AI Provider**: Select your preferred AI service
*   **API Key**: Enter your API key for the selected provider
*   **Model**: Choose the specific model to use
*   **Base URL**: For local or custom providers (Ollama, LM Studio, etc.)
*   **Test Connection**: Verify your AI setup is working correctly

## Adding Custom Characters

Want to add your own character? It's easy!

1.  Navigate to the extension's `images` folder (usually in `~/.local/share/gnome-shell/extensions/gnomelets@.../images`).
2.  Create a new folder with your character's name (e.g., `Robot`).
3.  Add the PNG animation frames inside that folder:
    *   **0.png - 3.png**: Walking animation frames.
    *   **4.png**: Idle frame.
    *   **5.png**: Jumping/Falling frame.
    *   **6.png - 7.png**: (Optional) Dragging animation frames. If missing, frames `1.png` and `3.png` are used.
4.  Reload the extension or restart GNOME Shell. Your new character will appear in the settings dropdown!

## Installation

1.  Download the extension.
2.  Install it via `gnome-extensions install` or copy the folder to `~/.local/share/gnome-shell/extensions/`.
3.  Enable it using the Extensions app or `gnome-extensions enable`.
4.  Open the settings to choose your favorite Gnomelet!

---
*Created with ❤️ for the GNOME community.*
