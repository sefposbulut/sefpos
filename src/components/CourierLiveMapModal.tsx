import { useEffect, useRef, useState, useCallback } from 'react';
import { createPortal } from 'react-dom';
import { X, MapPin, Navigation, RefreshCw, Package } from 'lucide-react';
import { supabase } from '../lib/supabase';

type LatLng = { lat: number; lng: number };

export interface CourierLiveMapOrder {
  id: string;
  order_number: string;
  customer_name: string | null;
  delivery_address: string | null;
  courier_id: string;
  courier_name: string | null;
}

interface Props {
  open: boolean;
  onClose: () => void;
  order: CourierLiveMapOrder;
  courierLat: number | null;
  courierLng: number | null;
}

type HistoryPoint = {
  lat: number;
  lng: number;
  created_at: string;
  order_id: string | null;
};

const OTHER_TRAIL_COLORS = ['#6366f1', '#8b5cf6', '#14b8a6', '#ec4899', '#eab308', '#64748b'];

let leafletLoadPromise: Promise<any> | null = null;

function loadLeaflet(): Promise<any> {
  if (typeof window === 'undefined') return Promise.reject();
  if ((window as any).L) return Promise.resolve((window as any).L);
  if (!leafletLoadPromise) {
    leafletLoadPromise = new Promise((resolve, reject) => {
      if (!document.querySelector('link[data-leaflet]')) {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        link.setAttribute('data-leaflet', '1');
        document.head.appendChild(link);
      }
      const script = document.createElement('script');
      script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
      script.onload = () => resolve((window as any).L);
      script.onerror = () => reject(new Error('Leaflet yüklenemedi'));
      document.head.appendChild(script);
    });
  }
  return leafletLoadPromise;
}

function motoIcon(L: any) {
  return L.divIcon({
    className: 'sefpos-courier-moto',
    html: `<div style="width:42px;height:42px;background:#2563eb;border:4px solid #fff;border-radius:50%;box-shadow:0 3px 12px rgba(0,0,0,.45);display:flex;align-items:center;justify-content:center;font-size:22px;z-index:1000">🛵</div>`,
    iconSize: [42, 42],
    iconAnchor: [21, 21],
  });
}

/** Turuncu çubuk pin — müşteri teslimat noktası (yüksek z-index ile harita üstünde) */
function customerPinIcon(L: any, label: string) {
  const safe = label.replace(/"/g, "'");
  return L.divIcon({
    className: 'sefpos-customer-pin',
    html: `
      <div style="position:relative;width:56px;height:80px;pointer-events:none;filter:drop-shadow(0 6px 14px rgba(0,0,0,.5))">
        <span style="position:absolute;top:-26px;left:50%;transform:translateX(-50%);white-space:nowrap;background:#c2410c;color:#fff;font-size:11px;font-weight:900;padding:3px 8px;border-radius:8px;border:3px solid #fff;box-shadow:0 2px 8px rgba(0,0,0,.35)">${safe}</span>
        <div style="position:absolute;top:4px;left:50%;transform:translateX(-50%);width:40px;height:40px;background:linear-gradient(180deg,#fdba74 0%,#ea580c 55%,#c2410c 100%);border:4px solid #fff;border-radius:50%;display:flex;align-items:center;justify-content:center;box-shadow:0 0 0 6px rgba(234,88,12,.5)">
          <span style="font-size:22px;line-height:1">📦</span>
        </div>
        <div style="position:absolute;top:40px;left:50%;transform:translateX(-50%);width:10px;height:34px;background:linear-gradient(180deg,#ea580c,#9a3412);border-left:3px solid #fff;border-right:3px solid #fff;border-radius:0 0 4px 4px"></div>
        <div style="position:absolute;bottom:0;left:50%;transform:translateX(-50%);width:22px;height:22px;background:#ea580c;border:4px solid #fff;border-radius:50%;box-shadow:0 0 0 10px rgba(234,88,12,.35)"></div>
      </div>`,
    iconSize: [56, 80],
    iconAnchor: [28, 80],
  });
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;

  try {
    const photon = await fetch(
      `https://photon.komoot.io/api/?q=${encodeURIComponent(q)}&limit=1&lang=tr`,
    );
    const pdata = await photon.json();
    const coords = pdata?.features?.[0]?.geometry?.coordinates;
    if (coords?.length >= 2) {
      return { lng: coords[0], lat: coords[1] };
    }
  } catch {
    /* photon */
  }

  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&countrycodes=tr&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SefPOS-CourierMap/1.0' },
    });
    const data = await res.json();
    if (data?.[0]?.lat && data?.[0]?.lon) {
      return { lat: parseFloat(data.lat), lng: parseFloat(data.lon) };
    }
  } catch {
    /* nominatim */
  }
  return null;
}

function groupTrailsByOrder(points: HistoryPoint[]): Map<string, HistoryPoint[]> {
  const map = new Map<string, HistoryPoint[]>();
  for (const p of points) {
    const key = p.order_id || '__none__';
    const arr = map.get(key) || [];
    arr.push(p);
    map.set(key, arr);
  }
  return map;
}

export function CourierLiveMapModal({ open, onClose, order, courierLat, courierLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const trailLayersRef = useRef<any[]>([]);
  const didFitBoundsRef = useRef(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [orderLabels, setOrderLabels] = useState<Record<string, string>>({});
  const [live, setLive] = useState<{ lat: number; lng: number } | null>(
    courierLat && courierLng ? { lat: courierLat, lng: courierLng } : null,
  );
  const [displayLive, setDisplayLive] = useState<{ lat: number; lng: number } | null>(
    courierLat && courierLng ? { lat: courierLat, lng: courierLng } : null,
  );
  const animFrameRef = useRef<number | null>(null);
  const [dest, setDest] = useState<LatLng | null>(null);
  const [geocodeFailed, setGeocodeFailed] = useState(false);
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchOrderLabels = useCallback(async () => {
    const { data } = await supabase
      .from('orders')
      .select('id, order_number')
      .eq('courier_id', order.courier_id)
      .not('delivery_status', 'eq', 'cancelled')
      .order('created_at', { ascending: false })
      .limit(30);
    const labels: Record<string, string> = {};
    (data || []).forEach((o: { id: string; order_number: string }) => {
      labels[o.id] = o.order_number || o.id.slice(0, 6);
    });
    setOrderLabels(labels);
  }, [order.courier_id]);

  const fetchHistory = useCallback(async () => {
    const since = new Date(Date.now() - 12 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('courier_location_history')
      .select('latitude, longitude, created_at, order_id')
      .eq('courier_id', order.courier_id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(800);
    if (data?.length) {
      setHistory(
        data.map((r: { latitude: number; longitude: number; created_at: string; order_id: string | null }) => ({
          lat: r.latitude,
          lng: r.longitude,
          created_at: r.created_at,
          order_id: r.order_id,
        })),
      );
    }
  }, [order.courier_id]);

  const fetchCourierLive = useCallback(async () => {
    const { data } = await supabase
      .from('couriers')
      .select('latitude, longitude, location_updated_at')
      .eq('id', order.courier_id)
      .maybeSingle();
    if (data?.latitude != null && data?.longitude != null) {
      setLive({ lat: data.latitude, lng: data.longitude });
      setLastUpdate(data.location_updated_at ? new Date(data.location_updated_at) : new Date());
    }
  }, [order.courier_id]);

  const resolveDest = useCallback(async () => {
    if (!order.delivery_address?.trim()) {
      setDest(null);
      setGeocodeFailed(false);
      return;
    }
    const hit = await geocodeAddress(order.delivery_address);
    if (hit) {
      setDest(hit);
      setGeocodeFailed(false);
    } else {
      setGeocodeFailed(true);
      setDest(null);
    }
  }, [order.delivery_address]);

  useEffect(() => {
    if (!open) return;
    void fetchOrderLabels();
    void fetchHistory();
    void fetchCourierLive();
    void resolveDest();

    const ch = supabase
      .channel(`courier-live-map-${order.courier_id}-${order.id}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'couriers', filter: `id=eq.${order.courier_id}` },
        (payload) => {
          const n = payload.new as { latitude?: number; longitude?: number; location_updated_at?: string };
          if (n.latitude != null && n.longitude != null) {
            setLive({ lat: n.latitude, lng: n.longitude });
            setLastUpdate(n.location_updated_at ? new Date(n.location_updated_at) : new Date());
          }
        },
      )
      .on(
        'postgres_changes',
        {
          event: 'INSERT',
          schema: 'public',
          table: 'courier_location_history',
          filter: `courier_id=eq.${order.courier_id}`,
        },
        (payload) => {
          const n = payload.new as {
            latitude: number;
            longitude: number;
            created_at: string;
            order_id: string | null;
          };
          if (n?.latitude == null) return;
          setHistory((prev) => {
            const next = [
              ...prev,
              {
                lat: n.latitude,
                lng: n.longitude,
                created_at: n.created_at,
                order_id: n.order_id,
              },
            ];
            return next.length > 800 ? next.slice(-800) : next;
          });
        },
      )
      .subscribe();

    const fallback = setInterval(() => void fetchCourierLive(), 4_000);
    return () => {
      supabase.removeChannel(ch);
      clearInterval(fallback);
    };
  }, [open, fetchHistory, fetchCourierLive, fetchOrderLabels, resolveDest, order.courier_id, order.id]);

  useEffect(() => {
    if (!open || !mapRef.current) return;
    let cancelled = false;

    void loadLeaflet().then((L) => {
      if (cancelled || !mapRef.current) return;
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }

      const center: [number, number] = live
        ? [live.lat, live.lng]
        : dest
          ? [dest.lat, dest.lng]
          : [41.0082, 28.9784];

      const map = L.map(mapRef.current, { zoomControl: true }).setView(center, 14);
      L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
        attribution: '© OpenStreetMap',
        maxZoom: 19,
      }).addTo(map);

      mapInstance.current = map;
      setMapReady(true);
    });

    return () => {
      cancelled = true;
    };
  }, [open]);

  useEffect(() => {
    if (!live) return;
    const from = displayLive ?? live;
    if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    const start = performance.now();
    const duration = 450;
    const step = (t: number) => {
      const p = Math.min(1, (t - start) / duration);
      const ease = p * (2 - p);
      setDisplayLive({
        lat: from.lat + (live.lat - from.lat) * ease,
        lng: from.lng + (live.lng - from.lng) * ease,
      });
      if (p < 1) animFrameRef.current = requestAnimationFrame(step);
    };
    animFrameRef.current = requestAnimationFrame(step);
    return () => {
      if (animFrameRef.current) cancelAnimationFrame(animFrameRef.current);
    };
  }, [live?.lat, live?.lng]);

  useEffect(() => {
    if (!mapReady || !mapInstance.current) return;
    const pos = displayLive ?? live;
    void loadLeaflet().then((L) => {
      const map = mapInstance.current;

      trailLayersRef.current.forEach((layer) => map.removeLayer(layer));
      trailLayersRef.current = [];

      const grouped = groupTrailsByOrder(history);
      let colorIdx = 0;
      grouped.forEach((pts, orderKey) => {
        if (pts.length < 2) return;
        const latlngs: [number, number][] = pts.map((p) => [p.lat, p.lng]);
        const isCurrent = orderKey === order.id;
        const layer = L.polyline(latlngs, {
          color: isCurrent ? '#ea580c' : OTHER_TRAIL_COLORS[colorIdx % OTHER_TRAIL_COLORS.length],
          weight: isCurrent ? 6 : 3,
          opacity: isCurrent ? 0.95 : 0.55,
          dashArray: isCurrent ? undefined : '8 6',
        }).addTo(map);
        const label = orderLabels[orderKey] || (orderKey === '__none__' ? 'Genel' : orderKey.slice(0, 6));
        layer.bindTooltip(isCurrent ? `Bu paket: ${order.order_number}` : `Paket: ${label}`, {
          sticky: true,
        });
        trailLayersRef.current.push(layer);
        if (!isCurrent) colorIdx += 1;
      });

      if (pos) {
        if (courierMarkerRef.current) {
          courierMarkerRef.current.setLatLng([pos.lat, pos.lng]);
        } else {
          courierMarkerRef.current = L.marker([pos.lat, pos.lng], { icon: motoIcon(L), zIndexOffset: 1000 })
            .addTo(map)
            .bindPopup(`🛵 ${order.courier_name || 'Kurye'}`);
        }
      }

      if (dest) {
        const pinLabel = order.customer_name?.split(' ')[0] || 'Müşteri';
        if (customerMarkerRef.current) {
          customerMarkerRef.current.setLatLng([dest.lat, dest.lng]);
        } else {
          customerMarkerRef.current = L.marker([dest.lat, dest.lng], {
            icon: customerPinIcon(L, pinLabel),
            zIndexOffset: 2000,
          })
            .addTo(map)
            .bindPopup(
              `<strong>${order.customer_name || 'Müşteri'}</strong><br/>${order.delivery_address || ''}`,
            )
            .openPopup();
        }
      }

      const bounds: [number, number][] = [];
      if (pos) bounds.push([pos.lat, pos.lng]);
      if (dest) bounds.push([dest.lat, dest.lng]);
      history.forEach((h) => bounds.push([h.lat, h.lng]));

      if (pos && didFitBoundsRef.current) {
        map.panTo([pos.lat, pos.lng], { animate: true, duration: 0.25 });
      }

      if (!didFitBoundsRef.current && bounds.length >= 1) {
        if (bounds.length >= 2) {
          map.fitBounds(bounds, { padding: [56, 56], maxZoom: 16 });
        } else {
          map.setView(bounds[0], 15);
        }
        didFitBoundsRef.current = true;
      }
    });
  }, [
    mapReady,
    displayLive,
    live,
    dest,
    history,
    order.id,
    order.order_number,
    order.courier_name,
    order.customer_name,
    order.delivery_address,
    orderLabels,
  ]);

  useEffect(() => {
    if (!open) {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      courierMarkerRef.current = null;
      customerMarkerRef.current = null;
      trailLayersRef.current = [];
      didFitBoundsRef.current = false;
      setMapReady(false);
      setGeocodeFailed(false);
    }
  }, [open]);

  if (!open) return null;

  const directionsUrl =
    live && order.delivery_address
      ? `https://www.google.com/maps/dir/?api=1&origin=${live.lat},${live.lng}&destination=${encodeURIComponent(order.delivery_address)}&travelmode=driving`
      : order.delivery_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
        : null;

  const trailLegend = Array.from(groupTrailsByOrder(history).entries())
    .filter(([, pts]) => pts.length >= 2)
    .map(([oid]) => ({
      id: oid,
      label: oid === order.id ? order.order_number : orderLabels[oid] || 'Diğer',
      isCurrent: oid === order.id,
    }));

  const modal = (
    <div
      className="fixed inset-0 z-[2147483000] flex flex-col bg-slate-900/98 isolate"
      style={{ top: 0, left: 0, right: 0, bottom: 0 }}
      role="dialog"
      aria-modal="true"
      onClick={onClose}
    >
      <div
        className="flex items-center justify-between px-3 py-2 sm:px-4 sm:py-3 bg-blue-700 text-white shrink-0 shadow-lg safe-area-top"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-2 min-w-0 flex-1 pr-2">
          <div className="w-10 h-10 bg-white/20 rounded-xl flex items-center justify-center shrink-0 text-lg">🛵</div>
          <div className="min-w-0">
            <p className="font-black text-sm truncate">Canlı kurye — {order.order_number}</p>
            <p className="text-xs text-blue-200 truncate">{order.courier_name}</p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          aria-label="Haritayı kapat"
          className="shrink-0 flex items-center gap-1.5 px-3 py-2.5 rounded-xl bg-white text-blue-800 hover:bg-blue-50 font-black text-sm shadow-md active:scale-95 transition"
        >
          <X className="w-5 h-5" />
          <span className="hidden sm:inline">Kapat</span>
        </button>
      </div>

      <div
        className="bg-orange-500 text-white px-4 py-3 shrink-0 border-b-4 border-orange-600 shadow-md"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-start gap-2">
          <MapPin className="w-6 h-6 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-100">Teslimat adresi (haritada turuncu pin)</p>
            <p className="font-black text-base leading-snug">{order.customer_name || 'Müşteri'}</p>
            <p className="text-sm font-semibold mt-1 leading-relaxed">{order.delivery_address || 'Adres yok'}</p>
            {geocodeFailed && order.delivery_address && (
              <p className="text-xs mt-1 text-orange-100">
                Pin otomatik yerleşemedi — «Navigasyonda aç» ile adresi haritada görün.
              </p>
            )}
          </div>
          <Package className="w-5 h-5 opacity-80 shrink-0" />
        </div>
        {directionsUrl && (
          <a
            href={directionsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-2 flex items-center justify-center gap-2 w-full py-2.5 bg-white text-orange-700 rounded-xl font-black text-sm"
          >
            <Navigation className="w-4 h-4" />
            Navigasyonda aç
          </a>
        )}
      </div>

      <div
        ref={mapRef}
        className="flex-1 min-h-[200px] w-full bg-slate-200 relative z-0"
        onClick={(e) => e.stopPropagation()}
      />

      <div
        className="shrink-0 bg-white border-t border-slate-200 px-3 py-2 space-y-2"
        onClick={(e) => e.stopPropagation()}
      >
        {trailLegend.length > 0 && (
          <div className="flex flex-wrap gap-1.5 text-[10px]">
            {trailLegend.map((t, i) => (
              <span
                key={t.id}
                className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md font-bold ${
                  t.isCurrent ? 'bg-orange-100 text-orange-800 ring-2 ring-orange-400' : 'bg-slate-100 text-slate-600'
                }`}
              >
                <span
                  className="w-3 h-1 rounded-full inline-block"
                  style={{
                    background: t.isCurrent ? '#ea580c' : OTHER_TRAIL_COLORS[i % OTHER_TRAIL_COLORS.length],
                  }}
                />
                {t.label}
              </span>
            ))}
          </div>
        )}
        <div className="flex items-center justify-between text-xs text-slate-600">
          <span className="flex items-center gap-2">
            <span>🛵</span> Kurye
            <span className="inline-block w-4 h-1 bg-orange-500 rounded" /> Bu paket
            <span>📍</span> Müşteri
          </span>
          <button
            type="button"
            onClick={() => {
              void fetchCourierLive();
              void fetchHistory();
              void resolveDest();
            }}
            className="flex items-center gap-1 font-bold text-blue-600"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            {lastUpdate
              ? `Canlı · ${lastUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
              : 'Bağlanıyor…'}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
