# 🚀 Vibe Launcher

Vibe Launcher is a lightweight, modern project manager tailored specifically for keeping track of your "vibe coded" projects. Designed with a sleek, premium glassmorphic interface, it allows you to centralize your workflow without getting bogged down by heavy configurations.

## 🌟 Features

- **Clean Architecture:** Built on Node.js and Express, utilizing a simple local JSON file (`projects.json`) for persistence. No database installation or complex setups required!
- **Beautiful UI:** A dynamic, visually striking single-page application (SPA) featuring glassmorphism, fluid animations, and modern typography.
- **Project Tracking:** Easily add projects with their absolute file paths and optional logos.
- **Multiple Execution Commands:** Define custom runtime scripts for each project (e.g., frontend server, backend server, tests) that run cleanly in their own visible Command Prompt windows.
- **Integrated IDE Launcher:** Open your projects instantly in your editor of choice (e.g., `code`, `cursor`, `antigravity`).

## 🛠️ Tech Stack

- **Backend:** Node.js, Express.js
- **Frontend:** Vanilla HTML, CSS, JavaScript (Zero Build Steps!)
- **Database:** Local JSON File (`projects.json` - ignored from version control)
- **Styling:** Custom CSS with [Phosphor Icons](https://phosphoricons.com/) and [Google Fonts](https://fonts.google.com/).

## 🚀 Getting Started

### Prerequisites

You only need **Node.js** installed on your system.

### Installation

#### Option 1: Global CLI (Recommended)

To install Vibe Launcher globally so you can start it from any terminal window simply by typing `vibel`:

1. Clone or download this repository.
2. Navigate to the project folder:
   ```bash
   cd "path/to/VibeLauncher"
   ```
3. Install dependencies and the global package simultaneously:
   ```bash
   npm install -g .
   ```
   Or install it directly from NPM registry:
   ```bash
   npm install -g @vjixy/vibel
   ```

#### Option 2: Local Development

If you prefer to run it locally without installing it globally:

1. Clone or download this repository.
2. Navigate to the project folder and install dependencies:
   ```bash
   npm install
   ```

### Running the App

If you installed it globally via Option 1, open any terminal and just type:
```bash
vibel
```

If you installed it locally via Option 2, start the launcher from your project terminal:
```bash
npm start
```

The application will launch on your local server. Open your browser and go to:
**http://localhost:3000**

## 📂 Project Structure

```
VibeLauncher/
├── public/                 # Frontend assets
│   ├── index.html          # Main interface
│   ├── style.css           # Glassmorphic and animations styles
│   └── app.js              # Client-side logic and API calls
├── server.js               # Express API and command execution logic
├── projects.json           # Local database (auto-generated on first run)
├── package.json            # Node.js dependencies and scripts
└── README.md               # Project documentation
```

## 🪄 How to Use

1. Click **"New Project"** in the top right.
2. Enter the **Project Name** and the **Absolute Path** to the project on your machine.
3. Configure your **IDE Command** (e.g., `code` for VS Code, `antigravity`, or `cursor`).
4. Add as many **Execution Commands** as you need. For example:
   - Name: `Backend`, Command: `npm run server`
   - Name: `Frontend`, Command: `npm start`
5. Save the project!
6. Use the intuitive buttons on your project cards to pop open your IDE or trigger processes in new visible terminal windows.

---
*Built with ❤️ for rapid, beautiful vibe coding.*
