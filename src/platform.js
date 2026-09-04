/**
 * platform.js — Lớp adapter thống nhất cho 3 môi trường:
 *   - Facebook Instant Games  (global FBInstant)
 *   - YouTube Playables       (global ytgame)
 *   - Web thường / local dev  (fallback, không SDK)
 *
 * Toàn bộ game chỉ gọi Platform.*, không gọi trực tiếp SDK nào.
 * Nhờ vậy cùng một build chạy được ở cả 3 nơi.
 */
(function () {
  const PLACEMENTS = {
    // Điền Placement ID của Audience Network sau khi bật kiếm tiền trên Facebook.
    fbInterstitial: 'YOUR_FB_INTERSTITIAL_PLACEMENT_ID',
    fbRewarded: 'YOUR_FB_REWARDED_PLACEMENT_ID',
    // YouTube Playables: tên rewarded ad id do bạn tự đặt trong Developer Portal.
    ytRewarded: 'revive'
  };
  const LEADERBOARD = 'blob_rush_levels';
  const SAVE_KEY = 'blobRushSave';

  function detect() {
    if (typeof window.ytgame !== 'undefined' && window.ytgame && window.ytgame.game) return 'youtube';
    // FBInstant SDK có thể được nạp cả khi chạy ngoài Facebook (ví dụ GitHub Pages);
    // chỉ coi là Facebook khi game đang chạy trong iframe của Facebook/Messenger.
    const inIframe = window.self !== window.top;
    const fbHost = /facebook\.com|fbsbx\.com|messenger\.com/.test(document.referrer || '') ||
                   /fbsbx\.com/.test(location.hostname);
    if (typeof window.FBInstant !== 'undefined' && window.FBInstant && (inIframe || fbHost)) return 'facebook';
    return 'web';
  }

  /** Promise kèm timeout — tránh treo nếu SDK không phản hồi. */
  function withTimeout(p, ms) {
    return Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('timeout')), ms))]);
  }

  const Platform = {
    name: 'web',
    playerName: 'Bạn',
    _fbInterstitial: null,
    _fbRewarded: null,

    /** Gọi 1 lần lúc khởi động, TRƯỚC khi tải asset. */
    async init() {
      this.name = detect();
      try {
        if (this.name === 'facebook') {
          await withTimeout(FBInstant.initializeAsync(), 30000);
        } else if (this.name === 'youtube') {
          // Playables: báo đã vẽ frame đầu tiên ngay khi có thể.
          ytgame.game.firstFrameReady();
        }
      } catch (e) {
        console.warn('[Platform] init failed, fallback to web', e);
        this.lastError = (e && (e.message || e.code)) || String(e);
        this.name = 'web';
      }
      console.log('[Platform] running on:', this.name);
      return this.name;
    },

    /** Báo tiến độ tải (0–100). */
    setLoadingProgress(p) {
      if (this.name === 'facebook') {
        try { FBInstant.setLoadingProgress(p); } catch (e) {}
      }
    },

    /** Gọi khi asset đã tải xong, sẵn sàng chơi. */
    async ready() {
      try {
        if (this.name === 'facebook') {
          await withTimeout(FBInstant.startGameAsync(), 20000);
          this.playerName = FBInstant.player.getName() || 'Bạn';
          this._preloadFbAds();
        } else if (this.name === 'youtube') {
          ytgame.game.gameReady();
        }
      } catch (e) {
        console.warn('[Platform] ready failed', e);
        this.lastError = 'ready: ' + ((e && (e.message || e.code)) || String(e));
      }
    },

    /* ---------- Lưu / tải dữ liệu (điểm cao) ---------- */
    async loadData() {
      try {
        if (this.name === 'facebook') {
          const d = await withTimeout(FBInstant.player.getDataAsync([SAVE_KEY]), 6000);
          return d[SAVE_KEY] || {};
        }
        if (this.name === 'youtube') {
          const s = await ytgame.game.loadData();
          return s ? JSON.parse(s) : {};
        }
        const s = localStorage.getItem(SAVE_KEY);
        return s ? JSON.parse(s) : {};
      } catch (e) { return {}; }
    },

    async saveData(obj) {
      try {
        if (this.name === 'facebook') {
          await FBInstant.player.setDataAsync({ [SAVE_KEY]: obj });
          FBInstant.player.flushDataAsync();
        } else if (this.name === 'youtube') {
          await ytgame.game.saveData(JSON.stringify(obj));
        } else {
          localStorage.setItem(SAVE_KEY, JSON.stringify(obj));
        }
      } catch (e) { console.warn('[Platform] save failed', e); }
    },

    /* ---------- Điểm số / bảng xếp hạng ---------- */
    async submitScore(score) {
      try {
        if (this.name === 'facebook') {
          const lb = await FBInstant.getLeaderboardAsync(LEADERBOARD);
          await lb.setScoreAsync(score);
        } else if (this.name === 'youtube') {
          ytgame.engagement.sendScore({ value: score });
        }
      } catch (e) { console.warn('[Platform] submitScore failed', e); }
    },

    /* ---------- Quảng cáo ---------- */
    _preloadFbAds() {
      FBInstant.getInterstitialAdAsync(PLACEMENTS.fbInterstitial)
        .then(ad => { this._fbInterstitial = ad; return ad.loadAsync(); })
        .catch(e => console.warn('[Ads] interstitial preload failed', e));
      FBInstant.getRewardedVideoAsync(PLACEMENTS.fbRewarded)
        .then(ad => { this._fbRewarded = ad; return ad.loadAsync(); })
        .catch(e => console.warn('[Ads] rewarded preload failed', e));
    },

    /** Quảng cáo xen kẽ. Không bao giờ throw — game luôn tiếp tục. */
    async showInterstitial() {
      try {
        if (this.name === 'facebook' && this._fbInterstitial) {
          await this._fbInterstitial.showAsync();
          this._fbInterstitial = null;
          this._preloadFbAds();
        } else if (this.name === 'youtube') {
          await ytgame.ads.requestInterstitialAd();
        }
      } catch (e) { console.warn('[Ads] interstitial failed', e); }
    },

    /** Quảng cáo có thưởng. Trả về true nếu người chơi xem hết và được thưởng. */
    async showRewarded() {
      try {
        if (this.name === 'facebook' && this._fbRewarded) {
          await this._fbRewarded.showAsync();
          this._fbRewarded = null;
          this._preloadFbAds();
          return true;
        }
        if (this.name === 'youtube') {
          await ytgame.ads.requestRewardedAd(PLACEMENTS.ytRewarded);
          return true;
        }
        // Web/dev: giả lập xem quảng cáo thành công để test luồng.
        return true;
      } catch (e) {
        console.warn('[Ads] rewarded failed', e);
        return false;
      }
    },

    /** Tạm dừng / tiếp tục do nền tảng yêu cầu (YouTube gửi sự kiện này). */
    onPause(cb) {
      if (this.name === 'facebook') FBInstant.onPause(cb);
      if (this.name === 'youtube' && ytgame.system && ytgame.system.onPause) ytgame.system.onPause(cb);
    },
    onResume(cb) {
      if (this.name === 'youtube' && ytgame.system && ytgame.system.onResume) ytgame.system.onResume(cb);
    },

    /** Chia sẻ / mời bạn (chỉ Facebook). */
    async share(score) {
      if (this.name !== 'facebook') return;
      try {
        await FBInstant.updateAsync({
          action: 'CUSTOM',
          cta: 'Chơi ngay',
          text: { default: `${this.playerName} vừa phá tháp màn ${score} trong Blob Rush! Bạn dẫn đám đông đi xa hơn không?` },
          template: 'score_share',
          strategy: 'IMMEDIATE'
        });
      } catch (e) { console.warn('[Platform] share failed', e); }
    }
  };

  window.Platform = Platform;
})();
