# ShefPOS Print Agent - EXE Yapma Talimatları

## Gereksinimler
- Node.js 18+ kurulu olmalı

## Adımlar

1. print-agent klasörüne gir:
   ```
   cd print-agent
   ```

2. pkg aracını global yükle:
   ```
   npm install -g pkg
   ```

3. EXE oluştur:
   ```
   pkg index.js --target node18-win-x64 --output ShefPOS-PrintAgent.exe
   ```

4. Oluşan `ShefPOS-PrintAgent.exe` dosyasını çalıştır.

## Kullanım
- EXE çalıştırıldığında arka planda 127.0.0.1:7878 portunda dinler
- Web tarayıcısında ShefPOS açıkken yazdırma otomatik çalışır
- Yazıcı listesi: http://127.0.0.1:7878/printers
- Durum: http://127.0.0.1:7878/status

## Windows Başlangıcında Otomatik Çalıştırma
EXE'yi Windows Başlangıç klasörüne koy:
`C:\Users\KULLANICI\AppData\Roaming\Microsoft\Windows\Start Menu\Programs\Startup`
