/* 店舗側管理画面「通知センター」モジュール
   window.AdminNotifications.render() で #adm-notifications に描画する。
   依存: window.Utils / window.App / window.Notifications / window.Channel / window.AdminUI */
(function () {
  'use strict';

  // 手動発行フォームの種類選択肢（value=category, label=表示名）
  var CATEGORY_OPTIONS = [
    { value: 'repair', label: '修理完了のお知らせ' },
    { value: 'tire', label: 'タイヤ交換時期のお知らせ(季節)' },
    { value: 'other', label: 'その他' }
  ];

  // 種類選択時にプリセットする定型文（repair / tire のみ）
  var PRESETS = {
    repair: {
      title: '修理完了のお知らせ',
      body: 'ご依頼のお車の整備が完了しました。ご来店をお待ちしております。'
    },
    tire: {
      title: 'タイヤ交換時期のお知らせ',
      body: '季節の変わり目です。タイヤ交換・点検のご案内です。'
    }
  };

  // カテゴリ→一覧表示用ラベル（自動生成分も含む）
  var CATEGORY_LABELS = {
    shaken: '車検リマインド',
    reservation: '予約',
    repair: '修理完了',
    tire: 'タイヤ交換',
    other: 'その他'
  };

  // 顧客IDから表示名を引く（見つからなければ「不明な顧客」）
  function customerNameById(id) {
    var customers = (window.App && App.state && App.state.customers) || [];
    for (var i = 0; i < customers.length; i++) {
      if (customers[i].id === id) return customers[i].name || '';
    }
    return '不明な顧客';
  }

  // トースト表示: body直挿し→showクラス付与→数秒後にフェード除去。
  // 再描画に巻き込まれないよう document.body へ直接append・タイマーで自動消去。
  function showToast(message) {
    var toast = document.createElement('div');
    toast.className = 'adm-toast';
    toast.textContent = message; // textContentなのでエスケープ不要
    document.body.appendChild(toast);

    // 次フレームで表示クラスを付与（トランジション発火のため）
    setTimeout(function () {
      toast.classList.add('adm-toast--show');
    }, 10);

    // 数秒後にフェード除去
    setTimeout(function () {
      toast.classList.remove('adm-toast--show');
      // フェード後にDOMから削除
      setTimeout(function () {
        if (toast.parentNode) toast.parentNode.removeChild(toast);
      }, 400);
    }, 2600);
  }

  // 車検リマインド一括生成ボタンのHTML
  function bulkButtonHtml() {
    return '' +
      '<button type="button" class="adm-btn adm-btn--primary" data-action="bulk-shaken">' +
        '🔔 車検リマインドを一括生成' +
      '</button>';
  }

  // 手動発行フォームのHTML
  function formHtml() {
    var customers = (window.App && App.state && App.state.customers) || [];

    // 宛先顧客の選択肢
    var custOpts = '<option value="">選択してください</option>';
    for (var i = 0; i < customers.length; i++) {
      var c = customers[i];
      custOpts +=
        '<option value="' + Utils.escapeHtml(c.id) + '">' +
          Utils.escapeHtml(c.name || '') +
        '</option>';
    }

    // 種類の選択肢
    var catOpts = '';
    for (var j = 0; j < CATEGORY_OPTIONS.length; j++) {
      var o = CATEGORY_OPTIONS[j];
      catOpts +=
        '<option value="' + Utils.escapeHtml(o.value) + '">' +
          Utils.escapeHtml(o.label) +
        '</option>';
    }

    return '' +
      '<div class="adm-notif-form">' +
        '<div class="adm-form__grid">' +
          '<div class="adm-field">' +
            '<label class="adm-field__label">宛先顧客</label>' +
            '<select data-field="customer">' + custOpts + '</select>' +
          '</div>' +
          '<div class="adm-field">' +
            '<label class="adm-field__label">種類</label>' +
            '<select data-field="category">' + catOpts + '</select>' +
          '</div>' +
          '<div class="adm-field">' +
            '<label class="adm-field__label">件名</label>' +
            '<input type="text" data-field="title" placeholder="件名を入力">' +
          '</div>' +
          '<div class="adm-field">' +
            '<label class="adm-field__label">本文</label>' +
            '<textarea data-field="body" rows="3" placeholder="本文を入力"></textarea>' +
          '</div>' +
        '</div>' +
        '<button type="button" class="adm-btn adm-btn--primary" data-action="issue">発行</button>' +
      '</div>';
  }

  // 発行済み通知1件のHTML
  function notifItemHtml(n) {
    var toName = customerNameById(n.customerId);
    var catLabel = CATEGORY_LABELS[n.category] || n.category || '';
    var timeJP = Utils.fmtJP(n.createdAt);

    return '' +
      '<div class="notif">' +
        '<div class="notif__head">' +
          '<span class="notif__to">' + Utils.escapeHtml(toName) + '様</span>' +
          '<span class="notif__cat">' + Utils.escapeHtml(catLabel) + '</span>' +
          '<span class="notif__time">' + Utils.escapeHtml(timeJP) + '</span>' +
        '</div>' +
        '<div class="notif__title">' + Utils.escapeHtml(n.title || '') + '</div>' +
        '<div class="notif__body">' + Utils.escapeHtml(n.body || '') + '</div>' +
        '<div class="notif__linenote">' + Utils.escapeHtml(Channel.channelNote()) + '</div>' +
      '</div>';
  }

  // 発行済み通知一覧のHTML（新しい順・0件は空表示）
  function listHtml() {
    var items = (window.Notifications && Notifications.all()) || [];

    var inner;
    if (items.length === 0) {
      inner = '<div class="adm-empty">発行済みの通知はありません。</div>';
    } else {
      inner = '';
      for (var i = 0; i < items.length; i++) {
        inner += notifItemHtml(items[i]);
      }
    }

    return '' +
      '<div class="adm-notif-list">' +
        '<div class="adm-notif-list__title">発行済みの通知</div>' +
        inner +
      '</div>';
  }

  // 描画本体
  function render() {
    var mount = document.getElementById('adm-notifications');
    if (!mount) return; // マウント要素が無ければ何もしない

    mount.innerHTML =
      '<section class="adm-section">' +
        '<div class="adm-section__head">' +
          '<h2 class="adm-section__title">通知センター</h2>' +
          bulkButtonHtml() +
        '</div>' +
        formHtml() +
        listHtml() +
      '</section>';

    bindEvents(mount);
  }

  // イベント付与（一括生成 / 種類プリセット / 発行）
  function bindEvents(mount) {
    // 🔔 車検リマインド一括生成
    var bulkBtn = mount.querySelector('[data-action="bulk-shaken"]');
    if (bulkBtn) {
      bulkBtn.addEventListener('click', function () {
        var result = Notifications.generateShakenReminders() || { created: 0 };
        var n = result.created || 0;
        if (n === 0) {
          showToast('対象の顧客はいません');
        } else {
          showToast(n + '件の車検リマインドを生成しました');
        }
        // 生成時は App.save() 側で再描画されるため一覧は自動更新される。
      });
    }

    // 種類select変更で定型文を件名/本文へプリセット
    var catSel = mount.querySelector('[data-field="category"]');
    if (catSel) {
      catSel.addEventListener('change', function () {
        var preset = PRESETS[catSel.value];
        if (!preset) return; // other等はプリセット無し
        var titleEl = mount.querySelector('[data-field="title"]');
        var bodyEl = mount.querySelector('[data-field="body"]');
        if (titleEl) titleEl.value = preset.title;
        if (bodyEl) bodyEl.value = preset.body;
      });
    }

    // 発行ボタン
    var issueBtn = mount.querySelector('[data-action="issue"]');
    if (issueBtn) {
      issueBtn.addEventListener('click', function () {
        var custEl = mount.querySelector('[data-field="customer"]');
        var catEl = mount.querySelector('[data-field="category"]');
        var titleEl = mount.querySelector('[data-field="title"]');
        var bodyEl = mount.querySelector('[data-field="body"]');

        var customerId = custEl ? custEl.value : '';
        var category = catEl ? catEl.value : 'other';
        var title = titleEl ? titleEl.value.trim() : '';
        var body = bodyEl ? bodyEl.value : '';

        // 件名か宛先が空なら発行しない
        if (!title || !customerId) return;

        // 発行（内部でApp.saveされ再描画される）
        Notifications.issue(customerId, category, title, body);
      });
    }
  }

  window.AdminNotifications = { render: render };
})();
