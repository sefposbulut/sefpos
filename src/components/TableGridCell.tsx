import { memo, type MutableRefObject } from 'react';
import { Clock, Lock } from 'lucide-react';
import { LiveDuration } from './LiveDuration';

export type TableGridCellModel = {
  id: string;
  table_number: string | number;
  status: string;
  session_start?: string | null;
  current_order_id?: string | null;
  payment_locked?: boolean | null;
  order?: {
    total_amount: number;
    payment_status?: string | null;
    remaining_amount?: number | null;
  };
};

type Props = {
  table: TableGridCellModel;
  variant: 'mobile' | 'desktop';
  colCount: number;
  isActive: boolean;
  corporateFontFamily: string;
  fmtInt: (n: number) => string;
  onSelect: (table: TableGridCellModel) => void;
  onPrefetch: (table: TableGridCellModel) => void;
  mobileScrollMovedRef?: MutableRefObject<boolean>;
};

function TableGridCellInner({
  table,
  variant,
  colCount,
  isActive,
  corporateFontFamily,
  fmtInt,
  onSelect,
  onPrefetch,
  mobileScrollMovedRef,
}: Props) {
  const isLocked = !!table.payment_locked;
  const isPartial = !isLocked && table.order?.payment_status === 'partial';
  const isMobile = variant === 'mobile';

  const statusColor = isPartial
    ? 'bg-amber-500'
    : table.status === 'occupied'
      ? 'bg-green-600'
      : !isMobile && table.status === 'reserved'
        ? 'bg-yellow-500'
        : 'bg-orange-500';

  const tableNum = String(table.table_number);
  const isMany = isMobile ? colCount >= 5 : colCount >= 9;
  const isMedium = isMobile ? colCount === 4 : colCount >= 7;

  const cardH = isMobile ? (isMany ? 64 : isMedium ? 84 : 100) : undefined;
  const numFontSize = isMobile
    ? isMany
      ? tableNum.length <= 2 ? 20 : 14
      : isMedium
        ? tableNum.length <= 2 ? 26 : 18
        : tableNum.length <= 2 ? 34 : tableNum.length <= 4 ? 24 : 18
    : isMany
      ? tableNum.length <= 2 ? 28 : 19
      : isMedium
        ? tableNum.length <= 2 ? 34 : 23
        : tableNum.length <= 2 ? 44 : tableNum.length <= 4 ? 32 : 24;

  const subFontSize = isMobile ? (isMany ? 11 : isMedium ? 12 : 14) : isMany ? 14 : isMedium ? 16 : 18;
  const dkFontSize = isMobile ? (isMany ? 10 : isMedium ? 11 : 12) : isMany ? 12 : isMedium ? 13 : 14;

  const rounded = isMobile ? 'rounded-xl' : 'rounded-2xl';
  const desktopPad = !isMobile && isMany ? 6 : 14;

  return (
    <button
      type="button"
      onPointerDown={(e) => {
        if (!isLocked) {
          e.currentTarget.style.transform = 'scale(0.93)';
          if (table.current_order_id) onPrefetch(table);
        }
      }}
      onPointerUp={(e) => {
        e.currentTarget.style.transform = '';
        if (isLocked) return;
        if (isMobile && mobileScrollMovedRef?.current) return;
        onSelect(table);
      }}
      onPointerLeave={(e) => {
        e.currentTarget.style.transform = '';
      }}
      className={`${statusColor} ${rounded} flex flex-col items-center justify-center text-white shadow-lg relative select-none overflow-hidden touch-manipulation ${isMobile ? '' : 'aspect-square hover:shadow-xl'}`}
      style={{
        height: cardH,
        transition: 'transform 0.08s ease',
        padding: isMobile ? undefined : desktopPad,
      }}
    >
      {isLocked && (
        <div className={`absolute ${isMobile ? 'top-1 right-1' : 'top-1.5 right-1.5'} rounded-full bg-black/25 p-0.5`}>
          <Lock
            style={{
              width: isMobile ? (isMany ? 12 : 16) : isMany ? 14 : 18,
              height: isMobile ? (isMany ? 12 : 16) : isMany ? 14 : 18,
            }}
            className="text-white"
          />
        </div>
      )}
      <div
        className="font-black leading-none tracking-tight"
        style={{
          fontSize: numFontSize,
          marginBottom: isMobile ? undefined : 4,
          fontFamily: corporateFontFamily,
        }}
      >
        {tableNum}
      </div>

      {isLocked ? (
        <div className="font-bold opacity-90 tracking-tight" style={{ fontSize: dkFontSize, marginTop: isMobile ? 2 : undefined, fontFamily: corporateFontFamily }}>
          ödeme
        </div>
      ) : isPartial ? (
        <>
          <div
            className={`font-black ${isMobile ? 'opacity-95 tracking-tight' : 'leading-tight tracking-tight'}`}
            style={{ fontSize: subFontSize, marginTop: isMobile ? 3 : undefined, fontFamily: corporateFontFamily }}
          >
            {fmtInt(table.order!.remaining_amount ?? table.order!.total_amount)}
          </div>
          <div
            className={`font-black ${isMobile ? 'opacity-95 tracking-wide' : 'tracking-wide mt-1'}`}
            style={{ fontSize: dkFontSize, marginTop: isMobile ? 1 : undefined, fontFamily: corporateFontFamily }}
          >
            {isMobile ? 'KISMİ ÖD.' : 'KISMİ ÖDEME'}
          </div>
        </>
      ) : table.status === 'occupied' && table.order ? (
        <>
          <div
            className={`font-black ${isMobile ? 'opacity-95 tracking-tight' : 'leading-tight tracking-tight'}`}
            style={{ fontSize: subFontSize, marginTop: isMobile ? 3 : undefined, fontFamily: corporateFontFamily }}
          >
            {fmtInt(table.order.total_amount)}
          </div>
          {table.session_start && !isMobile && (
            <div className="font-bold opacity-90 flex items-center gap-0.5 mt-1.5 tracking-tight" style={{ fontSize: dkFontSize, fontFamily: corporateFontFamily }}>
              <Clock style={{ width: dkFontSize, height: dkFontSize }} className="shrink-0" />
              <LiveDuration startTime={table.session_start} active={isActive} />
            </div>
          )}
        </>
      ) : (
        <div
          className={`font-bold ${isMobile ? 'opacity-90' : 'opacity-85'} tracking-tight`}
          style={{ fontSize: subFontSize, marginTop: isMobile ? 3 : undefined, fontFamily: corporateFontFamily }}
        >
          {isMobile ? 'BOŞ' : 'Boş'}
        </div>
      )}

      {isMobile && table.session_start && table.status === 'occupied' && !isLocked && !isPartial && (
        <div className="font-bold opacity-90 flex items-center gap-0.5 tracking-tight" style={{ fontSize: dkFontSize, marginTop: 2, fontFamily: corporateFontFamily }}>
          <Clock style={{ width: dkFontSize - 1, height: dkFontSize - 1 }} className="shrink-0" />
          <LiveDuration startTime={table.session_start} active={isActive} />
        </div>
      )}
    </button>
  );
}

function propsEqual(a: Props, b: Props): boolean {
  const ta = a.table;
  const tb = b.table;
  return (
    a.variant === b.variant &&
    a.colCount === b.colCount &&
    a.isActive === b.isActive &&
    a.corporateFontFamily === b.corporateFontFamily &&
    ta.id === tb.id &&
    ta.status === tb.status &&
    ta.table_number === tb.table_number &&
    ta.session_start === tb.session_start &&
    !!ta.payment_locked === !!tb.payment_locked &&
    ta.order?.total_amount === tb.order?.total_amount &&
    ta.order?.payment_status === tb.order?.payment_status &&
    ta.order?.remaining_amount === tb.order?.remaining_amount
  );
}

export const TableGridCell = memo(TableGridCellInner, propsEqual);
