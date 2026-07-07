// 店舗側管理画面の「予約管理」セクションモジュール。
// #adm-reservations に予約リクエスト強調・予約一覧・追加フォームを描画する。
(function () {
  'use strict';

  // 追加フォームの開閉状態（module変数で保持）。
  var formOpen = false;

  // 作業内容の選択肢。
  var WORK_TYPES = ['車検整備', 'オイル交換', '12ヶ月点検', 'タイヤ交換', 'その他'];

  // 顧客IDから顧客名を取得（無ければ空文字）。
  function customerName(customers, id) {
    for (var i = 0; i < customers.length; i++) {
      if (customers[i].id === id) return customers[i].name || '';
    }
    return '';
  }

  // date+time をキーに、重複（バッティング）している予約のIDを集める。
  function findConflicts(reservations) {
    var counts = {};
    var i;
    for (i = 0; i < reservations.length; i++) {
      var key = reservations[i].date + ' ' + reservations[i].time;
      counts[key] = (counts[key] || 0) + 1;
    }
    var conflictIds = {};
    for (i = 0; i < reservations.length; i++) {
      var k = reservations[i].date + ' ' + reservations[i].time;
      if (counts[k] >= 2) conflictIds[reservations[i].id] = true;
    }
    return conflictIds;
  }

  // 予約を日付ごとにグルーピングし、日付昇順・各グループ内は時間昇順で返す。
  function groupByDate(reservations) {
    var map = {};
    var order = [];
    var i;
    for (i = 0; i < reservations.length; i++) {
      var d = reservations[i].date;
      if (!map[d]) { map[d] = []; order.push(d); }
      map[d].push(reservations[i]);
    }
    order.sort(); // "YYYY-MM-DD" は文字列昇順=日付昇順。
    var groups = [];
    for (i = 0; i < order.length; i++) {
      var list = map[order[i]];
      list.sort(function (a, b) {
        return a.time < b.time ? -1 : (a.time > b.time ? 1 : 0);
      });
      groups.push({ date: order[i], items: list });
    }
    return groups;
  }

  // source バッジのHTMLを生成。
  function srcBadge(source) {
    var Utils = window.Utils;
    var mod = source === 'customer' ? '--customer' : '--shop';
    var label = source === 'customer' ? 'お客様' : '店舗';
    return '<span class="adm-src adm-src' + mod + '">' + Utils.escapeHtml(label) + '</span>';
  }

  // status バッジのHTMLを生成。
  function statusBadge(status) {
    var Utils = window.Utils;
    var mod = status === 'requested' ? '--requested' : '--confirmed';
    var label = status === 'requested' ? 'リクエスト' : '確定';
    return '<span class="adm-status adm-status' + mod + '">' + Utils.escapeHtml(label) + '</span>';
  }

  // お客様リクエスト強調ブロックを生成（0件ならnull）。
  function buildRequests(reservations, customers) {
    var Utils = window.Utils;
    var requests = [];
    var i;
    for (i = 0; i < reservations.length; i++) {
      if (reservations[i].source === 'customer' && reservations[i].status === 'requested') {
        requests.push(reservations[i]);
      }
    }
    if (requests.length === 0) return null;

    var wrap = document.createElement('div');
    wrap.className = 'adm-resv-requests';

    var title = document.createElement('div');
    title.className = 'adm-resv-requests__title';
    title.textContent = 'お客様からの予約リクエスト';
    wrap.appendChild(title);

    for (i = 0; i < requests.length; i++) {
      var r = requests[i];
      var name = customerName(customers, r.customerId);
      var card = document.createElement('div');
      card.className = 'resv-card';
      card.innerHTML =
        '<div class="resv-card__body">' +
          '<span class="resv-card__time">' +
            Utils.escapeHtml(Utils.fmtJPShort(r.date)) + ' ' + Utils.escapeHtml(r.time) +
          '</span>' +
          '<span class="resv-card__name">' + Utils.escapeHtml(name) + '</span>' +
          '<span class="resv-card__work">' + Utils.escapeHtml(r.workType || '') + '</span>' +
        '</div>' +
        '<div class="resv-card__action">' +
          '<button type="button" class="adm-btn adm-btn--primary adm-btn--sm" data-confirm="' +
            Utils.escapeHtml(r.id) + '">確定する</button>' +
        '</div>';
      wrap.appendChild(card);
    }

    // 「確定する」で status を confirmed に更新。
    wrap.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-confirm]') : null;
      if (!btn) return;
      confirmRequest(btn.getAttribute('data-confirm'));
    });

    return wrap;
  }

  // リクエストを確定状態へ更新して保存・再描画。
  function confirmRequest(id) {
    var App = window.App;
    var list = (App.state && App.state.reservations) || [];
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) {
        list[i].status = 'confirmed';
        break;
      }
    }
    App.save();
    render();
  }

  // 予約一覧（日付グループ）を生成。
  function buildList(reservations, customers, conflictIds) {
    var Utils = window.Utils;
    var listWrap = document.createElement('div');
    listWrap.className = 'adm-resv-list';

    var groups = groupByDate(reservations);
    for (var g = 0; g < groups.length; g++) {
      var group = groups[g];
      var groupEl = document.createElement('div');
      groupEl.className = 'adm-resv-group';

      // グループ内に重複があるか判定。
      var hasConflict = false;
      var i;
      for (i = 0; i < group.items.length; i++) {
        if (conflictIds[group.items[i].id]) { hasConflict = true; break; }
      }

      var dateHead = document.createElement('div');
      dateHead.className = 'adm-resv-group__date';
      dateHead.innerHTML = Utils.escapeHtml(Utils.fmtJPShort(group.date)) +
        (hasConflict ? '<span class="adm-resv-group__flag">⚠</span>' : '');
      groupEl.appendChild(dateHead);

      for (i = 0; i < group.items.length; i++) {
        var r = group.items[i];
        var name = customerName(customers, r.customerId);
        var isConflict = !!conflictIds[r.id];
        var card = document.createElement('div');
        card.className = 'resv-card' + (isConflict ? ' resv-card--conflict' : '');
        card.innerHTML =
          '<div class="resv-card__body">' +
            '<span class="resv-card__time">' + Utils.escapeHtml(r.time) + '</span>' +
            '<span class="resv-card__name">' + Utils.escapeHtml(name) + '</span>' +
            '<span class="resv-card__work">' + Utils.escapeHtml(r.workType || '') + '</span>' +
            '<span class="resv-card__meta">' + srcBadge(r.source) + statusBadge(r.status) +
              (isConflict ? '<span class="adm-conflict-label">⚠ 時間重複</span>' : '') +
            '</span>' +
          '</div>';
        groupEl.appendChild(card);
      }

      listWrap.appendChild(groupEl);
    }

    return listWrap;
  }

  // 予約追加フォームを生成。
  function buildForm(customers) {
    var Utils = window.Utils;
    var today = Utils.toYMD(Utils.today());

    var form = document.createElement('form');
    form.className = 'adm-form';

    // 顧客セレクトの選択肢。
    var custOptions = '<option value="">顧客を選択</option>';
    for (var i = 0; i < customers.length; i++) {
      custOptions += '<option value="' + Utils.escapeHtml(customers[i].id) + '">' +
        Utils.escapeHtml(customers[i].name || '') + '</option>';
    }

    // 作業内容セレクトの選択肢。
    var workOptions = '';
    for (var w = 0; w < WORK_TYPES.length; w++) {
      workOptions += '<option value="' + Utils.escapeHtml(WORK_TYPES[w]) + '">' +
        Utils.escapeHtml(WORK_TYPES[w]) + '</option>';
    }

    form.innerHTML =
      '<div class="adm-form__grid">' +
        '<div class="adm-field">' +
          '<label class="adm-field__label">顧客</label>' +
          '<select name="customerId" required>' + custOptions + '</select>' +
        '</div>' +
        '<div class="adm-field">' +
          '<label class="adm-field__label">日付</label>' +
          '<input type="date" name="date" min="' + Utils.escapeHtml(today) + '" required>' +
        '</div>' +
        '<div class="adm-field">' +
          '<label class="adm-field__label">時間</label>' +
          '<input type="time" name="time" required>' +
        '</div>' +
        '<div class="adm-field">' +
          '<label class="adm-field__label">作業内容</label>' +
          '<select name="workType" required>' + workOptions + '</select>' +
        '</div>' +
      '</div>' +
      '<div class="adm-form__actions">' +
        '<button type="submit" class="adm-btn adm-btn--primary">追加</button>' +
        '<button type="button" class="adm-btn" data-cancel="1">キャンセル</button>' +
      '</div>';

    // 送信で予約を追加。
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      addReservation(form, customers);
    });

    // キャンセルでフォームを閉じる。
    form.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-cancel')) {
        formOpen = false;
        render();
      }
    });

    return form;
  }

  // フォーム内容から予約を作成・保存・通知。
  function addReservation(form, customers) {
    var Utils = window.Utils;
    var App = window.App;
    var customerId = form.elements.customerId.value;
    var date = form.elements.date.value;
    var time = form.elements.time.value;
    var workType = form.elements.workType.value;
    if (!customerId || !date || !time || !workType) return; // 未入力は無視。

    var reservation = {
      id: Utils.uid('resv_'),
      customerId: customerId,
      date: date,
      time: time,
      workType: workType,
      source: 'shop',
      status: 'confirmed',
      createdAt: new Date().toISOString()
    };

    if (!App.state.reservations) App.state.reservations = [];
    App.state.reservations.push(reservation);

    // 予約確認通知を生成。
    window.Notifications.forReservation(reservation, customerName(customers, customerId));
    App.save();

    formOpen = false;
    render();
  }

  // #adm-reservations に予約管理セクション全体を描画する。
  function render() {
    var mount = document.getElementById('adm-reservations');
    if (!mount) return; // マウント要素が無ければ何もしない。

    var App = window.App;
    var reservations = (App && App.state && App.state.reservations) || [];
    var customers = (App && App.state && App.state.customers) || [];

    var section = document.createElement('div');
    section.className = 'adm-section';

    // ヘッダ（タイトル + 予約追加ボタン）。
    var head = document.createElement('div');
    head.className = 'adm-section__head';
    head.innerHTML =
      '<span class="adm-section__title">予約管理</span>' +
      '<button type="button" class="adm-btn adm-btn--primary" data-add="1">＋ 予約追加</button>';
    head.addEventListener('click', function (e) {
      if (e.target && e.target.getAttribute && e.target.getAttribute('data-add')) {
        formOpen = !formOpen;
        render();
      }
    });
    section.appendChild(head);

    // 追加フォーム（開いている時のみ）。
    if (formOpen) section.appendChild(buildForm(customers));

    // お客様リクエスト強調。
    var requestsBlock = buildRequests(reservations, customers);
    if (requestsBlock) section.appendChild(requestsBlock);

    // 予約一覧 or 空表示。
    if (reservations.length === 0) {
      var empty = document.createElement('div');
      empty.className = 'adm-empty';
      empty.textContent = '予約はまだありません';
      section.appendChild(empty);
    } else {
      var conflictIds = findConflicts(reservations);
      section.appendChild(buildList(reservations, customers, conflictIds));
    }

    mount.innerHTML = '';
    mount.appendChild(section);
  }

  window.AdminReservations = { render: render };
})();
