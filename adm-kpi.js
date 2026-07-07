// 店舗側管理画面のKPIカードモジュール。
// 4枚のKPIカードを #adm-kpi に描画し、各カードから対応画面へ遷移する。
(function () {
  'use strict';

  // 数値を安全に取得しつつカードの定義を組み立てる。
  function buildCards() {
    var Utils = window.Utils;
    var App = window.App;
    var customers = (App && App.state && App.state.customers) || [];
    var reservations = (App && App.state && App.state.reservations) || [];

    // 車検ステータス別の顧客数を集計。
    var expiredCount = 0;
    var within1mCount = 0;
    for (var i = 0; i < customers.length; i++) {
      var key = Utils.shakenStatus(customers[i].shakenExpiry).key;
      if (key === 'expired') expiredCount++;
      else if (key === 'within1m') within1mCount++;
    }

    // 今日以降の予約件数を集計。
    var today = Utils.today();
    var upcomingCount = 0;
    for (var j = 0; j < reservations.length; j++) {
      if (Utils.parseDate(reservations[j].date) >= today) upcomingCount++;
    }

    return [
      {
        num: customers.length,
        label: '総顧客数',
        hint: '顧客一覧を見る →',
        alert: false,
        onClick: function () {
          window.AdminUI.go('customers', { shakenFilter: null, query: '' });
        }
      },
      {
        num: expiredCount,
        label: '車検期限切れ',
        hint: '顧客一覧を見る →',
        alert: expiredCount > 0,
        onClick: function () {
          window.AdminUI.go('customers', { shakenFilter: 'expired' });
        }
      },
      {
        num: within1mCount,
        label: '車検1ヶ月以内',
        hint: '顧客一覧を見る →',
        alert: within1mCount > 0,
        onClick: function () {
          window.AdminUI.go('customers', { shakenFilter: 'within1m' });
        }
      },
      {
        num: upcomingCount,
        label: '今日以降の予約',
        hint: '予約管理へ →',
        alert: false,
        onClick: function () {
          window.AdminUI.go('reservations');
        }
      }
    ];
  }

  // 1枚のカード要素を生成する。
  function createCard(card) {
    var Utils = window.Utils;
    var el = document.createElement('div');
    var cls = 'kpi__card kpi__card--link';
    if (card.alert) cls += ' kpi__card--alert';
    el.className = cls;
    el.setAttribute('role', 'button');
    el.setAttribute('tabindex', '0');

    el.innerHTML =
      '<div class="kpi__num">' + Utils.escapeHtml(String(card.num)) + '</div>' +
      '<div class="kpi__label">' + Utils.escapeHtml(card.label) + '</div>' +
      '<div class="kpi__hint">' + Utils.escapeHtml(card.hint) + '</div>';

    // クリックで遷移。
    el.addEventListener('click', card.onClick);
    // Enter/Spaceでも発火。
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        card.onClick();
      }
    });
    return el;
  }

  // #adm-kpi にKPIカードを毎回組み立て直して描画する。
  function render() {
    var mount = document.getElementById('adm-kpi');
    if (!mount) return; // マウント要素が無ければ何もしない。

    var container = document.createElement('div');
    container.className = 'kpi';

    var cards = buildCards();
    for (var i = 0; i < cards.length; i++) {
      container.appendChild(createCard(cards[i]));
    }

    mount.innerHTML = '';
    mount.appendChild(container);
  }

  window.AdminKpi = { render: render };
})();
