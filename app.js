/*
 * app.js — サカイオートサービス デモアプリ「統合・ブートストラップ層」
 * -------------------------------------------------------------
 * 役割:
 *   - window.App を定義（state / save() / render() / setView()）
 *   - 起動時に Store から状態を復元（無ければ seed して保存）
 *   - ビュー切替タブ（店舗側 / お客様側）の制御
 *   - 各ビュー(AdminView / CustomerView)の再描画を束ねる
 * 方針:
 *   - 状態変更は各モジュールが App.state を書き換え → App.save() を呼ぶ。
 *     App.save() が「localStorage保存 + 両ビュー再描画」を一括で行う唯一の出口。
 *   - import/export は使わず IIFE で window.App に代入。
 */

(function () {
  'use strict';

  var App = {
    state: null,
    view: 'admin' // 'admin' | 'customer'
  };

  // ------------------------------------------------------------
  // 起動: 状態の復元 or 初期デモデータ生成
  // ------------------------------------------------------------
  App.boot = function () {
    var loaded = Store.load();
    if (loaded) {
      App.state = loaded;
    } else {
      // 初回のみ: seed で生成した初期データを保存（seed 自体は保存しない仕様）
      App.state = Store.seed();
      Store.save(App.state);
    }

    // 後方互換: 想定キーが欠けていても落ちないよう最低限を補完
    App.state.customers = App.state.customers || [];
    App.state.reservations = App.state.reservations || [];
    App.state.notifications = App.state.notifications || [];
    if (!App.state.currentCustomerId && App.state.customers[0]) {
      App.state.currentCustomerId = App.state.customers[0].id;
    }

    App.setView(App.view);
    App.render();
    wireTabs();
  };

  // ------------------------------------------------------------
  // 保存 + 再描画（状態変更後は必ずこれを呼ぶ）
  // ------------------------------------------------------------
  App.save = function () {
    try {
      Store.save(App.state);
    } catch (e) {
      // 保存失敗（容量超過等）でもUIは動かす
      console.error('状態の保存に失敗しました', e);
    }
    App.render();
  };

  // 両ビューを再描画（存在チェック付き）
  App.render = function () {
    if (window.AdminView && typeof AdminView.render === 'function') {
      AdminView.render();
    }
    if (window.CustomerView && typeof CustomerView.render === 'function') {
      CustomerView.render();
    }
  };

  // ------------------------------------------------------------
  // ビュー切替
  // ------------------------------------------------------------
  App.setView = function (view) {
    App.view = view;

    var adminSection = document.getElementById('admin-view');
    var customerSection = document.getElementById('customer-view');
    if (adminSection) adminSection.classList.toggle('is-hidden', view !== 'admin');
    if (customerSection) customerSection.classList.toggle('is-hidden', view !== 'customer');

    // CSS 側がどちらの手掛かりを使っても切り替わるよう、body クラスも同期
    document.body.classList.toggle('view-admin', view === 'admin');
    document.body.classList.toggle('view-customer', view === 'customer');

    // タブの見た目を同期
    var tabs = document.querySelectorAll('.view-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].classList.toggle('is-active', tabs[i].getAttribute('data-view') === view);
    }
  };

  function wireTabs() {
    var tabs = document.querySelectorAll('.view-tab');
    for (var i = 0; i < tabs.length; i++) {
      tabs[i].addEventListener('click', function () {
        App.setView(this.getAttribute('data-view'));
      });
    }
  }

  window.App = App;

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', App.boot);
  } else {
    App.boot();
  }
})();
