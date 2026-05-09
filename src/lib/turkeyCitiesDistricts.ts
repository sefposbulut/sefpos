/**
 * Turkiye 81 il ve ilceleri (resmi 2025 listesi).
 *
 * Kullanim:
 *   import { TR_CITIES, getDistricts, normalizeCityName } from '@/lib/turkeyCitiesDistricts';
 *   const il = TR_CITIES.find((c) => c.name === 'Istanbul');
 *   const ilceler = getDistricts('Istanbul'); // ['Adalar', 'Arnavutkoy', ...]
 *
 * Notlar:
 *   - Veriler buyuk/kucuk harf duyarsiz aramada `normalizeCityName` ile karsilastirilabilir.
 *   - JSON yerine TS literal — tip guvencesi ve tree-shaking icin.
 *   - Toplam ~970 ilce. Lisanssiz/kamu malidir.
 */

export interface TRCity {
  /** Plaka kodu (1-81) */
  plate: number;
  /** Resmi il adi (Turkce) */
  name: string;
  /** Bagli ilceler — alfabetik sirali */
  districts: string[];
}

export const TR_CITIES: TRCity[] = [
  { plate: 1, name: 'Adana', districts: ['Aladag', 'Ceyhan', 'Cukurova', 'Feke', 'Imamoglu', 'Karaisali', 'Karatas', 'Kozan', 'Pozanti', 'Saimbeyli', 'Saricam', 'Seyhan', 'Tufanbeyli', 'Yumurtalik', 'Yuregir'] },
  { plate: 2, name: 'Adiyaman', districts: ['Besni', 'Celikhan', 'Gerger', 'Golbasi', 'Kahta', 'Merkez', 'Samsat', 'Sincik', 'Tut'] },
  { plate: 3, name: 'Afyonkarahisar', districts: ['Basmakci', 'Bayat', 'Bolvadin', 'Cay', 'Cobanlar', 'Dazkiri', 'Dinar', 'Emirdag', 'Evciler', 'Hocalar', 'Ihsaniye', 'Iscehisar', 'Kiziloren', 'Merkez', 'Sandikli', 'Sinanpasa', 'Sultandagi', 'Suhut'] },
  { plate: 4, name: 'Agri', districts: ['Diyadin', 'Dogubayazit', 'Eleskirt', 'Hamur', 'Merkez', 'Patnos', 'Taslicay', 'Tutak'] },
  { plate: 5, name: 'Amasya', districts: ['Goynucek', 'Gumushacikoy', 'Hamamozu', 'Merkez', 'Merzifon', 'Suluova', 'Tasova'] },
  { plate: 6, name: 'Ankara', districts: ['Akyurt', 'Altindag', 'Ayas', 'Bala', 'Beypazari', 'Camlidere', 'Cankaya', 'Cubuk', 'Elmadag', 'Etimesgut', 'Evren', 'Golbasi', 'Gudul', 'Haymana', 'Kahramankazan', 'Kalecik', 'Kecioren', 'Kizilcahamam', 'Mamak', 'Nallihan', 'Polatli', 'Pursaklar', 'Sincan', 'Sereflikochisar', 'Yenimahalle'] },
  { plate: 7, name: 'Antalya', districts: ['Akseki', 'Aksu', 'Alanya', 'Demre', 'Doseme alti', 'Elmali', 'Finike', 'Gazipasa', 'Gundogmus', 'Ibradi', 'Kas', 'Kemer', 'Kepez', 'Konyaalti', 'Korkuteli', 'Kumluca', 'Manavgat', 'Muratpasa', 'Serik'] },
  { plate: 8, name: 'Artvin', districts: ['Ardanuc', 'Arhavi', 'Borcka', 'Hopa', 'Kemalpasa', 'Merkez', 'Murgul', 'Savsat', 'Yusufeli'] },
  { plate: 9, name: 'Aydin', districts: ['Bozdogan', 'Buharkent', 'Cine', 'Didim', 'Efeler', 'Germencik', 'Incirliova', 'Karacasu', 'Karpuzlu', 'Kocarli', 'Kosk', 'Kusadasi', 'Kuyucak', 'Nazilli', 'Soke', 'Sultanhisar', 'Yenipazar'] },
  { plate: 10, name: 'Balikesir', districts: ['Altieylul', 'Ayvalik', 'Balya', 'Bandirma', 'Bigadic', 'Burhaniye', 'Dursunbey', 'Edremit', 'Erdek', 'Gomec', 'Gonen', 'Havran', 'Ivrindi', 'Karesi', 'Kepsut', 'Manyas', 'Marmara', 'Savastepe', 'Sindirgi', 'Susurluk'] },
  { plate: 11, name: 'Bilecik', districts: ['Bozuyuk', 'Golpazari', 'Inhisar', 'Merkez', 'Osmaneli', 'Pazaryeri', 'Sogut', 'Yenipazar'] },
  { plate: 12, name: 'Bingol', districts: ['Adakli', 'Genc', 'Karliova', 'Kigi', 'Merkez', 'Solhan', 'Yayladere', 'Yedisu'] },
  { plate: 13, name: 'Bitlis', districts: ['Adilcevaz', 'Ahlat', 'Guroymak', 'Hizan', 'Merkez', 'Mutki', 'Tatvan'] },
  { plate: 14, name: 'Bolu', districts: ['Dortdivan', 'Gerede', 'Goynuk', 'Kibriscik', 'Mengen', 'Merkez', 'Mudurnu', 'Seben', 'Yenicaga'] },
  { plate: 15, name: 'Burdur', districts: ['Aglasun', 'Altinyayla', 'Bucak', 'Cavdir', 'Celtikci', 'Golhisar', 'Karamanli', 'Kemer', 'Merkez', 'Tefenni', 'Yesilova'] },
  { plate: 16, name: 'Bursa', districts: ['Buyukorhan', 'Gemlik', 'Gursu', 'Harmancik', 'Inegol', 'Iznik', 'Karacabey', 'Keles', 'Kestel', 'Mudanya', 'Mustafakemalpasa', 'Nilufer', 'Orhaneli', 'Orhangazi', 'Osmangazi', 'Yenisehir', 'Yildirim'] },
  { plate: 17, name: 'Canakkale', districts: ['Ayvacik', 'Bayramic', 'Biga', 'Bozcaada', 'Can', 'Eceabat', 'Ezine', 'Gelibolu', 'Gokceada', 'Lapseki', 'Merkez', 'Yenice'] },
  { plate: 18, name: 'Cankiri', districts: ['Atkaracalar', 'Bayramoren', 'Cerkes', 'Eldivan', 'Ilgaz', 'Kizilirmak', 'Korgun', 'Kursunlu', 'Merkez', 'Orta', 'Sabanozu', 'Yaprakli'] },
  { plate: 19, name: 'Corum', districts: ['Alaca', 'Bayat', 'Bogazkale', 'Dodurga', 'Iskilip', 'Kargi', 'Lacin', 'Mecitozu', 'Merkez', 'Oguzlar', 'Ortakoy', 'Osmancik', 'Sungurlu', 'Ugurludag'] },
  { plate: 20, name: 'Denizli', districts: ['Acipayam', 'Babadag', 'Baklan', 'Bekilli', 'Beyagac', 'Bozkurt', 'Buldan', 'Cal', 'Cameli', 'Cardak', 'Civril', 'Guney', 'Honaz', 'Kale', 'Merkezefendi', 'Pamukkale', 'Saraykoy', 'Serinhisar', 'Tavas'] },
  { plate: 21, name: 'Diyarbakir', districts: ['Baglar', 'Bismil', 'Cermik', 'Cinar', 'Cungus', 'Dicle', 'Egil', 'Ergani', 'Hani', 'Hazro', 'Kayapinar', 'Kocakoy', 'Kulp', 'Lice', 'Silvan', 'Sur', 'Yenisehir'] },
  { plate: 22, name: 'Edirne', districts: ['Enez', 'Havsa', 'Ipsala', 'Kesan', 'Lalapasa', 'Meric', 'Merkez', 'Suloglu', 'Uzunkopru'] },
  { plate: 23, name: 'Elazig', districts: ['Agin', 'Alacakaya', 'Aricak', 'Baskil', 'Karakocan', 'Keban', 'Kovancilar', 'Maden', 'Merkez', 'Palu', 'Sivrice'] },
  { plate: 24, name: 'Erzincan', districts: ['Cayirli', 'Ilic', 'Kemah', 'Kemaliye', 'Merkez', 'Otlukbeli', 'Refahiye', 'Tercan', 'Uzumlu'] },
  { plate: 25, name: 'Erzurum', districts: ['Askale', 'Aziziye', 'Cat', 'Hinis', 'Horasan', 'Ispir', 'Karacoban', 'Karayazi', 'Koprukoy', 'Narman', 'Oltu', 'Olur', 'Palandoken', 'Pasinler', 'Pazaryolu', 'Senkaya', 'Tekman', 'Tortum', 'Uzundere', 'Yakutiye'] },
  { plate: 26, name: 'Eskisehir', districts: ['Alpu', 'Beylikova', 'Cifteler', 'Gunyuzu', 'Han', 'Inonu', 'Mahmudiye', 'Mihalgazi', 'Mihaliccik', 'Odunpazari', 'Sarcakaya', 'Seyitgazi', 'Sivrihisar', 'Tepebasi'] },
  { plate: 27, name: 'Gaziantep', districts: ['Araban', 'Islahiye', 'Karkamis', 'Nizip', 'Nurdagi', 'Oguzeli', 'Sahinbey', 'Sehitkamil', 'Yavuzeli'] },
  { plate: 28, name: 'Giresun', districts: ['Alucra', 'Bulancak', 'Camoluk', 'Canakci', 'Dereli', 'Dogankent', 'Espiye', 'Eynesil', 'Gorele', 'Guce', 'Kesap', 'Merkez', 'Piraziz', 'Sebinkarahisar', 'Tirebolu', 'Yaglidere'] },
  { plate: 29, name: 'Gumushane', districts: ['Kelkit', 'Kose', 'Kurtun', 'Merkez', 'Siran', 'Torul'] },
  { plate: 30, name: 'Hakkari', districts: ['Cukurca', 'Derecik', 'Merkez', 'Semdinli', 'Yuksekova'] },
  { plate: 31, name: 'Hatay', districts: ['Altinozu', 'Antakya', 'Arsuz', 'Belen', 'Defne', 'Dortyol', 'Erzin', 'Hassa', 'Iskenderun', 'Kirikhan', 'Kumlu', 'Payas', 'Reyhanli', 'Samandag', 'Yayladagi'] },
  { plate: 32, name: 'Isparta', districts: ['Aksu', 'Atabey', 'Egirdir', 'Gelendost', 'Gonen', 'Keciborlu', 'Merkez', 'Senirkent', 'Sutculer', 'Sarkikaraagac', 'Uluborlu', 'Yalvac', 'Yenisarbademli'] },
  { plate: 33, name: 'Mersin', districts: ['Akdeniz', 'Anamur', 'Aydincik', 'Bozyazi', 'Camliyayla', 'Erdemli', 'Gulnar', 'Mezitli', 'Mut', 'Silifke', 'Tarsus', 'Toroslar', 'Yenisehir'] },
  { plate: 34, name: 'Istanbul', districts: ['Adalar', 'Arnavutkoy', 'Atasehir', 'Avcilar', 'Bagcilar', 'Bahcelievler', 'Bakirkoy', 'Basaksehir', 'Bayrampasa', 'Besiktas', 'Beykoz', 'Beylikduzu', 'Beyoglu', 'Buyukcekmece', 'Catalca', 'Cekmekoy', 'Esenler', 'Esenyurt', 'Eyupsultan', 'Fatih', 'Gaziosmanpasa', 'Gungoren', 'Kadikoy', 'Kagithane', 'Kartal', 'Kucukcekmece', 'Maltepe', 'Pendik', 'Sancaktepe', 'Sariyer', 'Silivri', 'Sultanbeyli', 'Sultangazi', 'Sile', 'Sisli', 'Tuzla', 'Umraniye', 'Uskudar', 'Zeytinburnu'] },
  { plate: 35, name: 'Izmir', districts: ['Aliaga', 'Balcova', 'Bayindir', 'Bayrakli', 'Bergama', 'Beydag', 'Bornova', 'Buca', 'Cesme', 'Cigli', 'Dikili', 'Foca', 'Gaziemir', 'Guzelbahce', 'Karabaglar', 'Karaburun', 'Karsiyaka', 'Kemalpasa', 'Kinik', 'Kiraz', 'Konak', 'Menderes', 'Menemen', 'Narlidere', 'Odemis', 'Seferihisar', 'Selcuk', 'Tire', 'Torbali', 'Urla'] },
  { plate: 36, name: 'Kars', districts: ['Akyaka', 'Arpacay', 'Digor', 'Kagizman', 'Merkez', 'Sarikamis', 'Selim', 'Susuz'] },
  { plate: 37, name: 'Kastamonu', districts: ['Abana', 'Agli', 'Araç', 'Azdavay', 'Bozkurt', 'Cide', 'Catalzeytin', 'Daday', 'Devrekani', 'Doganyurt', 'Hanonu', 'Ihsangazi', 'Inebolu', 'Kure', 'Merkez', 'Pinarbasi', 'Senpazar', 'Seydiler', 'Taskopru', 'Tosya'] },
  { plate: 38, name: 'Kayseri', districts: ['Akkisla', 'Bunyan', 'Develi', 'Felahiye', 'Hacilar', 'Incesu', 'Kocasinan', 'Melikgazi', 'Ozvatan', 'Pinarbasi', 'Sariz', 'Talas', 'Tomarza', 'Yahyali', 'Yesilhisar'] },
  { plate: 39, name: 'Kirklareli', districts: ['Babaeski', 'Demirkoy', 'Kofcaz', 'Luleburgaz', 'Merkez', 'Pehlivankoy', 'Pinarhisar', 'Vize'] },
  { plate: 40, name: 'Kirsehir', districts: ['Akcakent', 'Akpinar', 'Boztepe', 'Cicekdagi', 'Kaman', 'Merkez', 'Mucur'] },
  { plate: 41, name: 'Kocaeli', districts: ['Basiskele', 'Cayirova', 'Darica', 'Derince', 'Dilovasi', 'Gebze', 'Golcuk', 'Izmit', 'Kandira', 'Karamursel', 'Kartepe', 'Korfez'] },
  { plate: 42, name: 'Konya', districts: ['Ahirli', 'Akoren', 'Aksehir', 'Altinekin', 'Beysehir', 'Bozkir', 'Cantar', 'Celtik', 'Cumra', 'Derbent', 'Derebucak', 'Doganhisar', 'Emirgazi', 'Eregli', 'Guneysinir', 'Hadim', 'Halkapinar', 'Huyuk', 'Ilgin', 'Kadinhani', 'Karapinar', 'Karatay', 'Kulu', 'Meram', 'Sarayonu', 'Selcuklu', 'Seydisehir', 'Taskent', 'Tuzlukcu', 'Yalihuyuk', 'Yunak'] },
  { plate: 43, name: 'Kutahya', districts: ['Altintas', 'Aslanapa', 'Cavdarhisar', 'Domanic', 'Dumlupinar', 'Emet', 'Gediz', 'Hisarcik', 'Merkez', 'Pazarlar', 'Saphane', 'Simav', 'Tavsanli'] },
  { plate: 44, name: 'Malatya', districts: ['Akcadag', 'Arapgir', 'Arguvan', 'Battalgazi', 'Darende', 'Dogansehir', 'Doganyol', 'Hekimhan', 'Kale', 'Kuluncak', 'Puturge', 'Yazihan', 'Yesilyurt'] },
  { plate: 45, name: 'Manisa', districts: ['Ahmetli', 'Akhisar', 'Alasehir', 'Demirci', 'Golmarmara', 'Gordes', 'Kirkagac', 'Koprubasi', 'Kula', 'Salihli', 'Sarigol', 'Saruhanli', 'Sehzadeler', 'Selendi', 'Soma', 'Turgutlu', 'Yunusemre'] },
  { plate: 46, name: 'Kahramanmaras', districts: ['Afsin', 'Andirin', 'Caglayancerit', 'Dulkadiroglu', 'Ekinozu', 'Elbistan', 'Goksun', 'Nurhak', 'Onikisubat', 'Pazarcik', 'Turkoglu'] },
  { plate: 47, name: 'Mardin', districts: ['Artuklu', 'Dargecit', 'Derik', 'Kiziltepe', 'Mazidagi', 'Midyat', 'Nusaybin', 'Omerli', 'Savur', 'Yesilli'] },
  { plate: 48, name: 'Mugla', districts: ['Bodrum', 'Dalaman', 'Datca', 'Fethiye', 'Kavaklidere', 'Koycegiz', 'Marmaris', 'Menteseler', 'Mentese', 'Milas', 'Ortaca', 'Seydikemer', 'Ula', 'Yatagan'] },
  { plate: 49, name: 'Mus', districts: ['Bulanik', 'Hasköy', 'Korkut', 'Malazgirt', 'Merkez', 'Varto'] },
  { plate: 50, name: 'Nevsehir', districts: ['Acigol', 'Avanos', 'Derinkuyu', 'Gulsehir', 'Hacibektas', 'Kozakli', 'Merkez', 'Urgup'] },
  { plate: 51, name: 'Nigde', districts: ['Altunhisar', 'Bor', 'Camardi', 'Ciftlik', 'Merkez', 'Ulukisla'] },
  { plate: 52, name: 'Ordu', districts: ['Akkus', 'Altinordu', 'Aybasti', 'Camas', 'Catalpinar', 'Caybasi', 'Fatsa', 'Golkoy', 'Gulyali', 'Gurgentepe', 'Ikizce', 'Kabaduz', 'Kabatas', 'Korgan', 'Kumru', 'Mesudiye', 'Persembe', 'Ulubey', 'Unye'] },
  { plate: 53, name: 'Rize', districts: ['Ardesen', 'Camlihemsin', 'Cayeli', 'Derepazari', 'Findikli', 'Guneysu', 'Hemsin', 'Ikizdere', 'Iyidere', 'Kalkandere', 'Merkez', 'Pazar'] },
  { plate: 54, name: 'Sakarya', districts: ['Adapazari', 'Akyazi', 'Arifiye', 'Erenler', 'Ferizli', 'Geyve', 'Hendek', 'Karapurcek', 'Karasu', 'Kaynarca', 'Kocaali', 'Pamukova', 'Sapanca', 'Sogutlu', 'Serdivan', 'Tarakli'] },
  { plate: 55, name: 'Samsun', districts: ['Alacam', '19 Mayis', 'Asarcik', 'Atakum', 'Ayvacik', 'Bafra', 'Canik', 'Carsamba', 'Havza', 'Ilkadim', 'Kavak', 'Ladik', 'Salipazari', 'Tekkekoy', 'Terme', 'Vezirkopru', 'Yakakent'] },
  { plate: 56, name: 'Siirt', districts: ['Baykan', 'Eruh', 'Kurtalan', 'Merkez', 'Pervari', 'Sirvan', 'Tillo'] },
  { plate: 57, name: 'Sinop', districts: ['Ayancik', 'Boyabat', 'Dikmen', 'Duragan', 'Erfelek', 'Gerze', 'Merkez', 'Saraydüzü', 'Türkeli'] },
  { plate: 58, name: 'Sivas', districts: ['Akincilar', 'Altinyayla', 'Divrigi', 'Dogansar', 'Gemerek', 'Golova', 'Gurun', 'Hafik', 'Imranli', 'Kangal', 'Koyulhisar', 'Merkez', 'Sarkisla', 'Susehri', 'Ulas', 'Yildizeli', 'Zara'] },
  { plate: 59, name: 'Tekirdag', districts: ['Cerkezkoy', 'Corlu', 'Ergene', 'Hayrabolu', 'Kapakli', 'Malkara', 'Marmaraereglisi', 'Muratli', 'Saray', 'Suleymanpasa', 'Sarkoy'] },
  { plate: 60, name: 'Tokat', districts: ['Almus', 'Artova', 'Basciftlik', 'Erbaa', 'Merkez', 'Niksar', 'Pazar', 'Resadiye', 'Sulusaray', 'Turhal', 'Yesilyurt', 'Zile'] },
  { plate: 61, name: 'Trabzon', districts: ['Akcaabat', 'Araklı', 'Arsin', 'Besikduzu', 'Carsibasi', 'Caykara', 'Dernekpazari', 'Duzkoy', 'Hayrat', 'Koprubasi', 'Macka', 'Of', 'Ortahisar', 'Salpazari', 'Surmene', 'Tonya', 'Vakfikebir', 'Yomra'] },
  { plate: 62, name: 'Tunceli', districts: ['Cemisgezek', 'Hozat', 'Mazgirt', 'Merkez', 'Nazimiye', 'Ovacik', 'Pertek', 'Pulumur'] },
  { plate: 63, name: 'Sanliurfa', districts: ['Akcakale', 'Birecik', 'Bozova', 'Ceylanpinar', 'Eyyubiye', 'Halfeti', 'Haliliye', 'Harran', 'Hilvan', 'Karakopru', 'Siverek', 'Suruc', 'Viransehir'] },
  { plate: 64, name: 'Usak', districts: ['Banaz', 'Esme', 'Karahalli', 'Merkez', 'Sivasli', 'Ulubey'] },
  { plate: 65, name: 'Van', districts: ['Bahcesaray', 'Baskale', 'Catak', 'Caldiran', 'Edremit', 'Ercis', 'Gevas', 'Gurpinar', 'Ipekyolu', 'Muradiye', 'Ozalp', 'Saray', 'Tusba'] },
  { plate: 66, name: 'Yozgat', districts: ['Akdagmadeni', 'Aydincik', 'Boğazliyan', 'Caycuma', 'Cayiralan', 'Cekerek', 'Kadisehri', 'Merkez', 'Saraykent', 'Sarikaya', 'Sefaatli', 'Sorgun', 'Yenifakili', 'Yerkoy'] },
  { plate: 67, name: 'Zonguldak', districts: ['Alapli', 'Caycuma', 'Devrek', 'Eregli', 'Gokcebey', 'Kilimli', 'Kozlu', 'Merkez'] },
  { plate: 68, name: 'Aksaray', districts: ['Agacoren', 'Eskil', 'Gulagac', 'Guzelyurt', 'Merkez', 'Ortakoy', 'Sariyahsi', 'Sultanhani'] },
  { plate: 69, name: 'Bayburt', districts: ['Aydintepe', 'Demirozu', 'Merkez'] },
  { plate: 70, name: 'Karaman', districts: ['Ayranci', 'Basyayla', 'Ermenek', 'Kazimkarabekir', 'Merkez', 'Sariveliler'] },
  { plate: 71, name: 'Kirikkale', districts: ['Bahsili', 'Baliseyh', 'Celebi', 'Delice', 'Karakecili', 'Keskin', 'Merkez', 'Sulakyurt', 'Yahsihan'] },
  { plate: 72, name: 'Batman', districts: ['Besiri', 'Gercus', 'Hasankeyf', 'Kozluk', 'Merkez', 'Sason'] },
  { plate: 73, name: 'Sirnak', districts: ['Beytussebap', 'Cizre', 'Guclukonak', 'Idil', 'Merkez', 'Silopi', 'Uludere'] },
  { plate: 74, name: 'Bartin', districts: ['Amasra', 'Kurucasile', 'Merkez', 'Ulus'] },
  { plate: 75, name: 'Ardahan', districts: ['Cildir', 'Damal', 'Gole', 'Hanak', 'Merkez', 'Posof'] },
  { plate: 76, name: 'Igdir', districts: ['Aralik', 'Karakoyunlu', 'Merkez', 'Tuzluca'] },
  { plate: 77, name: 'Yalova', districts: ['Altinova', 'Armutlu', 'Cinarcik', 'Ciftlikkoy', 'Merkez', 'Termal'] },
  { plate: 78, name: 'Karabuk', districts: ['Eflani', 'Eskipazar', 'Merkez', 'Ovacik', 'Safranbolu', 'Yenice'] },
  { plate: 79, name: 'Kilis', districts: ['Elbeyli', 'Merkez', 'Musabeyli', 'Polateli'] },
  { plate: 80, name: 'Osmaniye', districts: ['Bahce', 'Duzici', 'Hasanbeyli', 'Kadirli', 'Merkez', 'Sumbas', 'Toprakkale'] },
  { plate: 81, name: 'Duzce', districts: ['Akcakoca', 'Cilimli', 'Cumayeri', 'Golyaka', 'Gumusova', 'Kaynasli', 'Merkez', 'Yigilca'] },
];

/** Tek seferlik isim haritasi — il bul, ilceleri don. */
const _byName: Record<string, TRCity> = Object.create(null);
for (const c of TR_CITIES) _byName[normalizeCityName(c.name)] = c;

/** Buyuk/kucuk + Turkce karakter farkini yutan anahtar. */
export function normalizeCityName(s: string): string {
  return s
    .toLocaleLowerCase('tr-TR')
    .replace(/i\u0307/g, 'i')
    .replace(/ı/g, 'i')
    .replace(/ş/g, 's')
    .replace(/ğ/g, 'g')
    .replace(/ü/g, 'u')
    .replace(/ö/g, 'o')
    .replace(/ç/g, 'c')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Bir il icin ilce listesi. Bulunamazsa bos dizi. */
export function getDistricts(cityName: string | null | undefined): string[] {
  if (!cityName) return [];
  const k = normalizeCityName(cityName);
  return _byName[k]?.districts ?? [];
}

/** Plaka kodundan il bul. */
export function getCityByPlate(plate: number): TRCity | null {
  return TR_CITIES.find((c) => c.plate === plate) ?? null;
}

/** Sadece il isimleri (alfabetik UI'lerde kullanmak icin). */
export const TR_CITY_NAMES: string[] = TR_CITIES.map((c) => c.name).sort((a, b) =>
  a.localeCompare(b, 'tr'),
);
