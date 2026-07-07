/*
 * data.js — サカイオートサービス デモアプリ「データ層」
 * -------------------------------------------------------------
 * 役割:
 *   - window.Utils : 日付ユーティリティ・車検ステータス判定・ID生成・HTMLエスケープ等の純ロジック
 *   - window.Store : localStorage 永続化と、デモ用初期データ(seed)の生成
 * 方針:
 *   - ビルド無し。<script src> で直接読込。import/export は使わず IIFE で window に代入。
 *   - DOM操作・外部ライブラリ依存は一切なし（純ロジックのみ）。
 *   - 日付はすべてローカルタイム基準(new Date(y, m-1, d))で扱い、時差ズレを防ぐ。
 *   - shakenExpiry / lastVisit / 予約日 / 通知日時は seed 実行時の「今日」を基準に動的生成する。
 */

(function () {
  'use strict';

  // ============================================================
  // Utils : 純ロジック・ユーティリティ
  // ============================================================
  var Utils = {};

  // 時刻0:0:0のローカル今日
  Utils.today = function () {
    var d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), d.getDate());
  };

  // "YYYY-MM-DD" を時刻0のローカル日付としてパース（UTCズレ回避）
  Utils.parseDate = function (s) {
    if (!s) return null;
    var parts = String(s).split('-');
    var y = parseInt(parts[0], 10);
    var m = parseInt(parts[1], 10);
    var d = parseInt(parts[2], 10);
    return new Date(y, m - 1, d);
  };

  // Date -> "YYYY-MM-DD"（ローカル基準）
  Utils.toYMD = function (date) {
    var y = date.getFullYear();
    var m = date.getMonth() + 1;
    var d = date.getDate();
    var mm = m < 10 ? '0' + m : '' + m;
    var dd = d < 10 ? '0' + d : '' + d;
    return y + '-' + mm + '-' + dd;
  };

  // date に n 日を加算した新しい Date を返す（元は変更しない）
  Utils.addDays = function (date, n) {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate() + n);
  };

  // "YYYY-MM-DD" -> "2026年7月7日"
  Utils.fmtJP = function (s) {
    var d = Utils.parseDate(s);
    if (!d) return '';
    return d.getFullYear() + '年' + (d.getMonth() + 1) + '月' + d.getDate() + '日';
  };

  // "YYYY-MM-DD" -> "7/25(土)"（日本語曜日付き短縮）
  Utils.fmtJPShort = function (s) {
    var d = Utils.parseDate(s);
    if (!d) return '';
    var week = ['日', '月', '火', '水', '木', '金', '土'];
    return (d.getMonth() + 1) + '/' + d.getDate() + '(' + week[d.getDay()] + ')';
  };

  // 満了日("YYYY-MM-DD") - 今日 の日数（過去は負・整数）
  Utils.daysUntil = function (s) {
    var target = Utils.parseDate(s);
    if (!target) return NaN;
    var today = Utils.today();
    var msPerDay = 24 * 60 * 60 * 1000;
    return Math.round((target.getTime() - today.getTime()) / msPerDay);
  };

  // 車検ステータス判定
  Utils.shakenStatus = function (s) {
    var days = Utils.daysUntil(s);
    if (days < 0) {
      return { key: 'expired', label: '期限切れ', className: 'badge--expired' };
    }
    if (days <= 30) {
      return { key: 'within1m', label: '1ヶ月以内', className: 'badge--within1m' };
    }
    if (days <= 90) {
      return { key: 'within3m', label: '3ヶ月以内', className: 'badge--within3m' };
    }
    return { key: 'ok', label: '余裕あり', className: 'badge--ok' };
  };

  // 一意ID生成（prefix + タイムスタンプ(36進) + カウンタ + 乱数）
  var _uidCounter = 0;
  Utils.uid = function (prefix) {
    _uidCounter += 1;
    var p = prefix ? String(prefix) : 'id';
    var t = Date.now().toString(36);
    var r = Math.floor(Math.random() * 1e6).toString(36);
    return p + '_' + t + '_' + _uidCounter + r;
  };

  // HTMLエスケープ（描画用）
  Utils.escapeHtml = function (s) {
    if (s === null || s === undefined) return '';
    return String(s)
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#39;');
  };

  // ============================================================
  // Store : 永続化・初期データ生成
  // ============================================================
  var Store = {};

  Store.KEY = 'sakai_auto_state_v2';

  // localStorage から読込（無い / パース失敗時は null）
  Store.load = function () {
    try {
      var raw = window.localStorage.getItem(Store.KEY);
      if (!raw) return null;
      return JSON.parse(raw);
    } catch (e) {
      return null;
    }
  };

  // localStorage へ保存
  Store.save = function (state) {
    try {
      window.localStorage.setItem(Store.KEY, JSON.stringify(state));
    } catch (e) {
      // 容量超過等は握りつぶす（デモ用）
    }
  };

  // 初期stateを新規生成して返す（保存はしない）
  Store.seed = function () {
    var today = Utils.today();
    var ymd = function (offset) { return Utils.toYMD(Utils.addDays(today, offset)); };
    var nowIso = new Date().toISOString();
    // 過去のISO日時を作る補助（days前）
    var pastIso = function (daysAgo) {
      var d = Utils.addDays(today, -daysAgo);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate(), 10, 0, 0).toISOString();
    };

    // --- 顧客ちょうど10件 ---
    // 車検オフセット: expired/within1m/within3m/ok が必ず混在
    var shakenOffsets = [-25, -8, 12, 20, 28, 55, 80, 150, 240, 33];
    var lastVisitOffsets = [-200, -30, -400, -15, -90, -220, -45, -365, -120, -18];

    var customerDefs = [
      { name: '田中 一郎', kana: 'たなか いちろう', phone: '090-1234-5678', carModel: 'トヨタ プリウス', plate: '和泉 300 あ 12-34', nextAction: '車検の見積り連絡' },
      { name: '佐藤 美咲', kana: 'さとう みさき', phone: '090-2345-6789', carModel: 'ホンダ N-BOX', plate: 'なにわ 580 さ 88-88', nextAction: '車検の入庫日調整' },
      { name: '鈴木 健太', kana: 'すずき けんた', phone: '080-3456-7890', carModel: '日産 セレナ', plate: '和泉 500 か 45-67', nextAction: 'タイヤ交換の案内' },
      { name: '高橋 由美', kana: 'たかはし ゆみ', phone: '090-4567-8901', carModel: 'スズキ ワゴンR', plate: 'なにわ 480 た 23-45', nextAction: 'オイル交換の時期' },
      { name: '伊藤 大輔', kana: 'いとう だいすけ', phone: '080-5678-9012', carModel: 'ダイハツ タント', plate: '和泉 580 な 67-89', nextAction: '車検予約の確認連絡' },
      { name: '渡辺 千夏', kana: 'わたなべ ちなつ', phone: '090-6789-0123', carModel: 'マツダ CX-5', plate: 'なにわ 300 は 11-22', nextAction: '次回点検の案内' },
      { name: '山本 翔太', kana: 'やまもと しょうた', phone: '080-7890-1234', carModel: 'トヨタ アクア', plate: '和泉 330 ま 34-56', nextAction: 'エアコン点検の提案' },
      { name: '中村 恵子', kana: 'なかむら けいこ', phone: '090-8901-2345', carModel: 'ホンダ フィット', plate: 'なにわ 500 や 78-90', nextAction: '12ヶ月点検の案内' },
      { name: '小林 誠',   kana: 'こばやし まこと', phone: '080-9012-3456', carModel: 'スバル フォレスター', plate: '和泉 300 ら 90-12', nextAction: 'バッテリー交換の提案' },
      { name: '加藤 直樹', kana: 'かとう なおき', phone: '090-0123-4567', carModel: 'トヨタ ハイエース', plate: 'なにわ 100 わ 55-55', nextAction: '次回点検の案内' }
    ];

    var customers = customerDefs.map(function (c, i) {
      return {
        id: Utils.uid('cust'),
        name: c.name,
        kana: c.kana,
        phone: c.phone,
        carModel: c.carModel,
        plate: c.plate,
        shakenExpiry: ymd(shakenOffsets[i]),
        lastVisit: ymd(lastVisitOffsets[i]),
        nextAction: c.nextAction
      };
    });

    // --- 予約 3〜4件（近い将来。うち2件は同一 date/time で重複） ---
    var dupDate = ymd(3);
    var dupTime = '10:00';
    var reservations = [
      // --- 本日の予約（サイドバー「本日のスケジュール」用） ---
      {
        id: Utils.uid('resv'),
        customerId: customers[1].id,
        date: ymd(0),
        time: '09:00',
        workType: '車検整備',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(2)
      },
      {
        id: Utils.uid('resv'),
        customerId: customers[3].id,
        date: ymd(0),
        time: '11:00',
        workType: 'オイル交換',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(1)
      },
      {
        id: Utils.uid('resv'),
        customerId: customers[6].id,
        date: ymd(0),
        time: '15:00',
        workType: '12ヶ月点検',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(1)
      },
      {
        id: Utils.uid('resv'),
        customerId: customers[0].id,
        date: dupDate,
        time: dupTime,
        workType: '車検整備',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(2)
      },
      {
        // ↑と同一 date/time でバッティング
        id: Utils.uid('resv'),
        customerId: customers[4].id,
        date: dupDate,
        time: dupTime,
        workType: 'オイル交換',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(1)
      },
      {
        id: Utils.uid('resv'),
        customerId: customers[2].id,
        date: ymd(5),
        time: '14:30',
        workType: 'タイヤ交換',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(3)
      },
      {
        id: Utils.uid('resv'),
        customerId: customers[7].id,
        date: ymd(6),
        time: '09:30',
        workType: '12ヶ月点検',
        source: 'shop',
        status: 'confirmed',
        createdAt: pastIso(1)
      }
    ];

    // --- 通知 初期2〜3件（既に届いている体裁） ---
    var notifications = [
      {
        id: Utils.uid('notif'),
        customerId: customers[0].id,
        category: 'shaken',
        title: '車検満了が近づいています',
        body: 'お車の車検満了日が近づいています。お早めに整備のご予約をお願いいたします。',
        createdAt: pastIso(5),
        delivered: true,
        channel: 'in-app'
      },
      {
        id: Utils.uid('notif'),
        customerId: customers[2].id,
        category: 'tire',
        title: 'タイヤ交換のご案内',
        body: '季節に合わせたタイヤ交換のご予約を承っております。お気軽にご相談ください。',
        createdAt: pastIso(3),
        delivered: true,
        channel: 'in-app'
      },
      {
        id: Utils.uid('notif'),
        customerId: customers[4].id,
        category: 'repair',
        title: '整備完了のお知らせ',
        body: '先日お預かりした整備が完了いたしました。ご来店をお待ちしております。',
        createdAt: pastIso(1),
        delivered: true,
        channel: 'in-app'
      }
    ];

    return {
      shop: {
        name: 'サカイオートサービス',
        address: '大阪府堺市堺区南瓦町1-2-3',
        tel: '072-221-XXXX'
      },
      customers: customers,
      reservations: reservations,
      notifications: notifications,
      currentCustomerId: customers[0].id
    };
  };

  // ============================================================
  // window へ公開
  // ============================================================
  window.Utils = Utils;
  window.Store = Store;
})();
