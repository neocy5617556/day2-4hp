// お客様側スマホ画面「会社概要」ページ
// 依存: window.Utils.escapeHtml / window.App.state.shop
// import/export不使用・IIFEでwindowに公開・DOM操作はrender内のみ
(function () {
  'use strict';

  var CustomerAbout = {};

  // 電話番号をtel:リンク用にハイフン等を除去（数字と+のみ残す）
  function toTelHref(tel) {
    return String(tel || '').replace(/[^0-9+]/g, '');
  }

  // 会社概要ページを描画
  CustomerAbout.render = function () {
    // マウント要素が無ければ何もしない
    var mount = document.getElementById('cust-about');
    if (!mount) return;

    var e = window.Utils.escapeHtml;
    var shop = (window.App && window.App.state && window.App.state.shop) || {};

    // shopの値（無ければ整備工場らしい既定値で補完）
    var name = shop.name || 'サカイオートサービス';
    var address = shop.address || '大阪府堺市';
    var tel = shop.tel || '072-000-0000';

    // 情報テーブルの各行データ
    var rows = [
      { label: '店名', value: name },
      { label: '所在地', value: address },
      { label: '電話', value: tel },
      { label: '営業時間', value: '平日 9:00–18:00 / 土 9:00–17:00' },
      { label: '定休日', value: '日曜・祝日' },
      { label: '事業内容', value: '車検・一般整備・板金塗装・タイヤ／オイル交換・中古車販売' },
      { label: '取扱', value: '国産全メーカー対応' },
      { label: '認証', value: '近畿運輸局 認証工場' }
    ];

    // 提供サービス一覧
    var services = [
      '車検・法定点検',
      'オイル・タイヤ交換',
      '板金・修理',
      '車検リマインド通知'
    ];

    // テーブル行のHTMLを生成
    var rowsHtml = rows.map(function (r) {
      return '' +
        '<div class="cust-about__row">' +
          '<div class="cust-about__label">' + e(r.label) + '</div>' +
          '<div class="cust-about__value">' + e(r.value) + '</div>' +
        '</div>';
    }).join('');

    // サービス一覧のHTMLを生成
    var servicesHtml = services.map(function (s) {
      return '<div class="cust-about__service">' + e(s) + '</div>';
    }).join('');

    // 全体を描画（誇大表現を避けた堅実な文面）
    mount.innerHTML = '' +
      '<div class="cust-about">' +
        '<h2 class="cust-about__title">会社概要</h2>' +
        '<p class="cust-about__lead">' +
          '地域に根ざした車検・整備の工場として、' +
          'お客様が安心して長く乗れるカーライフを支えます。' +
        '</p>' +
        '<div class="cust-about__table">' + rowsHtml + '</div>' +
        '<div class="cust-about__services">' + servicesHtml + '</div>' +
        '<div class="cust-about__cta">' +
          '<a class="cust-about__cta-button" href="tel:' + e(toTelHref(tel)) + '">' +
            'お電話でのお問い合わせ ' + e(tel) +
          '</a>' +
        '</div>' +
      '</div>';
  };

  // グローバル公開
  window.CustomerAbout = CustomerAbout;
})();
