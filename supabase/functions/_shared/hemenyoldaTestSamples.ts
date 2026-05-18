// deno-lint-ignore-file no-explicit-any
import type { HemenyoldaAction } from "./hemenyoldaWebhook.ts";
import {
  formatHemenYoldaUtcDateTime,
  TRENDYOL_HEMENYOLDA_CALL_CENTER,
} from "./hemenyoldaWebhook.ts";

/** Sertifikasyon/test: createdAt ve scheduledAt bugün — UTC. */
export function applyTodayDatesToHemenYoldaTestOrder(order: Record<string, unknown>): void {
  const now = formatHemenYoldaUtcDateTime();
  order.createdAt = now;
  if (order.scheduledAt != null) {
    const plusHour = new Date(Date.now() + 60 * 60 * 1000);
    order.scheduledAt = formatHemenYoldaUtcDateTime(plusHour);
  }
}

/** HemenYolda sertifikasyon örnekleri (dokümantasyon ile uyumlu). */
export const HEMENYOLDA_TEST_SAMPLES: Record<
  string,
  { action: HemenyoldaAction; payload: { order: Record<string, unknown> } }
> = {
  getir: {
    action: "new",
    payload: {
      order: {
        id: "6555dc4a1fcf792dd71545b11033",
        customer: {
          fullName: "Mehmet Yılmaz",
          phoneNumber: "8503469382",
          phoneCode: "306430",
        },
        address: {
          text: "Eğitim Mah. Murat Paşa Cd. No:13",
          description: "Irmaklar marketin alt sokağından girince sağdan 2. sokak",
          lat: 40.9906195,
          lon: 29.0434706,
        },
        products: [
          {
            id: "BURGER_1_ID",
            name: "Lüx Hamburger Menü",
            price: 128,
            quantity: 3,
            options: [
              { name: "Baharatlı Patates Kızartması" },
              { name: "Büyük Ayran" },
              { name: "Turşu Olmasın" },
            ],
          },
          {
            id: "EXTRAS_1212_ID",
            name: "Çıtır Mozerella Peyniri",
            price: 56,
            quantity: 2,
            options: null,
          },
        ],
        source: "Getir",
        note: "Zil çalışmıyor. Kurye arkadaş gelince arasın lütfen.",
        totalAmount: 496,
        totalDiscount: 20,
        paymentMethod: "Online Kredi/Banka Kartı",
        platformCode: "f373",
        dailyOrderNo: "16",
        createdAt: "2023-11-16 09:09:31",
        scheduledAt: null,
        courierPhone: null,
      },
    },
  },
  yemeksepeti: {
    action: "new",
    payload: {
      order: {
        id: "order_id-123-123",
        customer: {
          fullName: "Fatma Kaya",
          phoneNumber: "5554443322",
          phoneCode: null,
        },
        address: {
          text: "Hasanpaşa Mah. Sina Sk. No:1",
          description: "İkbal ltdnin karşısında. Giriş binanın sol tarafından.",
          lat: 40.9952952,
          lon: 29.0371583,
        },
        products: [
          {
            id: "11421",
            name: "Ankara Simidi",
            price: 14.7,
            quantity: 5,
            options: null,
          },
          {
            id: "12330098",
            name: "Beyaz Krem Peynir",
            price: 11.9,
            quantity: 5,
            options: null,
          },
        ],
        source: "YemekSepeti",
        note: "Simitler sıcak olsun lütfen",
        totalAmount: 133,
        totalDiscount: null,
        paymentMethod: "Nakit",
        platformCode: "hbdz-5xbx",
        dailyOrderNo: "3",
        createdAt: "2023-11-16 05:10:31",
        scheduledAt: "2023-11-16 10:15:00",
        courierPhone: null,
      },
    },
  },
  trendyol: {
    action: "new",
    payload: {
      order: {
        id: "ty-order-2023-88421",
        customer: {
          fullName: "Ayşe Öztürk",
          phoneNumber: TRENDYOL_HEMENYOLDA_CALL_CENTER,
          phoneCode: "55544433221",
        },
        address: {
          text: "Caferağa Mah. Moda Cad. No:42 D:3",
          description: "Kapıda zil yok, arayın",
          lat: 40.9847,
          lon: 29.0264,
        },
        products: [
          {
            id: "TY_PIZZA_01",
            name: "Karışık Pizza (Büyük)",
            price: 189,
            quantity: 1,
            options: [
              { name: "İnce Hamur" },
              { name: "Ekstra Sucuk" },
            ],
          },
          {
            id: "TY_DRINK_02",
            name: "Kola 1L",
            price: 45,
            quantity: 2,
            options: null,
          },
        ],
        source: "Trendyol",
        note: "Servis getirmeyin",
        totalAmount: 279,
        totalDiscount: 15,
        paymentMethod: "Online Kredi/Banka Kartı",
        platformCode: "00F",
        dailyOrderNo: "8",
        createdAt: "2023-11-16 11:22:00",
        scheduledAt: null,
        courierPhone: null,
      },
    },
  },
  telefon: {
    action: "new",
    payload: {
      order: {
        id: "22453344213",
        customer: {
          fullName: "Hüseyin Demir",
          phoneNumber: "5554443322",
          phoneCode: null,
        },
        address: {
          text: "Acıbadem Mah. Nazifbey Sk. No:57",
          description: null,
          lat: null,
          lon: null,
        },
        products: [
          {
            id: "12",
            name: "Fıstık Drajeli Pasta 4-5 Kişilik",
            price: 294,
            quantity: 1,
            options: null,
          },
          {
            id: "15",
            name: "Tartolet 500gr.",
            price: 110,
            quantity: 1,
            options: [{ name: "Karışık" }],
          },
        ],
        source: "Telefon",
        note: "Elinizde mum varsa ve gönderebilirsiniz mutlu oluruz",
        totalAmount: 404,
        totalDiscount: null,
        paymentMethod: "Kredi/Banka Kartı",
        platformCode: null,
        dailyOrderNo: "22",
        createdAt: "2023-11-10 15:10:31",
        scheduledAt: null,
        courierPhone: "5553339999",
      },
    },
  },
  update: {
    action: "update",
    payload: {
      order: {
        id: "order_id-123-123",
        customer: {
          fullName: "Fatma Kaya",
          phoneNumber: "5554443322",
          phoneCode: null,
        },
        address: {
          text: "Hasanpaşa Mah. Sina Sk. No:1",
          description: "Güncellendi: kapı kodu 1234",
          lat: 40.9952952,
          lon: 29.0371583,
        },
        products: [
          {
            id: "11421",
            name: "Ankara Simidi",
            price: 14.7,
            quantity: 6,
            options: null,
          },
        ],
        source: "YemekSepeti",
        note: "Simitler sıcak olsun — adet güncellendi",
        totalAmount: 88.2,
        totalDiscount: null,
        paymentMethod: "Nakit",
        platformCode: "hbdz-5xbx",
        dailyOrderNo: "3",
        createdAt: "2023-11-16 05:10:31",
        scheduledAt: "2023-11-16 10:15:00",
        courierPhone: null,
      },
    },
  },
  cancel: {
    action: "cancel",
    payload: {
      order: { id: "order_id-123-123" },
    },
  },
};
