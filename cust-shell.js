/* ============================================================================
 * cust-shell.js ─ お客様側スマホUIの「骨格シェル」
 * ----------------------------------------------------------------------------
 * 役割:
 *   #customer-root にスマホモックフレーム(.phone)を描画し、
 *   緑の公式アカウント帯(cust-appbar)・ハンバーガーメニュー・
 *   お客様切替select・各セクション(トーク/予約/会社概要)の器を用意する。
 *   実データは各セクションモジュール(CustomerTalk/Request/About)が描画する。
 *
 * 公開:
 *   window.CustomerView.render() … 骨格を描画し各セクションモジュールを呼ぶ
 *   window.CustomerUI.goSection(name) … 指定セクションへスムーススクロール
 *
 * 依存(実行時に存在する前提): window.Utils / window.App
 *   任意: window.CustomerTalk / window.CustomerRequest / window.CustomerAbout
 * 方針: ビルド無し・import/export禁止・IIFEでwindowへ代入・素のDOMのみ・
 *      innerHTMLに出す値はUtils.escapeHtml()・CSSは書かない(クラス名のみ)。
 * ==========================================================================*/

(function () {
  'use strict';

  var esc = function (s) { return Utils.escapeHtml(s == null ? '' : String(s)); };

  // ハンバーガーメニューを閉じる（.cust-menu--open を外す）
  function closeMenu() {
    var menu = document.querySelector('#customer-root .cust-menu');
    if (menu) menu.classList.remove('cust-menu--open');
  }

  // ハンバーガーメニューの開閉トグル
  function toggleMenu() {
    var menu = document.querySelector('#customer-root .cust-menu');
    if (menu) menu.classList.toggle('cust-menu--open');
  }

  // お客様切替selectの option 群を組み立て（label = 名前 ＋ 車種があれば括弧書き）
  function buildCustomerOptions() {
    var customers = (App.state && App.state.customers) || [];
    var current = App.state && App.state.currentCustomerId;
    return customers.map(function (c) {
      var label = c.name || '(名称未設定)';
      if (c.carModel) label += '（' + c.carModel + '）';
      var sel = (c.id === current) ? ' selected' : '';
      return '<option value="' + esc(c.id) + '"' + sel + '>' + esc(label) + '</option>';
    }).join('');
  }

  // 骨格HTMLを生成
  function buildHtml() {
    return '' +
      '<div class="phone">' +
        '<div class="phone__notch"></div>' +
        '<div class="phone__screen cust-scroll">' +
          '<div class="cust-appbar">' +
            '<div class="cust-appbar__avatar"></div>' +
            '<div class="cust-appbar__brand">' +
              '<div class="cust-appbar__name">サカイオートサービス</div>' +
              '<div class="cust-appbar__official">公式アカウント</div>' +
            '</div>' +
            '<button class="cust-appbar__menu-btn" aria-label="メニュー"><span class="cust-hamburger"></span></button>' +
          '</div>' +
          '<div class="cust-menu">' +
            '<div class="cust-menu__item" data-goto="talk">トーク</div>' +
            '<div class="cust-menu__item" data-goto="request">予約する</div>' +
            '<div class="cust-menu__item" data-goto="about">会社概要</div>' +
          '</div>' +
          '<div class="cust-switch">' +
            '<span class="cust-switch__label">表示中のお客様（デモ切替）</span>' +
            '<select class="cust-switch__select">' + buildCustomerOptions() + '</select>' +
          '</div>' +
          '<section id="cust-talk" class="cust-section"></section>' +
          '<section id="cust-request" class="cust-section"></section>' +
          '<section id="cust-about" class="cust-section"></section>' +
        '</div>' +
      '</div>';
  }

  // 骨格へイベントを付与
  function bindEvents(root) {
    // お客様切替: 変更で currentCustomerId を更新し App.save()
    var select = root.querySelector('.cust-switch__select');
    if (select) {
      select.addEventListener('change', function () {
        App.state.currentCustomerId = select.value;
        App.save();
      });
    }

    // ハンバーガーボタン: クリックでメニュー開閉
    var menuBtn = root.querySelector('.cust-appbar__menu-btn');
    if (menuBtn) {
      menuBtn.addEventListener('click', function (e) {
        e.stopPropagation(); // スクリーンクリックの外側閉じと競合させない
        toggleMenu();
      });
    }

    // メニュー項目: クリックで該当セクションへスクロール＋メニューを閉じる
    var items = root.querySelectorAll('.cust-menu__item');
    Array.prototype.forEach.call(items, function (item) {
      item.addEventListener('click', function (e) {
        e.stopPropagation();
        window.CustomerUI.goSection(item.getAttribute('data-goto'));
      });
    });

    // メニュー外(スクリーン)クリックでも閉じる
    var screen = root.querySelector('.phone__screen');
    if (screen) {
      screen.addEventListener('click', function () { closeMenu(); });
    }
  }

  // 各セクションモジュールがあれば描画を委譲（存在チェック）
  function renderSections() {
    if (window.CustomerTalk && typeof CustomerTalk.render === 'function') CustomerTalk.render();
    if (window.CustomerRequest && typeof CustomerRequest.render === 'function') CustomerRequest.render();
    if (window.CustomerAbout && typeof CustomerAbout.render === 'function') CustomerAbout.render();
  }

  // ── 公開: セクションナビ ──────────────────────────────────
  window.CustomerUI = {
    goSection: function (name) {
      var el = document.getElementById('cust-' + name);
      if (el && el.scrollIntoView) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      closeMenu();
    }
  };

  // ── 公開: シェルビュー ────────────────────────────────────
  window.CustomerView = {
    render: function () {
      var root = document.getElementById('customer-root');
      if (!root) return; // マウント要素が無ければ何もしない

      root.innerHTML = buildHtml();
      bindEvents(root);
      renderSections();
    }
  };
})();
