# Blob Rush — crowd runner 3D

Game HTML5 3D (Three.js) chạy trên **Facebook Instant Games**, **YouTube Playables** và web thường.
Kéo trái/phải để chọn cổng (+N, ×N tăng quân; −N, ÷N giảm), đại chiến đám blob đỏ, chọn làn thưởng ×1…×5 rồi phá tháp.

## Cấu trúc

```
index.html            Giao diện (HUD, trang chủ, qua màn, thua/hồi sinh, cửa hàng, cài đặt) + CSS
src/platform.js       Adapter Facebook / YouTube / web (lưu dữ liệu, quảng cáo, bảng xếp hạng, chia sẻ)
src/levels.js         Sinh màn theo số màn (vô hạn): cổng, xu, đám địch, làn thưởng, máu tháp
src/game3d.js         Cảnh 3D: đường, đám blob (InstancedMesh), cổng, va chạm, tháp, camera, kéo/vuốt
src/audio.js          Âm thanh & nhạc nền tổng hợp bằng WebAudio (không cần file)
src/main.js           Điều khiển: luồng màn, kinh tế xu, quảng cáo, cửa hàng skin, quà ngày
lib/three.min.js      Three.js r150
assets/fonts          Baloo 2 + Nunito (nhúng sẵn, hỗ trợ tiếng Việt)
assets/img            icon_1024 (vuông), icon_rounded_1024, icon_512/192, cover_1200x628, thumbnail_1920x1080
tools/test_play.js    Kiểm thử headless (Playwright): tự chơi 1 màn, chụp màn hình vào build/shots (DUMB=1 để test thua)
tools/render_assets.js Render icon/cover/thumbnail từ artboard thiết kế
```

## Chạy thử

```bash
cd blob-rush
python3 -m http.server 8080      # rồi mở http://localhost:8080
```

## Luật & độ khó

- Bắt đầu 10 blob. Màn 1–5 chỉ có cổng cộng; từ màn 6 thêm cổng trừ và 1 đám địch; từ màn 15 hai đám địch.
- Đại chiến: mỗi blob loại 1 blob địch. Hết quân = thua, hồi sinh +20 blob bằng quảng cáo hoặc 200 xu.
- Làn thưởng cuối màn: ×1 miễn phí, ×2/×3/×5 tốn blob (tăng theo màn). Tháp có máu; mỗi blob trừ 1 máu.
- Xu qua màn = (20 + blob dư + xu nhặt × 3) × hệ số làn; xem quảng cáo nhân 3.

## Kiếm tiền (đã nối sẵn qua `Platform`)

| Vị trí | Loại quảng cáo | Thưởng |
|---|---|---|
| Qua màn → "Xem QC · nhận ×3 xu" | Rewarded | ×3 xu |
| Thua → "Xem QC · hồi sinh" | Rewarded | +20 blob (hoặc 200 xu) |
| Cửa hàng / Quà ngày | Rewarded | +100 / +250 xu |
| Sau mỗi 3 màn thắng | Interstitial | — |

Điền Placement ID Audience Network vào `src/platform.js` (`PLACEMENTS`) khi bật kiếm tiền trên Facebook;
YouTube dùng rewarded id `revive` (khai trong Developer Portal).

## Đóng gói lên Facebook Web Hosting

```bash
zip -r build/blob-rush-fb.zip index.html fbapp-config.json privacy.html src lib assets -x "assets/img/thumbnail*" "assets/img/cover*" "assets/img/icon_rounded*"
```
