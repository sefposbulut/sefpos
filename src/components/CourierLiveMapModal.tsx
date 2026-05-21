import { useEffect, useRef, useState, useCallback } from 'react';
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

type HistoryPoint = { lat: number; lng: number; created_at: string };

let leafletLoadPromise: Promise<typeof window & { L: any }> | null = null;

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
    className: '',
    html: `<div style="width:36px;height:36px;background:#2563eb;border:3px solid #fff;border-radius:50%;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:18px">🛵</div>`,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
  });
}

function customerIcon(L: any) {
  return L.divIcon({
    className: '',
    html: `<div style="width:32px;height:32px;background:#ea580c;border:3px solid #fff;border-radius:8px;box-shadow:0 2px 8px rgba(0,0,0,.35);display:flex;align-items:center;justify-content:center;font-size:16px">📍</div>`,
    iconSize: [32, 32],
    iconAnchor: [16, 32],
  });
}

async function geocodeAddress(address: string): Promise<LatLng | null> {
  const q = address.trim();
  if (!q) return null;
  try {
    const url = `https://nominatim.openstreetmap.org/search?format=json&limit=1&q=${encodeURIComponent(q)}`;
    const res = await fetch(url, {
      headers: { Accept: 'application/json', 'User-Agent': 'SefPOS-CourierMap/1.0' },
    });
    const data = await res.json();
    if (data?.[0]?.lat && data?.[0]?.lon) {
      return { lat: parseFloat(data.lat), lng: parseFloat(data.lon) };
    }
  } catch {
    /* CORS veya ağ — sadece metin gösterilir */
  }
  return null;
}

export function CourierLiveMapModal({ open, onClose, order, courierLat, courierLng }: Props) {
  const mapRef = useRef<HTMLDivElement>(null);
  const mapInstance = useRef<any>(null);
  const courierMarkerRef = useRef<any>(null);
  const customerMarkerRef = useRef<any>(null);
  const trailRef = useRef<any>(null);
  const didFitBoundsRef = useRef(false);
  const [history, setHistory] = useState<HistoryPoint[]>([]);
  const [live, setLive] = useState<{ lat: number; lng: number } | null>(
    courierLat && courierLng ? { lat: courierLat, lng: courierLng } : null,
  );
  const [dest, setDest] = useState<LatLng | null>(null);
  const [mapReady, setMapReady] = useState(false);
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null);

  const fetchHistory = useCallback(async () => {
    const since = new Date(Date.now() - 6 * 60 * 60 * 1000).toISOString();
    const { data } = await supabase
      .from('courier_location_history')
      .select('latitude, longitude, created_at')
      .eq('courier_id', order.courier_id)
      .gte('created_at', since)
      .order('created_at', { ascending: true })
      .limit(500);
    if (data?.length) {
      setHistory(
        data.map((r: { latitude: number; longitude: number; created_at: string }) => ({
          lat: r.latitude,
          lng: r.longitude,
          created_at: r.created_at,
        })),
      );
    }
  }, [order.courier_id, order.id]);

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

  useEffect(() => {
    if (!open) return;
    void fetchHistory();
    void fetchCourierLive();
    if (order.delivery_address) {
      void geocodeAddress(order.delivery_address).then(setDest);
    }

    const ch = supabase
      .channel(`courier-live-map-${order.courier_id}`)
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
          const n = payload.new as { latitude: number; longitude: number; created_at: string };
          if (n?.latitude == null) return;
          setHistory((prev) => {
            const next = [...prev, { lat: n.latitude, lng: n.longitude, created_at: n.created_at }];
            return next.length > 500 ? next.slice(-500) : next;
          });
        },
      )
      .subscribe();

    const fallback = setInterval(() => {
      void fetchCourierLive();
    }, 12_000);

    return () => {
      supabase.removeChannel(ch);
      clearInterval(fallback);
    };
  }, [open, fetchHistory, fetchCourierLive, order.courier_id, order.delivery_address]);

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
    if (!mapReady || !mapInstance.current) return;
    void loadLeaflet().then((L) => {
      const map = mapInstance.current;
      const points: [number, number][] = history.map((h) => [h.lat, h.lng]);
      if (live) points.push([live.lat, live.lng]);

      if (trailRef.current) {
        trailRef.current.setLatLngs(points);
      } else if (points.length > 1) {
        trailRef.current = L.polyline(points, { color: '#2563eb', weight: 4, opacity: 0.75 }).addTo(map);
      }

      if (live) {
        if (courierMarkerRef.current) {
          courierMarkerRef.current.setLatLng([live.lat, live.lng]);
        } else {
          courierMarkerRef.current = L.marker([live.lat, live.lng], { icon: motoIcon(L) })
            .addTo(map)
            .bindPopup(`🛵 ${order.courier_name || 'Kurye'}`);
        }
      }

      if (dest) {
        if (customerMarkerRef.current) {
          customerMarkerRef.current.setLatLng([dest.lat, dest.lng]);
        } else {
          customerMarkerRef.current = L.marker([dest.lat, dest.lng], { icon: customerIcon(L) })
            .addTo(map)
            .bindPopup(`📍 ${order.customer_name || 'Müşteri'}`);
        }
      }

      const bounds: [number, number][] = [];
      if (live) bounds.push([live.lat, live.lng]);
      if (dest) bounds.push([dest.lat, dest.lng]);
      history.forEach((h) => bounds.push([h.lat, h.lng]));

      if (live && courierMarkerRef.current) {
        courierMarkerRef.current.setLatLng([live.lat, live.lng]);
        if (didFitBoundsRef.current) {
          map.panTo([live.lat, live.lng], { animate: true, duration: 0.35 });
        }
      }

      if (!didFitBoundsRef.current) {
        if (bounds.length >= 2) {
          map.fitBounds(bounds, { padding: [48, 48], maxZoom: 16 });
          didFitBoundsRef.current = true;
        } else if (bounds.length === 1) {
          map.setView(bounds[0], 15);
          didFitBoundsRef.current = true;
        }
      }
    });
  }, [mapReady, live, dest, history, order.courier_name, order.customer_name]);

  useEffect(() => {
    if (!open) {
      if (mapInstance.current) {
        mapInstance.current.remove();
        mapInstance.current = null;
      }
      courierMarkerRef.current = null;
      customerMarkerRef.current = null;
      trailRef.current = null;
      didFitBoundsRef.current = false;
      setMapReady(false);
    }
  }, [open]);

  if (!open) return null;

  const directionsUrl =
    live && order.delivery_address
      ? `https://www.google.com/maps/dir/?api=1&origin=${live.lat},${live.lng}&destination=${encodeURIComponent(order.delivery_address)}&travelmode=driving`
      : order.delivery_address
        ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(order.delivery_address)}`
        : null;

  return (
    <div className="fixed inset-0 z-[200] flex flex-col bg-slate-900/95">
      <div className="flex items-center justify-between px-4 py-3 bg-blue-700 text-white shrink-0">
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-9 h-9 bg-white/20 rounded-xl flex items-center justify-center shrink-0 text-lg">🛵</div>
          <div className="min-w-0">
            <p className="font-black text-sm truncate">Canlı kurye — {order.order_number}</p>
            <p className="text-xs text-blue-200 truncate">{order.courier_name}</p>
          </div>
        </div>
        <button type="button" onClick={onClose} className="p-2 rounded-xl bg-white/10 hover:bg-white/20">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="bg-orange-500 text-white px-4 py-3 shrink-0 border-b-4 border-orange-600">
        <div className="flex items-start gap-2">
          <MapPin className="w-5 h-5 shrink-0 mt-0.5" />
          <div className="min-w-0 flex-1">
            <p className="text-[10px] font-bold uppercase tracking-wide text-orange-100">Müşteri adresi</p>
            <p className="font-black text-base leading-snug">{order.customer_name || 'Müşteri'}</p>
            <p className="text-sm font-semibold mt-1 leading-relaxed">{order.delivery_address || 'Adres yok'}</p>
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

      <div ref={mapRef} className="flex-1 min-h-[240px] w-full bg-slate-200" />

      <div className="shrink-0 bg-white px-4 py-3 flex items-center justify-between text-xs text-slate-600 border-t">
        <span className="flex items-center gap-1">
          <span className="text-lg">🛵</span> Kurye
          <span className="mx-1">·</span>
          <span className="text-lg">📍</span> Müşteri
        </span>
        <button
          type="button"
          onClick={() => { void fetchCourierLive(); void fetchHistory(); }}
          className="flex items-center gap-1 font-bold text-blue-600"
        >
          <RefreshCw className="w-3.5 h-3.5" />
          {lastUpdate
            ? `Canlı · ${lastUpdate.toLocaleTimeString('tr-TR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })}`
            : 'Bağlanıyor…'}
        </button>
      </div>
    </div>
  );
}
