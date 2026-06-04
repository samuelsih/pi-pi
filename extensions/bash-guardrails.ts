import type { ExtensionAPI } from "@earendil-works/pi-coding-agent";
import { isToolCallEventType } from "@earendil-works/pi-coding-agent";

export default function (pi: ExtensionAPI) {
  pi.on("tool_call", async (event, _ctx) => {
    if (!isToolCallEventType("bash", event)) return;

    const command = event.input.command?.trim() ?? "";

    // Block if the command starts with grep (use the dedicated grep tool instead)
    if (/^grep\b/.test(command)) {
      return {
        block: true,
        reason:
          "Use the grep tool instead of bash for searching file contents. It's faster and purpose-built for this task.",
      };
    }
  });
}
