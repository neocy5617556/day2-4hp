/* 管理画面 左サイドバー（目次ナビ）
   window.AdminSidebar.render() で #adm-sidebar に描画する。
   依存: window.Utils / window.App / window.AdminUI */
(function () {
  'use strict';

  // ナビ定義（表示順）
  var NAV_ITEMS = [
    { section: 'reservations',  icon: '📅', label: '予約管理' },
    { section: 'customers',     icon: '🚗', label: '顧客・車両' },
    { section: 'notifications', icon: '🔔', label: '通知センター' }
  ];

  // お客様リクエスト（未対応予約）の件数
  function countCustomerRequests() {
    var reservations = (window.App && App.state && App.state.reservations) || [];
    var n = 0;
    for (var i = 0; i < reservations.length; i++) {
      var r = reservations[i];
      if (r && r.source === 'customer' && r.status === 'requested') n++;
    }
    return n;
  }

  // 車検が未対応（期限切れ/1ヶ月内/3ヶ月内）の顧客数
  function countShakenAlerts() {
    var customers = (window.App && App.state && App.state.customers) || [];
    var alertKeys = { expired: true, within1m: true, within3m: true };
    var n = 0;
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      if (!c || !c.shakenExpiry) continue;
      var status = Utils.shakenStatus(c.shakenExpiry);
      if (status && alertKeys[status.key]) n++;
    }
    return n;
  }

  // section ごとのバッジ件数（0以下は非表示）
  function badgeFor(section) {
    if (section === 'reservations') return countCustomerRequests();
    if (section === 'customers') return countShakenAlerts();
    return 0;
  }

  // ナビ1項目のHTML
  function itemHtml(item) {
    var current = window.AdminUI && AdminUI.section;
    var isActive = current === item.section;
    var count = badgeFor(item.section);

    var badgeHtml = count > 0
      ? '<span class="adm-nav__badge">' + count + '</span>'
      : '';

    return '' +
      '<div class="adm-nav__item' + (isActive ? ' is-active' : '') + '"' +
        ' role="button" tabindex="0"' +
        ' data-section="' + Utils.escapeHtml(item.section) + '">' +
        '<span class="adm-nav__icon" aria-hidden="true">' + item.icon + '</span>' +
        '<span class="adm-nav__label">' + Utils.escapeHtml(item.label) + '</span>' +
        badgeHtml +
      '</div>';
  }

  // 描画本体
  function render() {
    var mount = document.getElementById('adm-sidebar');
    if (!mount) return; // マウント要素が無ければ何もしない

    var itemsHtml = '';
    for (var i = 0; i < NAV_ITEMS.length; i++) {
      itemsHtml += itemHtml(NAV_ITEMS[i]);
    }

    mount.innerHTML =
      '<nav class="adm-nav">' +
        '<div class="adm-nav__title">メニュー</div>' +
        itemsHtml +
      '</nav>';

    // イベント付与（セクション切替）
    var els = mount.querySelectorAll('.adm-nav__item');
    for (var j = 0; j < els.length; j++) {
      bindItem(els[j]);
    }
  }

  // 1項目にクリック/キーボード操作を付与
  function bindItem(el) {
    var section = el.getAttribute('data-section');
    function go() {
      if (window.AdminUI && typeof AdminUI.go === 'function') AdminUI.go(section);
    }
    el.addEventListener('click', go);
    el.addEventListener('keydown', function (e) {
      // Enter / Space で発火
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        go();
      }
    });
  }

  window.AdminSidebar = { render: render };
})();
