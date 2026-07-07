/*
 * admin.js — 店舗側 管理画面「シェル（統合レイアウト & ナビ状態）」
 * -------------------------------------------------------------
 * 役割:
 *   - 管理画面の骨格（左サイドバー + メインの KPI + 3セクション）を組み立てる
 *   - 管理画面ローカルのUI状態 window.AdminUI（現在セクション/検索語/車検フィルタ）を提供
 *   - 各セクションの描画モジュールを束ねて呼び出す:
 *       AdminSidebar / AdminKpi / AdminReservations / AdminCustomers / AdminNotifications
 *   - window.AdminView.render() が app.js から呼ばれる統合エントリ
 * 方針:
 *   - データ変更は各モジュールが App.save()（保存+全再描画）。
 *   - セクション切替や検索などUIだけの変化は AdminUI.go()/rerender()（保存しない）。
 *   - import/export は使わず IIFE で window に代入。
 */

(function () {
  'use strict';

  // セクションキー → メインに並ぶパネルの id
  var PANELS = {
    reservations: 'adm-reservations',
    customers: 'adm-customers',
    notifications: 'adm-notifications'
  };

  // 管理画面ローカルのUI状態＆ナビゲーション
  var AdminUI = {
    section: 'reservations', // 既定は「予約管理」を上（最初）に表示
    query: '',               // 顧客検索語
    shakenFilter: null,      // null | 'expired' | 'within1m' | 'within3m' | 'ok'

    // セクション切替。opts で {query, shakenFilter} を明示できる。
    // 明示されない項目は既定（検索語クリア・フィルタ解除）に戻す。
    go: function (section, opts) {
      opts = opts || {};
      if (PANELS[section]) this.section = section;
      this.shakenFilter = ('shakenFilter' in opts) ? opts.shakenFilter : null;
      this.query = ('query' in opts) ? opts.query : '';
      AdminView.render();
      // 切替時は先頭へスクロール（長い一覧からの遷移でも頭出し）
      try { window.scrollTo({ top: 0, behavior: 'smooth' }); } catch (e) { window.scrollTo(0, 0); }
    },

    // 管理画面だけ再描画（UIのみの更新用）
    rerender: function () { AdminView.render(); }
  };

  // 骨格HTML（毎回組み立て直す。各モジュールが自分のマウント要素へ描画する）
  function skeleton() {
    return '' +
      '<div class="adm-layout">' +
      '  <aside class="adm-sidebar" id="adm-sidebar"></aside>' +
      '  <div class="adm-main">' +
      '    <div class="adm-kpi-wrap" id="adm-kpi"></div>' +
      '    <section class="adm-panel" id="adm-reservations"></section>' +
      '    <section class="adm-panel" id="adm-customers"></section>' +
      '    <section class="adm-panel" id="adm-notifications"></section>' +
      '  </div>' +
      '</div>';
  }

  var AdminView = {
    render: function () {
      var root = document.getElementById('admin-root');
      if (!root) return;

      root.innerHTML = skeleton();

      // サブモジュール描画（未ロードでも落ちないよう存在チェック）
      call(window.AdminSidebar);
      call(window.AdminKpi);
      call(window.AdminReservations);
      call(window.AdminCustomers);
      call(window.AdminNotifications);

      // アクティブなセクションのパネルだけ表示
      Object.keys(PANELS).forEach(function (key) {
        var el = document.getElementById(PANELS[key]);
        if (el) el.classList.toggle('is-hidden', key !== AdminUI.section);
      });
    }
  };

  function call(mod) {
    if (mod && typeof mod.render === 'function') {
      try { mod.render(); } catch (e) { console.error('管理画面セクションの描画に失敗', e); }
    }
  }

  window.AdminUI = AdminUI;
  window.AdminView = AdminView;
})();
