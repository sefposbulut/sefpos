import { useCallback, useRef, useState } from 'react';
import { ChevronDown, ArrowRight } from 'lucide-react';
import { FeaturesNavList } from './FeaturesNavList';

type FeaturesMegaMenuProps = {
  isActive: boolean;
  onNavigate: (path: string) => void;
};

const CLOSE_DELAY_MS = 220;

export function FeaturesMegaMenu({ isActive, onNavigate }: FeaturesMegaMenuProps) {
  const [open, setOpen] = useState(false);
  const closeTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const clearCloseTimer = useCallback(() => {
    if (closeTimerRef.current) {
      clearTimeout(closeTimerRef.current);
      closeTimerRef.current = null;
    }
  }, []);

  const openMenu = useCallback(() => {
    clearCloseTimer();
    setOpen(true);
  }, [clearCloseTimer]);

  const scheduleClose = useCallback(() => {
    clearCloseTimer();
    closeTimerRef.current = setTimeout(() => setOpen(false), CLOSE_DELAY_MS);
  }, [clearCloseTimer]);

  const goModule = (id: string) => {
    clearCloseTimer();
    setOpen(false);
    onNavigate(`/ozellikler#${id}`);
  };

  return (
    <div className="relative" onMouseEnter={openMenu} onMouseLeave={scheduleClose}>
      <button
        type="button"
        onClick={() => onNavigate('/ozellikler')}
        className={`inline-flex items-center gap-1 text-sm font-semibold transition-colors ${
          isActive ? 'text-orange-600' : 'text-slate-600 hover:text-orange-600'
        }`}
        aria-expanded={open}
        aria-haspopup="true"
      >
        Özellikler
        <ChevronDown className={`w-4 h-4 transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>

      {open && (
        <div
          className="absolute left-0 top-full z-[60] pt-1.5"
          onMouseEnter={openMenu}
          onMouseLeave={scheduleClose}
        >
          <div className="landing-features-mega-panel">
            <FeaturesNavList activeId={null} onSelect={goModule} compact />
            <div className="border-t border-slate-100 mt-2 pt-3 px-1">
              <button
                type="button"
                onClick={() => {
                  clearCloseTimer();
                  setOpen(false);
                  onNavigate('/ozellikler');
                }}
                className="text-sm font-bold text-orange-600 hover:text-red-700 inline-flex items-center gap-1"
              >
                Tüm özellikleri gör <ArrowRight className="w-4 h-4" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
