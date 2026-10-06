# KASA PRO V19 - Kullanıcı Atama Fix

Kök neden: React kaynak kodu kullanıcı atamasında `v19_assign_user` / `v19_remove_user_assignment` RPC'lerini çağırıyordu; güvenli SQL ise `superadmin_assign_user` / `superadmin_remove_user_assignment` fonksiyonlarını tanımlıyordu.

Bu sürüm React tarafını gerçek SUPER_ADMIN fonksiyonlarına bağlar.

Ayrıca `KULLANICI_ATAMA_FIX.sql` içinde eski sürümler için geriye dönük RPC wrapper'ları vardır.

Mevcut kullanıcı, işletme, şube veya finans verileri silinmez.
