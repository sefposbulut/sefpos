-- Demo hesap: allowed_ips prod/testten kalırsa yerel veya farklı ağdan girişte sorun çıkarabilir.
UPDATE public.profiles
SET allowed_ips = NULL
WHERE lower(coalesce(email, '')) = lower('info@sefpos.com.tr');
