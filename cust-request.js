/* ============================================================================
 * cust-request.js ─ お客様側「予約リクエストフォーム」(window.CustomerRequest)
 * ----------------------------------------------------------------------------
 * 役割:
 *   #cust-request にお客様向けの予約リクエストフォームを描画する。
 *   ★予約が既に埋まっている時間枠は選択肢に出さない（日・時間の両方でフィルタ）。
 *   満席（14日先まで空きゼロ）の場合はフォームの代わりに案内文を出す。
 *
 * 依存(実行時に存在する前提): window.Utils / window.App / window.Notifications
 * 方針: ビルド無し・import/export禁止・IIFEで window.CustomerRequest へ代入・素のDOMのみ。
 *      DOM操作は render 内のみ。innerHTML に出す値は必ず Utils.escapeHtml()。
 *      UIのみの更新（日変更）では App.save() を呼ばず、当セクションだけ再構築する。
 * ==========================================================================*/

(function () {
  'use strict';

  // 予約可能な時間枠（この中から埋まっている枠を除いて提示する）
  var TIME_SLOTS = ['09:00', '10:00', '11:00', '13:00', '14:00', '15:00', '16:00'];

  // 内容（作業種別）の選択肢
  var WORK_TYPES = ['車検', '点検', 'オイル交換', 'タイヤ交換', '不具合の相談', 'その他'];

  // 希望日を出す範囲（今日から何日先まで）
  var DAYS_AHEAD = 14;

  // module変数: 現在選択中の希望日（YYYY-MM-DD）。日select変更で更新する。
  var selectedDate = null;
  // module変数: 送信完了を覚えるフラグ（App.save の再描画後も完了表示を出すため）
  var justDone = false;

  var esc = function (s) { return Utils.escapeHtml(s); };

  /* ---------- 空き枠の算出 ---------- */

  // 指定日(YYYY-MM-DD)の「埋まっている時間」集合を返す。
  // status は問わない（requested/confirmed/completed すべて“埋まり”扱い）。
  function bookedTimes(ymd) {
    var reservations = (App.state && App.state.reservations) || [];
    var set = {};
    reservations.forEach(function (r) {
      if (r && r.date === ymd && r.time) set[r.time] = true;
    });
    return set;
  }

  // 指定日(YYYY-MM-DD)の「空き時間」= TIME_SLOTS から埋まりを除いたもの。
  function freeTimes(ymd) {
    var booked = bookedTimes(ymd);
    return TIME_SLOTS.filter(function (t) { return !booked[t]; });
  }

  // 今日から DAYS_AHEAD 先までのうち「空き時間が1つ以上ある日」の YMD 配列。
  function availableDays() {
    var base = Utils.today();
    var days = [];
    for (var i = 0; i <= DAYS_AHEAD; i++) {
      var ymd = Utils.toYMD(Utils.addDays(base, i));
      if (freeTimes(ymd).length > 0) days.push(ymd);
    }
    return days;
  }

  /* ---------- 現在のお客様（顧客名の取得用） ---------- */
  function currentCustomer() {
    var customers = (App.state && App.state.customers) || [];
    var id = App.state && App.state.currentCustomerId;
    var found = null;
    customers.forEach(function (c) { if (c.id === id) found = c; });
    return found || customers[0] || null;
  }

  var CustomerRequest = {};

  /**
   * render: #cust-request の中身を全描画する。要素が無ければ何もしない。
   */
  CustomerRequest.render = function () {
    var root = document.getElementById('cust-request');
    if (!root) return;

    var days = availableDays();

    // 選択中の希望日を確定する。
    // ・未選択、または選択日が既に空き無し（満席化）なら先頭の空きある日にリセット。
    if (!selectedDate || days.indexOf(selectedDate) === -1) {
      selectedDate = days.length > 0 ? days[0] : null;
    }

    root.innerHTML = buildForm(days);

    bindEvents(root, days);
  };

  /* ---------- フォーム構築 ---------- */
  function buildForm(days) {
    var h = '';
    h += '<div class="req-form">';
    h += '<div class="req-form__title">予約をリクエスト</div>';
    h += '<div class="req-form__hint">ご希望を送信すると、店舗が内容を確認して確定のご連絡をします。</div>';

    // 送信完了メッセージ（覚えている場合のみ）
    if (justDone) {
      h += '<div class="req-form__done">リクエストを送信しました。店舗からの確定連絡をお待ちください。</div>';
      // 続けて予約する導線（任意）
      h += '<button class="req-form__submit" type="button" id="req-again">続けて予約する</button>';
      h += '</div>';
      return h;
    }

    // ★満席: 空きのある日が1つも無ければフォームは出さず案内のみ
    if (days.length === 0) {
      h += '<div class="req-form__full">ただいまご予約がいっぱいです。お手数ですがお電話でお問い合わせください。</div>';
      h += '</div>';
      return h;
    }

    // 希望日（空きある日だけ / native date ではなく select）
    h += '<label class="req-form__label" for="req-date">希望日</label>';
    h += '<select class="req-form__input" id="req-date">';
    h += days.map(function (d) {
      var sel = d === selectedDate ? ' selected' : '';
      return '<option value="' + esc(d) + '"' + sel + '>' + esc(Utils.fmtJPShort(d)) + '</option>';
    }).join('');
    h += '</select>';

    // 希望時間帯（選択中の希望日の空き時間だけ）
    h += '<label class="req-form__label" for="req-time">希望時間帯</label>';
    h += '<select class="req-form__input" id="req-time">' + buildTimeOptions() + '</select>';

    // 内容
    h += '<label class="req-form__label" for="req-work">内容</label>';
    h += '<select class="req-form__input" id="req-work">';
    h += WORK_TYPES.map(function (w) {
      return '<option value="' + esc(w) + '">' + esc(w) + '</option>';
    }).join('');
    h += '</select>';

    // 自由記入（任意）
    h += '<label class="req-form__label" for="req-note">ご要望（任意）</label>';
    h += '<textarea class="req-form__textarea" id="req-note" rows="2" placeholder="症状やご希望があればご記入ください"></textarea>';

    // 送信ボタン
    h += '<button class="req-form__submit" type="button" id="req-submit">この内容で予約をリクエスト</button>';

    h += '</div>';
    return h;
  }

  // 選択中の希望日の空き時間から time の option 群を組み立てる。
  function buildTimeOptions() {
    var times = selectedDate ? freeTimes(selectedDate) : [];
    return times.map(function (t) {
      return '<option value="' + esc(t) + '">' + esc(t) + '</option>';
    }).join('');
  }

  /* ---------- イベント付与 ---------- */
  function bindEvents(root, days) {
    // 「続けて予約する」→ 完了表示を解除して再描画（UIのみ）
    var again = root.querySelector('#req-again');
    if (again) {
      again.addEventListener('click', function () {
        justDone = false;
        CustomerRequest.render();
      });
      return; // 完了表示中はフォーム要素が無いのでここで終了
    }

    if (days.length === 0) return; // 満席時はフォーム無し

    // 希望日の変更 → 選択日を保持し、時間帯 select を空き時間へ再構築（App.saveは呼ばない）
    var dateEl = root.querySelector('#req-date');
    if (dateEl) {
      dateEl.addEventListener('change', function () {
        selectedDate = dateEl.value;
        var timeEl = root.querySelector('#req-time');
        if (timeEl) timeEl.innerHTML = buildTimeOptions();
      });
    }

    // 送信
    var submit = root.querySelector('#req-submit');
    if (submit) {
      submit.addEventListener('click', function () {
        submitRequest(root);
      });
    }
  }

  /* ---------- 送信処理 ---------- */
  function submitRequest(root) {
    var timeEl = root.querySelector('#req-time');
    var workEl = root.querySelector('#req-work');
    var noteEl = root.querySelector('#req-note');

    var date = selectedDate;
    var time = timeEl ? timeEl.value : '';
    var work = workEl ? workEl.value : '';
    var note = noteEl ? (noteEl.value || '').trim() : '';

    // 日・時間が無い状態は起きない想定だが、念のためガード
    if (!date || !time || !work) return;

    var customer = currentCustomer();
    if (!customer) return;

    // 自由記入があれば内容に付記
    var workType = note ? (work + '（＋記入）') : work;

    var reservation = {
      id: Utils.uid('resv_'),
      customerId: App.state.currentCustomerId,
      date: date,
      time: time,
      workType: workType,
      source: 'customer',
      status: 'requested',
      createdAt: new Date().toISOString()
    };

    if (!Array.isArray(App.state.reservations)) App.state.reservations = [];
    App.state.reservations.push(reservation);

    // お客様トークにも受付通知を届ける
    Notifications.forReservation(reservation, customer.name);

    // 送信完了を覚える（App.save の再描画後も完了表示を出すため）
    justDone = true;
    // 次回のために選択日はリセット（再描画時に空きある日へ再設定される）
    selectedDate = null;

    // 保存＆全再描画（forReservation 内でも save されるが明示的に呼ぶ）
    App.save();
  }

  window.CustomerRequest = CustomerRequest;
})();
