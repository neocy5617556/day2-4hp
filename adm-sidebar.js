/* 管理画面 左サイドバー（目次ナビ + 顧客登録 + 当日のスケジュール）
   window.AdminSidebar.render() で #adm-sidebar に描画する。
   依存: window.Utils / window.App / window.AdminUI / window.AdminCustomers */
(function () {
  'use strict';

  // シンプルな単色ラインアイコン（currentColor を継承）。絵文字は使わない。
  var ICONS = {
    calendar:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<rect x="3.5" y="5" width="17" height="15" rx="2.5"/><path d="M3.5 9.5h17"/><path d="M8 3.3v3M16 3.3v3"/></svg>',
    car:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M5 11l1.4-3.4A2 2 0 0 1 8.3 6.3h7.4a2 2 0 0 1 1.9 1.3L19 11"/>' +
      '<rect x="3.4" y="11" width="17.2" height="5" rx="1.6"/>' +
      '<circle cx="7.6" cy="16.4" r="1.35"/><circle cx="16.4" cy="16.4" r="1.35"/></svg>',
    bell:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<path d="M6.5 10a5.5 5.5 0 0 1 11 0c0 3.7 1.3 5 1.3 5H5.2s1.3-1.3 1.3-5Z"/>' +
      '<path d="M10 18.5a2 2 0 0 0 4 0"/></svg>',
    userPlus:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="9.2" cy="8" r="3.2"/><path d="M3.8 19a5.4 5.4 0 0 1 10.8 0"/>' +
      '<path d="M18.5 7.5v5M16 10h5"/></svg>',
    clock:
      '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round">' +
      '<circle cx="12" cy="12" r="8.2"/><path d="M12 7.6V12l3 1.8"/></svg>'
  };

  // ナビ定義（表示順）
  var NAV_ITEMS = [
    { section: 'reservations',  icon: ICONS.calendar, label: '予約管理' },
    { section: 'customers',     icon: ICONS.car,      label: '顧客・車両' },
    { section: 'notifications', icon: ICONS.bell,     label: '通知センター' }
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

  // 顧客名を id から引く
  function customerName(id) {
    var customers = (window.App && App.state && App.state.customers) || [];
    for (var i = 0; i < customers.length; i++) {
      if (customers[i].id === id) return customers[i].name;
    }
    return '（不明な顧客）';
  }

  // 当日の予約（時間昇順）を返す
  function todaysReservations() {
    var Utils = window.Utils;
    var reservations = (window.App && App.state && App.state.reservations) || [];
    var todayYMD = Utils.toYMD(Utils.today());
    var list = reservations.filter(function (r) { return r && r.date === todayYMD; });
    list.sort(function (a, b) { return (a.time || '').localeCompare(b.time || ''); });
    return list;
  }

  // 当日スケジュールのHTML（各予約に 完了 / キャンセル を付ける）
  function scheduleHtml() {
    var Utils = window.Utils;
    var list = todaysReservations();
    var todayLabel = Utils.fmtJPShort(Utils.toYMD(Utils.today()));

    var body;
    if (list.length === 0) {
      body = '<div class="adm-sched__empty">本日の予約はありません</div>';
    } else {
      body = '';
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        var id = Utils.escapeHtml(r.id);
        // 完了済みは「完了」チップ、未完了は 完了 / キャンセル ボタン。
        var acts = (r.status === 'completed')
          ? '<span class="adm-sched__done">完了</span>'
          : '<div class="adm-sched__acts">' +
              '<button type="button" class="adm-mini-btn adm-mini-btn--primary" data-sched-complete="' + id + '">完了</button>' +
              '<button type="button" class="adm-mini-btn" data-sched-cancel="' + id + '">キャンセル</button>' +
            '</div>';
        body +=
          '<div class="adm-sched__item" data-resv="' + id + '">' +
            '<div class="adm-sched__top">' +
              '<span class="adm-sched__time">' + Utils.escapeHtml(r.time || '--:--') + '</span>' +
              '<span class="adm-sched__body">' +
                '<span class="adm-sched__name">' + Utils.escapeHtml(customerName(r.customerId)) + '</span>' +
                '<span class="adm-sched__work">' + Utils.escapeHtml(r.workType || '') + '</span>' +
              '</span>' +
            '</div>' +
            acts +
          '</div>';
      }
    }

    return '' +
      '<div class="adm-sched">' +
        '<div class="adm-sched__title">' +
          '<span class="adm-sched__title-icon" aria-hidden="true">' + ICONS.clock + '</span>' +
          '本日のスケジュール' +
          '<span class="adm-sched__date">' + Utils.escapeHtml(todayLabel) + '</span>' +
        '</div>' +
        body +
      '</div>';
  }

  // サイドバーの売上（当日・当月）
  function salesHtml() {
    var Utils = window.Utils;
    var S = window.Sales;
    if (!S) return '';
    return '' +
      '<div class="adm-sside-sales">' +
        '<div class="adm-sside-sales__title">売上</div>' +
        '<div class="adm-sside-sales__row">' +
          '<span class="adm-sside-sales__lab">本日</span>' +
          '<span class="adm-sside-sales__num">' + Utils.escapeHtml(Utils.yen(S.todayTotal())) + '</span>' +
        '</div>' +
        '<div class="adm-sside-sales__row">' +
          '<span class="adm-sside-sales__lab">当月</span>' +
          '<span class="adm-sside-sales__num">' + Utils.escapeHtml(Utils.yen(S.monthTotal())) + '</span>' +
        '</div>' +
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
      '</nav>' +
      '<button type="button" class="adm-sidebar__cta">' +
        '<span class="adm-sidebar__cta-icon" aria-hidden="true">' + ICONS.userPlus + '</span>' +
        '顧客を登録' +
      '</button>' +
      salesHtml() +
      scheduleHtml();

    // ナビ項目: セクション切替
    var els = mount.querySelectorAll('.adm-nav__item');
    for (var j = 0; j < els.length; j++) bindSection(els[j], els[j].getAttribute('data-section'));

    // 顧客登録ボタン: 新規フォームを開く
    var cta = mount.querySelector('.adm-sidebar__cta');
    if (cta) {
      cta.addEventListener('click', function () {
        if (window.AdminCustomers && typeof AdminCustomers.openNew === 'function') {
          AdminCustomers.openNew();
        } else if (window.AdminUI) {
          AdminUI.go('customers');
        }
      });
    }

    // 当日スケジュール: 完了 / キャンセル / 項目クリックで予約管理へ
    var schedWrap = mount.querySelector('.adm-sched');
    if (schedWrap) {
      schedWrap.addEventListener('click', function (e) {
        var comp = e.target.closest ? e.target.closest('[data-sched-complete]') : null;
        if (comp && window.AdminReservations && AdminReservations.startComplete) {
          e.stopPropagation();
          AdminReservations.startComplete(comp.getAttribute('data-sched-complete'));
          return;
        }
        var canc = e.target.closest ? e.target.closest('[data-sched-cancel]') : null;
        if (canc && window.AdminReservations && AdminReservations.cancelReservation) {
          e.stopPropagation();
          AdminReservations.cancelReservation(canc.getAttribute('data-sched-cancel'));
          return;
        }
        // 予約カード本体クリック（ボタン以外）で予約管理へ
        var item = e.target.closest ? e.target.closest('.adm-sched__item') : null;
        if (item && window.AdminUI) AdminUI.go('reservations');
      });
    }
  }

  // 要素にクリック/キーボードでのセクション遷移を付与
  function bindSection(el, section) {
    function go() {
      if (window.AdminUI && typeof AdminUI.go === 'function') AdminUI.go(section);
    }
    el.addEventListener('click', go);
    el.addEventListener('keydown', function (e) {
      if (e.key === 'Enter' || e.key === ' ' || e.key === 'Spacebar') {
        e.preventDefault();
        go();
      }
    });
  }

  window.AdminSidebar = { render: render };
})();
