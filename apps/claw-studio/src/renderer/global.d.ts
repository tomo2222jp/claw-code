export {};

declare global {
  interface Window {
    clawStudio: {
      platform: string;
      loadStudioState: () => Promise<unknown>;
      saveStudioState: (payload: unknown) => Promise<void>;
    };
  }
}
