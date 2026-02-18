import { execSync } from "child_process";

export function sendNotification(
  title: string,
  message: string,
  url?: string
) {
  const escapedTitle = title.replace(/"/g, '\\"');
  const escapedMessage = message.replace(/"/g, '\\"');

  try {
    // Try terminal-notifier first (more features)
    const openArg = url ? `-open "${url}"` : "";
    execSync(
      `terminal-notifier -title "${escapedTitle}" -message "${escapedMessage}" -sound default -group sermon-study ${openArg}`,
      { encoding: "utf-8" }
    );
  } catch {
    // Fallback to osascript
    execSync(
      `osascript -e 'display notification "${escapedMessage}" with title "${escapedTitle}" sound name "default"'`,
      { encoding: "utf-8" }
    );
  }
}
