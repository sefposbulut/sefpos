import { Bold, Type } from 'lucide-react';
import type { PrintSettings, PrintStyleSettings } from '../../lib/printService';

export type ReceiptEditorKind = 'kitchen' | 'adisyon' | 'paket';

type Props = {
  kind: ReceiptEditorKind;
  settings: PrintSettings;
  patchPrintStyle: (partial: Partial<PrintStyleSettings>) => void;
  onRestaurantPatch?: (partial: Pick<PrintSettings, 'restaurantName' | 'receiptFooter'>) => void;
};

function BoldToggle({
  label,
  checked,
  onChange,
}: {
  label: string;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`flex items-center gap-2 px-3 py-2 rounded-lg border text-sm font-semibold transition ${
        checked
          ? 'bg-slate-800 border-slate-900 text-white shadow-sm'
          : 'bg-white border-slate-200 text-slate-600 hover:border-slate-400'
      }`}
    >
      <Bold className="w-4 h-4" />
      {label}
    </button>
  );
}

function SizeSlider({
  label,
  value,
  min,
  max,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  onChange: (v: number) => void;
}) {
  return (
    <div className="space-y-1">
      <div className="flex justify-between text-xs font-bold text-slate-600">
        <span>{label}</span>
        <span className="text-orange-600 tabular-nums">{value} px</span>
      </div>
      <input
        type="range"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full h-2 accent-orange-500 cursor-pointer"
      />
    </div>
  );
}

/** Önizlemenin hemen altında — kaydırınca / tıklayınca fiş anında güncellenir */
export function ReceiptLiveStylePanel({ kind, settings, patchPrintStyle, onRestaurantPatch }: Props) {
  const st = settings.printStyle;
  const isKitchen = kind === 'kitchen';

  return (
    <div className="rounded-xl border-2 border-slate-200 bg-white p-4 shadow-sm space-y-4">
      <div className="flex items-center gap-2 text-slate-800">
        <Type className="w-4 h-4 text-orange-500" />
        <span className="text-sm font-bold">Canlı düzenleme</span>
        <span className="text-[10px] text-slate-400 font-medium">— değişiklikler önizlemede anında görünür</span>
      </div>

      {onRestaurantPatch && (
        <div>
          <label className="block text-xs font-bold text-slate-600 mb-1">Restoran adı (fiş başlığı)</label>
          <input
            type="text"
            value={settings.restaurantName}
            onChange={(e) => onRestaurantPatch({ restaurantName: e.target.value })}
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm font-semibold"
          />
        </div>
      )}

      {isKitchen ? (
        <>
          <SizeSlider
            label="Başlık boyutu"
            value={st.kitchenTitlePx}
            min={10}
            max={28}
            onChange={(v) => patchPrintStyle({ kitchenTitlePx: v })}
          />
          <SizeSlider
            label="Ürün satırı boyutu"
            value={st.kitchenItemPx}
            min={10}
            max={28}
            onChange={(v) => patchPrintStyle({ kitchenItemPx: v })}
          />
          <SizeSlider
            label="Gövde / not boyutu"
            value={st.kitchenBodyPx}
            min={8}
            max={20}
            onChange={(v) => patchPrintStyle({ kitchenBodyPx: v })}
          />
          <div className="flex flex-wrap gap-2">
            <BoldToggle
              label="Başlık kalın"
              checked={st.kitchenTitleBold}
              onChange={(v) => patchPrintStyle({ kitchenTitleBold: v })}
            />
            <BoldToggle
              label="Ürün kalın"
              checked={st.kitchenProductBold}
              onChange={(v) => patchPrintStyle({ kitchenProductBold: v })}
            />
          </div>
          <input
            type="text"
            value={st.kitchenSubtitle}
            onChange={(e) => patchPrintStyle({ kitchenSubtitle: e.target.value })}
            placeholder="Alt başlık (logo altı)"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
        </>
      ) : (
        <>
          <SizeSlider
            label="Başlık boyutu"
            value={st.receiptTitlePx}
            min={10}
            max={28}
            onChange={(v) => patchPrintStyle({ receiptTitlePx: v })}
          />
          <SizeSlider
            label="Gövde boyutu"
            value={st.receiptBodyPx}
            min={8}
            max={22}
            onChange={(v) => patchPrintStyle({ receiptBodyPx: v })}
          />
          <div className="flex flex-wrap gap-2">
            <BoldToggle
              label="Başlık kalın"
              checked={st.receiptTitleBold}
              onChange={(v) => patchPrintStyle({ receiptTitleBold: v })}
            />
            <BoldToggle
              label="Ürün kalın"
              checked={st.receiptProductBold}
              onChange={(v) => patchPrintStyle({ receiptProductBold: v })}
            />
            <BoldToggle
              label="Toplam kalın"
              checked={st.receiptTotalBold}
              onChange={(v) => patchPrintStyle({ receiptTotalBold: v })}
            />
          </div>
          <input
            type="text"
            value={st.receiptSubtitle}
            onChange={(e) => patchPrintStyle({ receiptSubtitle: e.target.value })}
            placeholder="Alt başlık"
            className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
          />
          {onRestaurantPatch && (
            <input
              type="text"
              value={settings.receiptFooter}
              onChange={(e) => onRestaurantPatch({ receiptFooter: e.target.value })}
              placeholder="Fiş alt yazısı"
              className="w-full px-3 py-2 rounded-lg border border-slate-200 text-sm"
            />
          )}
        </>
      )}
    </div>
  );
}
