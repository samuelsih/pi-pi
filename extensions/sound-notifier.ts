/**
 * Sound Notifier Extension
 *
 * Plays a sound when the agent completes or fails a task.
 * - Success: anime-wow-sound-effect.wav
 * - Failure: fahhh-pump-sound.wav
 *
 * Uses PowerShell SoundPlayer to play .wav files.
 * Configure via /sound-settings command.
 */

import type {
  ExtensionAPI,
  ExtensionContext,
} from "@earendil-works/pi-coding-agent";
import { getSettingsListTheme } from "@earendil-works/pi-coding-agent";
import {
  Container,
  type SettingItem,
  SettingsList,
} from "@earendil-works/pi-tui";
import { spawn } from "node:child_process";
import { homedir } from "node:os";
import path from "node:path";
import { appendFileSync, existsSync } from "node:fs";

const SOUNDS_DIR = path.join(homedir(), ".pi", "agent", "sounds");
const SUCCESS_SOUND = path.join(SOUNDS_DIR, "anime-wow-sound-effect.wav");
const FAILURE_SOUND = path.join(SOUNDS_DIR, "fahhh-pump-sound.wav");

interface SoundSettings {
  successEnabled: boolean;
  failureEnabled: boolean;
}

const DEFAULT_SETTINGS: SoundSettings = {
  successEnabled: true,
  failureEnabled: true,
};

function playSound(filePath: string): void {
  if (!existsSync(filePath)) {
    console.log(`ERROR: File not found - ${filePath}`);
    return;
  }

  const psScript = `
    $player = New-Object System.Media.SoundPlayer '${filePath.replace(/\\/g, "\\\\")}'
    $player.PlaySync()
  `;

  const child = spawn(
    "powershell.exe",
    ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", psScript],
    {
      stdio: "ignore",
      windowsHide: true,
    },
  );

  if (child) {
    child.unref();
  }
}

export default function (pi: ExtensionAPI) {
  let settings: SoundSettings = { ...DEFAULT_SETTINGS };

  // Persist settings to session
  function persistSettings() {
    pi.appendEntry<SoundSettings>("sound-notifier-settings", { ...settings });
  }

  // Restore settings from session branch
  function restoreFromBranch(ctx: ExtensionContext) {
    const branchEntries = ctx.sessionManager.getBranch();
    let saved: SoundSettings | undefined;

    for (const entry of branchEntries) {
      if (
        entry.type === "custom" &&
        entry.customType === "sound-notifier-settings"
      ) {
        const data = entry.data as SoundSettings | undefined;
        if (data) {
          saved = data;
        }
      }
    }

    if (saved) {
      settings = {
        successEnabled: saved.successEnabled ?? DEFAULT_SETTINGS.successEnabled,
        failureEnabled: saved.failureEnabled ?? DEFAULT_SETTINGS.failureEnabled,
      };
    } else {
      settings = { ...DEFAULT_SETTINGS };
    }
  }

  // Play sound when agent finishes
  pi.on("agent_end", async (event) => {
    try {
      // Check for unexpected agent errors (not tool errors, which are normal)
      // Look at the last assistant message for error/aborted stop reasons
      let hadAgentError = false;
      for (const msg of event.messages) {
        if (
          msg.role === "assistant" &&
          (msg.stopReason === "error" || msg.stopReason === "aborted")
        ) {
          hadAgentError = true;
          break;
        }
      }

      if (hadAgentError && settings.failureEnabled) {
        playSound(FAILURE_SOUND);
      } else if (!hadAgentError && settings.successEnabled) {
        playSound(SUCCESS_SOUND);
      }
    } catch {
      // Silently ignore sound playback errors
    }
  });

  // Restore settings on session start
  pi.on("session_start", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  // Restore settings on tree navigation
  pi.on("session_tree", async (_event, ctx) => {
    restoreFromBranch(ctx);
  });

  // Register /sound command
  pi.registerCommand("sound", {
    description: "Configure sound notifications",
    handler: async (_args, ctx) => {
      await ctx.ui.custom((_tui, theme, _kb, done) => {
        const items: SettingItem[] = [
          {
            id: "successEnabled",
            label: "Success sound (anime wow)",
            currentValue: settings.successEnabled ? "enabled" : "disabled",
            values: ["enabled", "disabled"],
          },
          {
            id: "failureEnabled",
            label: "Failure sound (fahhh pump)",
            currentValue: settings.failureEnabled ? "enabled" : "disabled",
            values: ["enabled", "disabled"],
          },
        ];

        const container = new Container();
        container.addChild(
          new (class {
            render(_width: number) {
              return [
                theme.fg("accent", theme.bold("Sound Notifications")),
                "",
              ];
            }
            invalidate() {}
          })(),
        );

        const settingsList = new SettingsList(
          items,
          Math.min(items.length + 2, 15),
          getSettingsListTheme(),
          (id, newValue) => {
            const enabled = newValue === "enabled";
            if (id === "successEnabled") {
              settings.successEnabled = enabled;
            } else if (id === "failureEnabled") {
              settings.failureEnabled = enabled;
            }
            persistSettings();
          },
          () => {
            done(undefined);
          },
        );

        container.addChild(settingsList);

        return {
          render(width: number) {
            return container.render(width);
          },
          invalidate() {
            container.invalidate();
          },
          handleInput(data: string) {
            settingsList.handleInput?.(data);
          },
        };
      });
    },
  });
}
