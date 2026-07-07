/*
 * admin.js — サカイオートサービス デモアプリ「店舗側 管理画面ビュー」
 * -------------------------------------------------------------
 * 役割:
 *   - window.AdminView.render() : #admin-root の中身を全描画（毎回 innerHTML 再構築 + イベント再付与）
 * 構成:
 *   - KPIサマリーバー（計器風）
 *   - (A) 顧客・車両一覧（新規/編集フォーム付き）
 *   - (B) 予約管理（日付グルーピング・重複視覚化・追加/確定）
 *   - (C) 通知センター（車検リマインド一括生成・手動発行・発行済み一覧）
 * 方針:
 *   - ビルド無し / import・export なし / 外部ライブラリ無し。IIFE で window.AdminView に代入。
 *   - 状態変更後は必ず App.save()（Store保存 + 各ビュー再描画）を呼ぶ。
 *   - ユーザー入力を innerHTML に出す箇所は必ず Utils.escapeHtml() を通す。
 *   - className は他エージェントとの合意名を優先使用。独自追加は "adm-" 接頭辞。
 */

(function () {
  'use strict';

  var AdminView = {};

  // ============================================================
  // モジュールローカルUI状態（再描画をまたいで維持したい開閉状態など）
  // ============================================================
  var ui = {
    customerFormOpen: false, // 顧客フォームの表示中フラグ
    editingCustomerId: null, // 編集中の顧客id（nullなら新規）
    resvFormOpen: false      // 予約追加フォームの表示中フラグ
  };

  // ============================================================
  // 小さなヘルパー
  // ============================================================

  var esc = function (s) { return window.Utils.escapeHtml(s); };

  // 顧客id -> 顧客名（無ければ「（不明な顧客）」）
  function customerName(id) {
    var list = window.App.state.customers || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i].name;
    }
    return '（不明な顧客）';
  }

  // 車検満了日の「あと〇日 / 〇日超過」表記
  function daysUntilLabel(ymd) {
    var d = window.Utils.daysUntil(ymd);
    if (isNaN(d)) return '';
    if (d < 0) return Math.abs(d) + '日超過';
    if (d === 0) return '本日満了';
    return 'あと' + d + '日';
  }

  // 簡易トースト（再描画に巻き込まれないよう DOM に直接差し込み、自動消去）
  function toast(message) {
    var root = document.getElementById('admin-root');
    if (!root) return;
    var el = document.createElement('div');
    el.className = 'adm-toast';
    el.textContent = message;
    root.appendChild(el);
    // 次フレームで表示状態クラスを付与（CSSトランジション用フック）
    window.setTimeout(function () { el.classList.add('adm-toast--show'); }, 10);
    window.setTimeout(function () {
      el.classList.remove('adm-toast--show');
      window.setTimeout(function () {
        if (el.parentNode) el.parentNode.removeChild(el);
      }, 300);
    }, 2600);
  }

  // category(種類) -> 見出しラベル
  function categoryLabel(cat) {
    var map = {
      shaken: '車検リマインド',
      repair: '修理完了のお知らせ',
      tire: 'タイヤ交換のご案内',
      other: 'その他のお知らせ'
    };
    return map[cat] || cat || 'お知らせ';
  }

  // 手動通知フォームの定型文プリセット
  var NOTIF_PRESETS = {
    repair: {
      title: '整備完了のお知らせ',
      body: 'ご依頼のお車の整備が完了しました。ご来店をお待ちしております。'
    },
    tire: {
      title: 'タイヤ交換のご案内',
      body: '季節の変わり目です。タイヤ交換・点検のご案内です。お気軽にご相談ください。'
    },
    other: {
      title: '',
      body: ''
    }
  };

  var WORK_TYPES = ['車検整備', 'オイル交換', '12ヶ月点検', 'タイヤ交換', 'その他'];

  // ============================================================
  // KPIサマリーバー
  // ============================================================
  function renderKpi() {
    var st = window.App.state;
    var customers = st.customers || [];
    var reservations = st.reservations || [];

    var expired = 0;
    var within1m = 0;
    customers.forEach(function (c) {
      var d = window.Utils.daysUntil(c.shakenExpiry);
      if (isNaN(d)) return;
      if (d < 0) expired++;
      else if (d <= 30) within1m++;
    });

    // 今日以降の予約数
    var upcoming = reservations.filter(function (r) {
      var d = window.Utils.daysUntil(r.date);
      return !isNaN(d) && d >= 0;
    }).length;

    function card(num, label, alert) {
      return '' +
        '<div class="kpi__card' + (alert ? ' kpi__card--alert' : '') + '">' +
          '<div class="kpi__num">' + num + '</div>' +
          '<div class="kpi__label">' + esc(label) + '</div>' +
        '</div>';
    }

    return '' +
      '<div class="kpi">' +
        card(customers.length, '総顧客数', false) +
        card(expired, '車検 期限切れ', expired > 0) +
        card(within1m, '車検 1ヶ月以内', within1m > 0) +
        card(upcoming, '今日以降の予約', false) +
      '</div>';
  }

  // ============================================================
  // (A) 顧客・車両一覧
  // ============================================================
  function renderCustomers() {
    var customers = (window.App.state.customers || []).slice();

    // 車検満了が近い順（daysUntil 昇順。NaN は末尾）
    customers.sort(function (a, b) {
      var da = window.Utils.daysUntil(a.shakenExpiry);
      var db = window.Utils.daysUntil(b.shakenExpiry);
      if (isNaN(da)) da = Infinity;
      if (isNaN(db)) db = Infinity;
      return da - db;
    });

    var rows = customers.map(function (c) {
      var stt = window.Utils.shakenStatus(c.shakenExpiry);
      return '' +
        '<tr class="adm-cust-row">' +
          '<td class="adm-cust-name">' +
            '<div>' + esc(c.name) + '</div>' +
            '<div class="adm-cust-kana">' + esc(c.kana) + '</div>' +
          '</td>' +
          '<td>' + esc(c.carModel) + '</td>' +
          '<td>' + esc(c.plate) + '</td>' +
          '<td>' +
            esc(window.Utils.fmtJP(c.shakenExpiry)) +
            '<span class="adm-days">' + esc(daysUntilLabel(c.shakenExpiry)) + '</span>' +
          '</td>' +
          '<td>' + esc(window.Utils.fmtJP(c.lastVisit)) + '</td>' +
          '<td>' + esc(c.nextAction) + '</td>' +
          '<td><span class="badge ' + stt.className + '">' + esc(stt.label) + '</span></td>' +
          '<td><button type="button" class="adm-btn adm-btn--sm" data-action="edit-customer" data-id="' + esc(c.id) + '">編集</button></td>' +
        '</tr>';
    }).join('');

    if (!rows) {
      rows = '<tr><td colspan="8" class="adm-empty">顧客が登録されていません。</td></tr>';
    }

    var table = '' +
      '<div class="adm-table-wrap">' +
        '<table class="adm-table">' +
          '<thead><tr>' +
            '<th>顧客名</th><th>車種</th><th>ナンバー</th><th>車検満了日</th>' +
            '<th>前回来店日</th><th>次のアクション</th><th>車検状況</th><th>操作</th>' +
          '</tr></thead>' +
          '<tbody>' + rows + '</tbody>' +
        '</table>' +
      '</div>';

    return '' +
      '<section class="adm-section">' +
        '<div class="adm-section__head">' +
          '<h2 class="adm-section__title">顧客・車両一覧</h2>' +
          '<button type="button" class="adm-btn adm-btn--primary" data-action="new-customer">＋ 新規顧客登録</button>' +
        '</div>' +
        (ui.customerFormOpen ? renderCustomerForm() : '') +
        table +
      '</section>';
  }

  // 顧客 新規/編集フォーム（インライン展開）
  function renderCustomerForm() {
    var editing = null;
    if (ui.editingCustomerId) {
      var list = window.App.state.customers || [];
      for (var i = 0; i < list.length; i++) {
        if (list[i].id === ui.editingCustomerId) { editing = list[i]; break; }
      }
    }
    var v = editing || {};
    var title = editing ? '顧客情報の編集' : '新規顧客登録';

    function field(label, name, value, type, required) {
      return '' +
        '<label class="adm-field">' +
          '<span class="adm-field__label">' + esc(label) + (required ? ' <em class="adm-req">*</em>' : '') + '</span>' +
          '<input class="adm-input" type="' + (type || 'text') + '" name="' + name + '" value="' + esc(value || '') + '"' + (required ? ' required' : '') + '>' +
        '</label>';
    }

    return '' +
      '<form class="adm-form" data-form="customer">' +
        '<h3 class="adm-form__title">' + esc(title) + '</h3>' +
        '<div class="adm-form__grid">' +
          field('顧客名', 'name', v.name, 'text', true) +
          field('ふりがな', 'kana', v.kana, 'text', false) +
          field('電話', 'phone', v.phone, 'text', false) +
          field('車種', 'carModel', v.carModel, 'text', false) +
          field('ナンバー', 'plate', v.plate, 'text', false) +
          field('車検満了日', 'shakenExpiry', v.shakenExpiry, 'date', false) +
          field('前回来店日', 'lastVisit', v.lastVisit, 'date', false) +
          field('次のアクション', 'nextAction', v.nextAction, 'text', false) +
        '</div>' +
        '<div class="adm-form__actions">' +
          '<button type="submit" class="adm-btn adm-btn--primary">保存</button>' +
          '<button type="button" class="adm-btn" data-action="cancel-customer">キャンセル</button>' +
        '</div>' +
      '</form>';
  }

  // ============================================================
  // (B) 予約管理
  // ============================================================
  function renderReservations() {
    var reservations = (window.App.state.reservations || []).slice();

    // date+time の出現回数を集計（重複判定用）
    var slotCount = {};
    reservations.forEach(function (r) {
      var key = r.date + ' ' + r.time;
      slotCount[key] = (slotCount[key] || 0) + 1;
    });

    // お客様リクエスト（未確定）を先頭にハイライト表示
    var requested = reservations.filter(function (r) {
      return r.source === 'customer' && r.status === 'requested';
    });
    var requestedHtml = '';
    if (requested.length) {
      requested.sort(function (a, b) {
        return (a.date + a.time).localeCompare(b.date + b.time);
      });
      var reqCards = requested.map(function (r) {
        return renderReservationCard(r, slotCount, true);
      }).join('');
      requestedHtml = '' +
        '<div class="adm-resv-requests">' +
          '<h3 class="adm-resv-requests__title">🙋 お客様からの予約リクエスト（要確認 ' + requested.length + '件）</h3>' +
          '<div class="adm-resv-list">' + reqCards + '</div>' +
        '</div>';
    }

    // 日付ごとにグルーピング（日付昇順・グループ内は時間昇順）
    var groups = {};
    reservations.forEach(function (r) {
      if (!groups[r.date]) groups[r.date] = [];
      groups[r.date].push(r);
    });
    var dates = Object.keys(groups).sort();

    var groupsHtml = dates.map(function (date) {
      var items = groups[date].slice().sort(function (a, b) {
        return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0);
      });
      // グループ内に重複があるか
      var hasConflict = items.some(function (r) {
        return slotCount[r.date + ' ' + r.time] >= 2;
      });
      var cards = items.map(function (r) {
        return renderReservationCard(r, slotCount, false);
      }).join('');
      return '' +
        '<div class="adm-resv-group">' +
          '<h3 class="adm-resv-group__date">' +
            esc(window.Utils.fmtJPShort(date)) +
            (hasConflict ? ' <span class="adm-resv-group__flag">⚠ 重複あり</span>' : '') +
          '</h3>' +
          '<div class="adm-resv-list">' + cards + '</div>' +
        '</div>';
    }).join('');

    if (!groupsHtml) {
      groupsHtml = '<div class="adm-empty">予約はありません。</div>';
    }

    return '' +
      '<section class="adm-section">' +
        '<div class="adm-section__head">' +
          '<h2 class="adm-section__title">予約管理</h2>' +
          '<button type="button" class="adm-btn adm-btn--primary" data-action="new-reservation">＋ 予約追加</button>' +
        '</div>' +
        (ui.resvFormOpen ? renderReservationForm() : '') +
        requestedHtml +
        groupsHtml +
      '</section>';
  }

  // 予約カード1件
  function renderReservationCard(r, slotCount, showConfirmBtn) {
    var isConflict = slotCount[r.date + ' ' + r.time] >= 2;
    var sourceLabel = r.source === 'customer' ? 'お客様' : '店舗';
    var sourceClass = r.source === 'customer' ? 'adm-src--customer' : 'adm-src--shop';
    var statusLabel = r.status === 'confirmed' ? '確定' : 'リクエスト';
    var statusClass = r.status === 'confirmed' ? 'adm-status--confirmed' : 'adm-status--requested';

    var confirmBtn = '';
    if (r.status === 'requested') {
      confirmBtn = '<button type="button" class="adm-btn adm-btn--sm adm-btn--primary" data-action="confirm-reservation" data-id="' + esc(r.id) + '">確定する</button>';
    }

    return '' +
      '<div class="resv-card' + (isConflict ? ' resv-card--conflict' : '') + '">' +
        '<div class="resv-card__time">' + esc(r.time) + '</div>' +
        '<div class="resv-card__body">' +
          '<div class="resv-card__name">' + esc(customerName(r.customerId)) + '</div>' +
          '<div class="resv-card__work">' + esc(r.workType) + '</div>' +
          '<div class="resv-card__meta">' +
            '<span class="adm-src ' + sourceClass + '">' + sourceLabel + '</span>' +
            '<span class="adm-status ' + statusClass + '">' + statusLabel + '</span>' +
            (isConflict ? '<span class="adm-conflict-label">⚠ 時間重複</span>' : '') +
          '</div>' +
        '</div>' +
        (confirmBtn ? '<div class="resv-card__action">' + confirmBtn + '</div>' : '') +
      '</div>';
  }

  // 予約追加フォーム
  function renderReservationForm() {
    var customers = window.App.state.customers || [];
    var custOptions = customers.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '（' + esc(c.carModel) + '）</option>';
    }).join('');
    var workOptions = WORK_TYPES.map(function (w) {
      return '<option value="' + esc(w) + '">' + esc(w) + '</option>';
    }).join('');
    var todayYmd = window.Utils.toYMD(window.Utils.today());

    return '' +
      '<form class="adm-form" data-form="reservation">' +
        '<h3 class="adm-form__title">予約追加</h3>' +
        '<div class="adm-form__grid">' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">顧客 <em class="adm-req">*</em></span>' +
            '<select class="adm-input" name="customerId" required>' + custOptions + '</select>' +
          '</label>' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">日付 <em class="adm-req">*</em></span>' +
            '<input class="adm-input" type="date" name="date" value="' + esc(todayYmd) + '" required>' +
          '</label>' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">時間 <em class="adm-req">*</em></span>' +
            '<input class="adm-input" type="time" name="time" value="10:00" required>' +
          '</label>' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">作業内容</span>' +
            '<select class="adm-input" name="workType">' + workOptions + '</select>' +
          '</label>' +
        '</div>' +
        '<div class="adm-form__actions">' +
          '<button type="submit" class="adm-btn adm-btn--primary">追加</button>' +
          '<button type="button" class="adm-btn" data-action="cancel-reservation">キャンセル</button>' +
        '</div>' +
      '</form>';
  }

  // ============================================================
  // (C) 通知センター
  // ============================================================
  function renderNotifications() {
    var customers = window.App.state.customers || [];
    var custOptions = customers.map(function (c) {
      return '<option value="' + esc(c.id) + '">' + esc(c.name) + '</option>';
    }).join('');

    // 手動発行フォーム
    var issueForm = '' +
      '<form class="adm-form adm-notif-form" data-form="notif">' +
        '<h3 class="adm-form__title">手動通知の発行</h3>' +
        '<div class="adm-form__grid">' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">宛先顧客 <em class="adm-req">*</em></span>' +
            '<select class="adm-input" name="customerId" required>' + custOptions + '</select>' +
          '</label>' +
          '<label class="adm-field">' +
            '<span class="adm-field__label">種類</span>' +
            '<select class="adm-input" name="category">' +
              '<option value="repair">修理完了のお知らせ</option>' +
              '<option value="tire">タイヤ交換時期のお知らせ（季節）</option>' +
              '<option value="other">その他</option>' +
            '</select>' +
          '</label>' +
        '</div>' +
        '<label class="adm-field adm-field--full">' +
          '<span class="adm-field__label">件名</span>' +
          '<input class="adm-input" type="text" name="title" value="' + esc(NOTIF_PRESETS.repair.title) + '">' +
        '</label>' +
        '<label class="adm-field adm-field--full">' +
          '<span class="adm-field__label">本文</span>' +
          '<textarea class="adm-input adm-textarea" name="body" rows="3">' + esc(NOTIF_PRESETS.repair.body) + '</textarea>' +
        '</label>' +
        '<div class="adm-form__actions">' +
          '<button type="submit" class="adm-btn adm-btn--primary">発行</button>' +
        '</div>' +
      '</form>';

    // 発行済み通知一覧（新しい順）。契約どおり Notifications.all() を優先使用。
    var notifs = (window.Notifications && typeof window.Notifications.all === 'function')
      ? window.Notifications.all().slice()
      : (window.App.state.notifications || []).slice();
    notifs.sort(function (a, b) {
      return (b.createdAt || '').localeCompare(a.createdAt || '');
    });

    var lineNote = (window.Channel && typeof window.Channel.channelNote === 'function')
      ? window.Channel.channelNote()
      : '実際の運用ではお客様のLINEに自動送信されます。';

    var notifItems = notifs.map(function (n) {
      var dt = '';
      if (n.createdAt) {
        var d = new Date(n.createdAt);
        if (!isNaN(d.getTime())) {
          dt = d.getFullYear() + '/' + (d.getMonth() + 1) + '/' + d.getDate() +
               ' ' + ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
        }
      }
      return '' +
        '<li class="notif">' +
          '<div class="notif__head">' +
            '<span class="notif__cat">' + esc(categoryLabel(n.category)) + '</span>' +
            '<span class="notif__to">宛先：' + esc(customerName(n.customerId)) + '</span>' +
            '<span class="notif__time">' + esc(dt) + '</span>' +
          '</div>' +
          '<div class="notif__title">' + esc(n.title) + '</div>' +
          '<div class="notif__body">' + esc(n.body) + '</div>' +
          '<div class="notif__linenote">' + esc(lineNote) + '</div>' +
        '</li>';
    }).join('');

    if (!notifItems) {
      notifItems = '<li class="adm-empty">発行済みの通知はありません。</li>';
    }

    return '' +
      '<section class="adm-section">' +
        '<div class="adm-section__head">' +
          '<h2 class="adm-section__title">通知センター</h2>' +
          '<button type="button" class="adm-btn adm-btn--primary" data-action="gen-shaken">🔔 車検リマインドを一括生成</button>' +
        '</div>' +
        issueForm +
        '<h3 class="adm-notif-list__title">発行済み通知一覧</h3>' +
        '<ul class="adm-notif-list">' + notifItems + '</ul>' +
      '</section>';
  }

  // ============================================================
  // イベント付与
  // ============================================================
  function bindEvents(root) {
    // クリック系はイベント委譲でまとめて処理
    root.addEventListener('click', function (e) {
      var target = e.target.closest ? e.target.closest('[data-action]') : null;
      if (!target || !root.contains(target)) return;
      var action = target.getAttribute('data-action');

      if (action === 'new-customer') {
        ui.editingCustomerId = null;
        ui.customerFormOpen = true;
        AdminView.render();
      } else if (action === 'edit-customer') {
        ui.editingCustomerId = target.getAttribute('data-id');
        ui.customerFormOpen = true;
        AdminView.render();
      } else if (action === 'cancel-customer') {
        ui.customerFormOpen = false;
        ui.editingCustomerId = null;
        AdminView.render();
      } else if (action === 'new-reservation') {
        ui.resvFormOpen = true;
        AdminView.render();
      } else if (action === 'cancel-reservation') {
        ui.resvFormOpen = false;
        AdminView.render();
      } else if (action === 'confirm-reservation') {
        confirmReservation(target.getAttribute('data-id'));
      } else if (action === 'gen-shaken') {
        generateShakenReminders();
      }
    });

    // フォーム送信
    root.addEventListener('submit', function (e) {
      var form = e.target;
      if (!form || !form.getAttribute) return;
      var kind = form.getAttribute('data-form');
      if (!kind) return;
      e.preventDefault();
      if (kind === 'customer') submitCustomer(form);
      else if (kind === 'reservation') submitReservation(form);
      else if (kind === 'notif') submitNotif(form);
    });

    // 通知フォームの種類selectで定型文をプリセット
    root.addEventListener('change', function (e) {
      var el = e.target;
      if (!el || el.name !== 'category') return;
      var form = el.form;
      if (!form || form.getAttribute('data-form') !== 'notif') return;
      var preset = NOTIF_PRESETS[el.value];
      if (!preset) return;
      var titleEl = form.querySelector('[name="title"]');
      var bodyEl = form.querySelector('[name="body"]');
      if (titleEl) titleEl.value = preset.title;
      if (bodyEl) bodyEl.value = preset.body;
    });
  }

  // ============================================================
  // アクション処理
  // ============================================================

  // 顧客の追加/更新
  function submitCustomer(form) {
    var get = function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      return el ? el.value.trim() : '';
    };
    var name = get('name');
    if (!name) {
      toast('顧客名は必須です。');
      var nameEl = form.querySelector('[name="name"]');
      if (nameEl) nameEl.focus();
      return;
    }
    var data = {
      name: name,
      kana: get('kana'),
      phone: get('phone'),
      carModel: get('carModel'),
      plate: get('plate'),
      shakenExpiry: get('shakenExpiry'),
      lastVisit: get('lastVisit'),
      nextAction: get('nextAction')
    };

    var customers = window.App.state.customers;
    if (ui.editingCustomerId) {
      // 既存更新
      for (var i = 0; i < customers.length; i++) {
        if (customers[i].id === ui.editingCustomerId) {
          data.id = customers[i].id;
          customers[i] = data;
          break;
        }
      }
      toast('顧客情報を更新しました。');
    } else {
      // 新規追加
      data.id = window.Utils.uid('cust_');
      customers.push(data);
      toast('新規顧客を登録しました。');
    }

    ui.customerFormOpen = false;
    ui.editingCustomerId = null;
    window.App.save(); // 保存 + 全再描画
  }

  // 予約の追加
  function submitReservation(form) {
    var get = function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      return el ? el.value : '';
    };
    var customerId = get('customerId');
    var date = get('date');
    var time = get('time');
    var workType = get('workType') || 'その他';

    if (!customerId || !date || !time) {
      toast('顧客・日付・時間は必須です。');
      return;
    }

    var reservation = {
      id: window.Utils.uid('resv_'),
      customerId: customerId,
      date: date,
      time: time,
      workType: workType,
      source: 'shop',
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };
    window.App.state.reservations.push(reservation);

    // 予約確認通知も生成
    if (window.Notifications && typeof window.Notifications.forReservation === 'function') {
      window.Notifications.forReservation(reservation, customerName(customerId));
    }

    ui.resvFormOpen = false;
    toast('予約を追加しました。');
    window.App.save();
  }

  // 予約リクエストを確定に更新
  function confirmReservation(id) {
    var reservations = window.App.state.reservations || [];
    for (var i = 0; i < reservations.length; i++) {
      if (reservations[i].id === id) {
        reservations[i].status = 'confirmed';
        break;
      }
    }
    toast('予約を確定しました。');
    window.App.save();
  }

  // 車検リマインド一括生成
  function generateShakenReminders() {
    if (!window.Notifications || typeof window.Notifications.generateShakenReminders !== 'function') {
      toast('通知機能が利用できません。');
      return;
    }
    var result = window.Notifications.generateShakenReminders() || {};
    var count = 0;
    if (typeof result.created === 'number') count = result.created;
    else if (Array.isArray(result.created)) count = result.created.length;
    else if (Array.isArray(result.drafts)) count = result.drafts.length;

    if (count > 0) {
      toast(count + '件の車検リマインドを生成しました。');
    } else {
      toast('対象なし（生成対象の顧客はいません）。');
    }
    // generateShakenReminders 内で save 済みでも安全のため再描画を促す
    if (window.App && typeof window.App.render === 'function') {
      window.App.render();
    }
  }

  // 手動通知の発行
  function submitNotif(form) {
    var get = function (n) {
      var el = form.querySelector('[name="' + n + '"]');
      return el ? el.value.trim() : '';
    };
    var customerId = get('customerId');
    var category = get('category') || 'other';
    var title = get('title');
    var body = get('body');

    if (!customerId) {
      toast('宛先顧客を選択してください。');
      return;
    }
    if (!title && !body) {
      toast('件名または本文を入力してください。');
      return;
    }

    if (window.Notifications && typeof window.Notifications.issue === 'function') {
      window.Notifications.issue(customerId, category, title, body);
      toast('通知を発行しました。');
    } else {
      toast('通知機能が利用できません。');
    }
    window.App.save();
  }

  // ============================================================
  // メイン render()
  // ============================================================
  AdminView.render = function () {
    var root = document.getElementById('admin-root');
    if (!root) return; // 要素が無ければ何もしない
    if (!window.App || !window.App.state) {
      root.innerHTML = '<div class="adm-empty">データを読み込み中です…</div>';
      return;
    }

    root.innerHTML = '' +
      '<div class="adm-view">' +
        renderKpi() +
        renderCustomers() +
        renderReservations() +
        renderNotifications() +
      '</div>';

    bindEvents(root);
  };

  // ============================================================
  // window へ公開
  // ============================================================
  window.AdminView = AdminView;
})();
