// Emails open in their own browser tab. These helpers keep that tab and the
// inbox tab that opened it in step.

export type SyncedAction = "markRead" | "star" | "unstar" | "archive" | "trash";

type MessageActionEvent = { type: "messageAction"; messageId: string; action: SyncedAction };
type LabelsChangedEvent = { type: "labelsChanged" };

const CHANNEL = "mail-sync";

// Tell other open tabs (the inbox list) about a change saved to Gmail here.
export function announceMessageAction(messageId: string, action: SyncedAction): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: "messageAction", messageId, action } satisfies MessageActionEvent);
    channel.close();
  } catch {
    // Older browsers: the inbox catches up on its next refresh.
  }
}

// A folder was created (or a conversation's folders changed) in another tab.
export function announceLabelsChanged(): void {
  try {
    const channel = new BroadcastChannel(CHANNEL);
    channel.postMessage({ type: "labelsChanged" } satisfies LabelsChangedEvent);
    channel.close();
  } catch {
    // The inbox picks it up on its next refresh.
  }
}

export function onLabelsChanged(handler: () => void): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<LabelsChangedEvent>) => {
    if (e.data?.type === "labelsChanged") handler();
  };
  return () => channel.close();
}

export function onMessageAction(
  handler: (messageId: string, action: SyncedAction) => void
): () => void {
  if (typeof BroadcastChannel === "undefined") return () => {};
  const channel = new BroadcastChannel(CHANNEL);
  channel.onmessage = (e: MessageEvent<MessageActionEvent>) => {
    if (e.data?.type === "messageAction") handler(e.data.messageId, e.data.action);
  };
  return () => channel.close();
}

// Leaving an email: close its tab if the inbox opened it (the inbox is still
// open behind it), otherwise — e.g. a pasted link — navigate as usual.
export function closeTabOr(fallback: () => void): void {
  if (window.opener) {
    window.close();
    // Browsers silently refuse to close tabs they don't consider script-opened.
    setTimeout(() => {
      if (!window.closed) fallback();
    }, 300);
  } else {
    fallback();
  }
}
