let pending = false;

export function triggerVoiceStart(): void {
  pending = true;
}

export function consumeVoiceTrigger(): boolean {
  if (pending) {
    pending = false;
    return true;
  }
  return false;
}
