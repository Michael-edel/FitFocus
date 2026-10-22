/** One explicit form submission at a time, including the cloud patch path. */
export class ProfileDraftSave {
  busy = false;
  private lastSuccessfulSubmission: string | null = null;

  async run(input: {
    submissionKey: string;
    save: () => Promise<boolean>;
    isCurrent: () => boolean;
    setBusy: (busy: boolean) => void;
    saved: () => void;
    failed: () => void;
  }): Promise<void> {
    if (this.busy || this.lastSuccessfulSubmission === input.submissionKey || !input.isCurrent()) return;
    this.busy = true;
    input.setBusy(true);
    try {
      const saved = await input.save();
      if (!input.isCurrent()) return;
      if (saved) {
        this.lastSuccessfulSubmission = input.submissionKey;
        input.saved();
      }
      else input.failed();
    } catch {
      if (input.isCurrent()) input.failed();
    } finally {
      this.busy = false;
      input.setBusy(false);
    }
  }
}
