// Masaüstü (Electron) sürümünde preload.cjs'nin açtığı dar Steam köprüsü. Tarayıcıda yoktur; her çağrı isteğe bağlıdır.

export interface SteamBridge {
  achievement?: (id: string) => Promise<boolean>;
  cloudSave?: (json: string) => void;
  cloudLoad?: () => Promise<string | null>;
  playerName?: () => Promise<string | null>;
}

export function steamBridge(): SteamBridge | undefined {
  return typeof window === 'undefined' ? undefined : (window as unknown as { steamBridge?: SteamBridge }).steamBridge;
}
