/* ============================================================================
 * customer.js ─ お客様側「スマホ画面ビュー」(window.CustomerView)
 * ----------------------------------------------------------------------------
 * 役割:
 *   車を預けるお客様がスマホで見る想定の画面を描画する。
 *   将来 LINE で届くイメージを伝えるため、スマホモックフレーム内に
 *   LINEトーク風UIで通知を時系列表示し、予約リクエストフォームを置く。
 *
 * 最重要:
 *   店舗側とデータで繋がっていること。お客様が送った予約リクエストは
 *   App.state.reservations に status:"requested" / source:"customer" で入り、
 *   Notifications.forReservation でお客様トークにも通知が届く（=双方に反映）。
 *
 * 依存(実行時に存在する前提): window.Utils / window.App / window.Notifications / window.Channel
 * 方針: ビルド無し・import/export禁止・IIFEで window.CustomerView へ代入・素のDOMのみ。
 *      render() は毎回 innerHTML 再構築＋イベント付与。状態変更後は必ず App.save()。
 * ==========================================================================*/

(function () {
  'use strict';

  // 予約内容の選択肢（value と表示ラベル）
  var WORK_TYPES = ['車検', '点検', 'オイル交換', 'タイヤ交換', '不具合の相談', 'その他'];

  // 希望時間帯の選択肢
  var TIME_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

  // category -> トーク吹き出しの見出し/アイコン
  var CATEGORY_META = {
    shaken:      { icon: '🚗', label: '車検リマインド' },
    reservation: { icon: '📅', label: '予約確認' },
    repair:      { icon: '🔧', label: '修理完了' },
    tire:        { icon: '🛞', label: 'タイヤ交換' },
    other:       { icon: '📨', label: 'お知らせ' }
  };

  var esc = function (s) { return Utils.escapeHtml(s); };

  // ISO日時 -> "HH:MM"（トークの時刻表示用）
  function fmtClock(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    var h = d.getHours();
    var m = d.getMinutes();
    return (h < 10 ? '0' + h : '' + h) + ':' + (m < 10 ? '0' + m : '' + m);
  }

  // ISO日時 -> "YYYY-MM-DD"（日付セパレータ判定用）
  function ymdOfIso(iso) {
    var d = iso ? new Date(iso) : null;
    if (!d || isNaN(d.getTime())) return '';
    return Utils.toYMD(new Date(d.getFullYear(), d.getMonth(), d.getDate()));
  }

  // 現在スマホを見ているお客様を取得（未設定なら先頭）
  function currentCustomer() {
    var customers = (App.state && App.state.customers) || [];
    var id = App.state && App.state.currentCustomerId;
    var found = null;
    customers.forEach(function (c) { if (c.id === id) found = c; });
    return found || customers[0] || null;
  }

  var CustomerView = {};

  /**
   * render: customer-root の中身を全描画する。要素が無ければ何もしない。
   */
  CustomerView.render = function () {
    var root = document.getElementById('customer-root');
    if (!root) return;

    var customer = currentCustomer();

    // スマホモックフレーム構築（CSS担当が枠を描く前提でマークアップのみ出す）
    var html = '';
    html += '<div class="phone">';
    html += '<div class="phone__notch"></div>';
    html += '<div class="phone__screen">';
    html += buildCustSwitch(customer);   // (1) お客様切替
    html += buildTalkHeader();           // (2) LINE風トークヘッダー
    html += buildTalk(customer);         // (3) トーク本文
    html += buildReqForm(customer);      // (4) 予約リクエストフォーム
    html += '</div>'; // phone__screen
    html += '</div>'; // phone

    root.innerHTML = html;

    bindEvents(root, customer);
  };

  /* ---------- (1) お客様切替（デモ用） ---------- */
  function buildCustSwitch(customer) {
    var customers = (App.state && App.state.customers) || [];
    var curId = customer ? customer.id : '';
    var opts = customers.map(function (c) {
      var sel = c.id === curId ? ' selected' : '';
      return '<option value="' + esc(c.id) + '"' + sel + '>' +
        esc(c.name) + '（' + esc(c.carModel) + '）</option>';
    }).join('');

    var h = '';
    h += '<div class="cust-switch">';
    h += '<label class="cust-switch__label" for="cust-switch-select">表示中のお客様（デモ切替）</label>';
    h += '<select class="cust-switch__select" id="cust-switch-select">' + opts + '</select>';
    h += '</div>';
    return h;
  }

  /* ---------- (2) LINE風トークヘッダー ---------- */
  function buildTalkHeader() {
    var shopName = (App.state && App.state.shop && App.state.shop.name) || 'サカイオートサービス';
    var h = '';
    h += '<div class="talk__header">';
    h += '<div class="talk__avatar" aria-hidden="true"></div>';
    h += '<div class="talk__headtext">';
    h += '<div class="talk__shopname">' + esc(shopName) + '</div>';
    h += '<div class="talk__official">公式アカウント</div>';
    h += '</div>';
    h += '</div>';
    return h;
  }

  /* ---------- (3) トーク本文 ---------- */
  function buildTalk(customer) {
    var h = '<div class="talk">';

    if (!customer) {
      h += '<div class="talk__empty">お客様が登録されていません</div>';
      return h + '</div>';
    }

    // listForCustomer は新しい順 → LINEらしく古い→新しいの時系列に反転
    var list = Notifications.listForCustomer(customer.id).slice().reverse();

    if (list.length === 0) {
      h += '<div class="talk__empty">まだ通知はありません</div>';
      return h + '</div>';
    }

    var lastDay = '';
    list.forEach(function (n) {
      // 日付が変わったら日付セパレータを挿入
      var day = ymdOfIso(n.createdAt);
      if (day && day !== lastDay) {
        h += '<div class="talk__daysep">' + esc(Utils.fmtJPShort(day)) + '</div>';
        lastDay = day;
      }
      h += buildBubble(n);
    });

    return h + '</div>';
  }

  // 1件の受信吹き出し（相手＝店舗からの発言・左寄せ）
  function buildBubble(n) {
    var meta = CATEGORY_META[n.category] || CATEGORY_META.other;
    var time = fmtClock(n.createdAt);

    var h = '';
    h += '<div class="talk__msg">';
    h += '<div class="talk__bubble talk__bubble--in">';
    h += '<div class="talk__cat">' + meta.icon + ' ' + esc(meta.label) + '</div>';
    h += '<div class="talk__title">' + esc(n.title) + '</div>';
    h += '<div class="talk__body">' + esc(n.body) + '</div>';
    h += '</div>';
    // 時刻（吹き出しの外・小さく）
    if (time) h += '<div class="talk__time">' + esc(time) + '</div>';
    // 「実際の運用ではLINEに届く」補足キャプション
    h += '<div class="talk__linenote">※' + esc(Channel.channelNote()) + '</div>';
    h += '</div>';
    return h;
  }

  /* ---------- (4) 予約リクエストフォーム ---------- */
  function buildReqForm(customer) {
    var minYmd = Utils.toYMD(Utils.today());

    var timeOpts = TIME_SLOTS.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    }).join('');

    var workOpts = WORK_TYPES.map(function (w) {
      return '<option value="' + esc(w) + '">' + esc(w) + '</option>';
    }).join('');

    var disabled = customer ? '' : ' disabled';

    var h = '';
    h += '<form class="req-form" id="req-form"' + (customer ? '' : ' aria-disabled="true"') + '>';
    h += '<div class="req-form__title">予約をリクエスト</div>';
    h += '<div class="req-form__hint">ご希望を送信すると、店舗が内容を確認して確定のご連絡をします。</div>';

    // 希望日
    h += '<label class="req-form__label" for="req-date">希望日</label>';
    h += '<input class="req-form__input" type="date" id="req-date" min="' + esc(minYmd) + '" value="' + esc(minYmd) + '"' + disabled + '>';

    // 希望時間帯
    h += '<label class="req-form__label" for="req-time">希望時間帯</label>';
    h += '<select class="req-form__input" id="req-time"' + disabled + '>' + timeOpts + '</select>';

    // 内容
    h += '<label class="req-form__label" for="req-work">内容</label>';
    h += '<select class="req-form__input" id="req-work"' + disabled + '>' + workOpts + '</select>';

    // 自由記入（任意）
    h += '<label class="req-form__label" for="req-note">ご要望（任意）</label>';
    h += '<textarea class="req-form__input req-form__textarea" id="req-note" rows="2" placeholder="症状やご希望があればご記入ください"' + disabled + '></textarea>';

    // 送信ボタン
    h += '<button class="req-form__submit" type="submit"' + disabled + '>この内容で予約をリクエスト</button>';

    // 送信後の確認表示エリア（初期は空）
    h += '<div class="req-form__done" id="req-done" hidden></div>';

    h += '</form>';
    return h;
  }

  /* ---------- イベント付与 ---------- */
  function bindEvents(root, customer) {
    // (1) お客様切替
    var sel = root.querySelector('#cust-switch-select');
    if (sel) {
      sel.addEventListener('change', function () {
        App.state.currentCustomerId = sel.value;
        App.save(); // 保存＋両ビュー再描画（再描画で本ビューも作り直される）
      });
    }

    // (4) 予約リクエスト送信
    var form = root.querySelector('#req-form');
    if (form && customer) {
      form.addEventListener('submit', function (e) {
        e.preventDefault();
        submitRequest(root, customer);
      });
    }
  }

  /* ---------- 予約リクエスト送信処理 ---------- */
  function submitRequest(root, customer) {
    var dateEl = root.querySelector('#req-date');
    var timeEl = root.querySelector('#req-time');
    var workEl = root.querySelector('#req-work');
    var noteEl = root.querySelector('#req-note');

    var date = dateEl ? dateEl.value : '';
    var time = timeEl ? timeEl.value : '';
    var work = workEl ? workEl.value : '';
    var note = noteEl ? (noteEl.value || '').trim() : '';

    if (!date || !time || !work) return; // 必須未入力なら何もしない

    // 自由記入があれば workType に付記する
    var workType = note ? (work + '（' + note + '）') : work;

    // 予約を作成（店舗側には status:"requested" / source:"customer" として現れる）
    var reservation = {
      id: Utils.uid('resv_'),
      customerId: customer.id,
      date: date,
      time: time,
      workType: workType,
      source: 'customer',
      status: 'requested',
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(App.state.reservations)) {
      App.state.reservations = [];
    }
    App.state.reservations.push(reservation);

    // お客様トークにも受付通知が届くようにする（=店舗にもお客様にも反映）
    Notifications.forReservation(reservation, customer.name);

    // 送信内容を再描画後に確認表示するため控えておく
    CustomerView._lastRequest = {
      customerId: customer.id,
      date: date,
      time: time
    };

    // 保存＆両ビュー再描画（forReservation 内でも save されるが明示的に呼ぶ）
    App.save();

    // App.save() による再描画でフォームはクリア済み。確認メッセージを差し込む。
    showRequestDone();
  }

  // 再描画後のフォームに「送信しました」確認を表示する
  function showRequestDone() {
    var req = CustomerView._lastRequest;
    if (!req) return;
    var cur = currentCustomer();
    if (!cur || cur.id !== req.customerId) { CustomerView._lastRequest = null; return; }

    var done = document.getElementById('req-done');
    if (done) {
      done.hidden = false;
      done.textContent =
        'リクエストを送信しました（' + Utils.fmtJPShort(req.date) + ' ' + req.time +
        '）。店舗からの確定連絡をお待ちください。';
    }
    CustomerView._lastRequest = null;
  }

  window.CustomerView = CustomerView;
})();
