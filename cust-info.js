/* ============================================================================
 * cust-info.js ─ お客様側スマホUIの「マイカー情報」セクション
 * ----------------------------------------------------------------------------
 * #cust-info に、表示中のお客様(App.state.currentCustomerId)自身の車両情報を描画。
 * 車検満了日と状況(期限切れ/1ヶ月以内/…)を主役に、車種・ナンバー・前回来店等を表示。
 * このアプリの主役=車検リマインドなので、車検の状況が一番目立つ構成にする。
 * 依存: window.Utils / window.App
 * 方針: import/export禁止・IIFEでwindow代入・DOMはrender内のみ・
 *      innerHTMLに出す値はUtils.escapeHtml()・CSSは書かない(クラス名のみ)。
 * ==========================================================================*/

(function () {
  'use strict';

  // 現在表示中のお客様を取得
  function currentCustomer() {
    var customers = (App.state && App.state.customers) || [];
    var id = App.state && App.state.currentCustomerId;
    for (var i = 0; i < customers.length; i++) {
      if (customers[i].id === id) return customers[i];
    }
    return customers[0] || null;
  }

  // 車検までの残り日数を「あと〇日 / 〇日超過 / 本日」で表現
  function shakenCountdown(days) {
    if (isNaN(days)) return '';
    if (days < 0) return Math.abs(days) + '日超過';
    if (days === 0) return '本日が満了日';
    return 'あと' + days + '日';
  }

  // 状況に応じた一言メッセージ（車検リマインドを後押し）
  function shakenMessage(key) {
    switch (key) {
      case 'expired': return '車検の有効期限が過ぎています。お早めにご連絡ください。';
      case 'within1m': return '車検満了が1ヶ月以内です。ご予約をおすすめします。';
      case 'within3m': return '車検満了が近づいています。点検のご予約はお早めに。';
      default: return '次回車検まで余裕があります。日常点検もお気軽にご相談ください。';
    }
  }

  function render() {
    var mount = document.getElementById('cust-info');
    if (!mount) return; // マウント要素が無ければ何もしない

    var Utils = window.Utils;
    var c = currentCustomer();
    if (!c) { mount.innerHTML = ''; return; }

    var esc = function (s) { return Utils.escapeHtml(s == null ? '' : String(s)); };
    var status = Utils.shakenStatus(c.shakenExpiry);
    var days = Utils.daysUntil(c.shakenExpiry);

    mount.innerHTML =
      '<div class="cust-info">' +
        '<div class="cust-info__title">マイカー情報</div>' +

        // 車両の見出し（車種・ナンバー）
        '<div class="cust-info__car">' +
          '<span class="cust-info__car-model">' + esc(c.carModel) + '</span>' +
          '<span class="cust-info__car-plate">' + esc(c.plate) + '</span>' +
        '</div>' +

        // 車検の状況（主役）
        '<div class="cust-info__shaken cust-info__shaken--' + esc(status.key) + '">' +
          '<div class="cust-info__shaken-head">' +
            '<span class="cust-info__shaken-label">車検満了日</span>' +
            '<span class="badge ' + status.className + '">' + esc(status.label) + '</span>' +
          '</div>' +
          '<div class="cust-info__shaken-date">' + esc(Utils.fmtJP(c.shakenExpiry)) + '</div>' +
          '<div class="cust-info__shaken-days">' + esc(shakenCountdown(days)) + '</div>' +
          '<div class="cust-info__shaken-msg">' + esc(shakenMessage(status.key)) + '</div>' +
        '</div>' +

        // その他の情報
        '<div class="cust-info__rows">' +
          row('お名前', c.name) +
          row('ふりがな', c.kana) +
          row('前回ご来店', c.lastVisit ? Utils.fmtJP(c.lastVisit) : '—') +
          row('次回のご案内', c.nextAction || '—') +
        '</div>' +
      '</div>';

    function row(label, value) {
      return '<div class="cust-info__row">' +
          '<span class="cust-info__row-label">' + esc(label) + '</span>' +
          '<span class="cust-info__row-value">' + esc(value) + '</span>' +
        '</div>';
    }
  }

  window.CustomerInfo = { render: render };
})();
