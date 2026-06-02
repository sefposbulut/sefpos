/**
 * Kasa yük simülasyonu — App.tsx navigate + premount köprüsü.
 */

export type PosStressHooks = {
  navigate: (page: string) => void;
  /** wasMounted setine sayfa ekler (gerçek kullanıcı gezintisi gibi). */
  premount: (pages: string[]) => void;
  getMountedPages: () => string[];
};

let hooks: PosStressHooks | null = null;

export function registerPosStressHooks(next: PosStressHooks | null): void {
  hooks = next;
}

export function getPosStressHooks(): PosStressHooks | null {
  return hooks;
}
