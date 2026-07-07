// 店舗側管理画面「顧客・車両一覧」モジュール。
// #adm-customers に一覧テーブル・検索・車検フィルタ・新規/編集フォームを描画する。
(function () {
  'use strict';

  // --- モジュールローカル状態（再描画をまたいで保持）---
  // フォームの開閉と編集対象。formMode: null | 'new' | 'edit'
  var formMode = null;
  var editingId = null;

  // 顧客が一致するか（部分一致・小文字化）を判定するための検索対象文字列を作る。
  function searchText(c) {
    return [c.name, c.kana, c.carModel, c.plate]
      .map(function (v) { return (v || '').toLowerCase(); })
      .join(' ');
  }

  // 車検フィルタ適用後・ソート済みの顧客配列を返す（検索は行トグルで別途処理）。
  function visibleCustomers() {
    var Utils = window.Utils;
    var App = window.App;
    var customers = (App && App.state && App.state.customers) || [];
    var filter = window.AdminUI ? window.AdminUI.shakenFilter : null;

    var list = customers.slice();
    if (filter) {
      list = list.filter(function (c) {
        return Utils.shakenStatus(c.shakenExpiry).key === filter;
      });
    }
    // 車検満了までの日数昇順（期限が近い/超過を上に）。
    list.sort(function (a, b) {
      var da = Utils.daysUntil(a.shakenExpiry);
      var db = Utils.daysUntil(b.shakenExpiry);
      if (isNaN(da)) da = Infinity;
      if (isNaN(db)) db = Infinity;
      return da - db;
    });
    return list;
  }

  // 「あと〇日 / 〇日超過」の表示文字列を作る。
  function daysLabel(days) {
    if (isNaN(days)) return '';
    if (days < 0) return Math.abs(days) + '日超過';
    return 'あと' + days + '日';
  }

  // 1顧客ぶんの行(tr)を生成する。
  function buildRow(c) {
    var Utils = window.Utils;
    var status = Utils.shakenStatus(c.shakenExpiry);
    var days = Utils.daysUntil(c.shakenExpiry);

    var tr = document.createElement('tr');
    // 部分一致用の検索対象文字列を持たせる。
    tr.setAttribute('data-search', searchText(c));

    tr.innerHTML =
      '<td>' +
        '<div class="adm-cust-name">' + Utils.escapeHtml(c.name) + '</div>' +
        '<div class="adm-cust-kana">' + Utils.escapeHtml(c.kana) + '</div>' +
      '</td>' +
      '<td>' + Utils.escapeHtml(c.carModel) + '</td>' +
      '<td>' + Utils.escapeHtml(c.plate) + '</td>' +
      '<td>' +
        Utils.escapeHtml(Utils.fmtJP(c.shakenExpiry)) +
        '<div class="adm-days">' + Utils.escapeHtml(daysLabel(days)) + '</div>' +
      '</td>' +
      '<td>' + Utils.escapeHtml(Utils.fmtJP(c.lastVisit)) + '</td>' +
      '<td>' + Utils.escapeHtml(c.nextAction) + '</td>' +
      '<td><span class="badge ' + status.className + '">' +
        Utils.escapeHtml(status.label) + '</span></td>' +
      '<td><button type="button" class="adm-btn adm-btn--sm" data-edit="' +
        Utils.escapeHtml(c.id) + '">編集</button></td>';

    return tr;
  }

  // 1つの入力フィールドを生成する補助。
  function buildField(label, name, type, value) {
    var Utils = window.Utils;
    var wrap = document.createElement('div');
    wrap.className = 'adm-field';
    wrap.innerHTML =
      '<label class="adm-field__label">' + Utils.escapeHtml(label) + '</label>' +
      '<input class="adm-field__input" type="' + type + '" name="' + name +
        '" value="' + Utils.escapeHtml(value || '') + '">';
    return wrap;
  }

  // 新規/編集フォームを生成する。cust が無ければ新規。
  function buildForm(cust) {
    var form = document.createElement('form');
    form.className = 'adm-form';

    var grid = document.createElement('div');
    grid.className = 'adm-form__grid';
    var c = cust || {};
    grid.appendChild(buildField('顧客名（必須）', 'name', 'text', c.name));
    grid.appendChild(buildField('ふりがな', 'kana', 'text', c.kana));
    grid.appendChild(buildField('電話', 'phone', 'tel', c.phone));
    grid.appendChild(buildField('車種', 'carModel', 'text', c.carModel));
    grid.appendChild(buildField('ナンバー', 'plate', 'text', c.plate));
    grid.appendChild(buildField('車検満了日', 'shakenExpiry', 'date', c.shakenExpiry));
    grid.appendChild(buildField('前回来店日', 'lastVisit', 'date', c.lastVisit));
    grid.appendChild(buildField('次のアクション', 'nextAction', 'text', c.nextAction));
    form.appendChild(grid);

    var actions = document.createElement('div');
    actions.className = 'adm-form__actions';
    var saveBtn = document.createElement('button');
    saveBtn.type = 'submit';
    saveBtn.className = 'adm-btn adm-btn--primary';
    saveBtn.textContent = '保存';
    var cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'adm-btn';
    cancelBtn.textContent = 'キャンセル';
    actions.appendChild(saveBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);

    // キャンセルでフォームを閉じて再描画。
    cancelBtn.addEventListener('click', function () {
      formMode = null;
      editingId = null;
      render();
    });

    // 保存処理。
    form.addEventListener('submit', function (e) {
      e.preventDefault();
      var App = window.App;
      var Utils = window.Utils;
      var name = form.elements.name.value.trim();
      // 氏名必須バリデーション。
      if (!name) {
        form.elements.name.focus();
        return;
      }
      var data = {
        name: name,
        kana: form.elements.kana.value.trim(),
        phone: form.elements.phone.value.trim(),
        carModel: form.elements.carModel.value.trim(),
        plate: form.elements.plate.value.trim(),
        shakenExpiry: form.elements.shakenExpiry.value,
        lastVisit: form.elements.lastVisit.value,
        nextAction: form.elements.nextAction.value.trim()
      };

      var customers = App.state.customers || (App.state.customers = []);
      if (formMode === 'edit' && editingId) {
        // 既存顧客を更新（idは維持）。
        for (var i = 0; i < customers.length; i++) {
          if (customers[i].id === editingId) {
            data.id = editingId;
            customers[i] = data;
            break;
          }
        }
      } else {
        // 新規追加。
        data.id = Utils.uid('cust_');
        customers.push(data);
      }

      formMode = null;
      editingId = null;
      App.save(); // 保存＋全再描画。
    });

    return form;
  }

  // 検索によって各行の表示/非表示をトグルし、空メッセージを切り替える。
  function applySearch(tbody, emptyEl, term) {
    var q = (term || '').toLowerCase().trim();
    var rows = tbody.getElementsByTagName('tr');
    var shown = 0;
    for (var i = 0; i < rows.length; i++) {
      var hay = rows[i].getAttribute('data-search') || '';
      var match = !q || hay.indexOf(q) !== -1;
      rows[i].style.display = match ? '' : 'none';
      if (match) shown++;
    }
    // 該当0件なら空メッセージを見せる。
    emptyEl.style.display = shown === 0 ? '' : 'none';
  }

  // メイン描画。
  function render() {
    var mount = document.getElementById('adm-customers');
    if (!mount) return; // マウント要素が無ければ何もしない。

    var Utils = window.Utils;
    var AdminUI = window.AdminUI;
    var initialQuery = (AdminUI && AdminUI.query) || '';
    var filter = AdminUI ? AdminUI.shakenFilter : null;

    var section = document.createElement('section');
    section.className = 'adm-section';

    // (1) ヘッダ。
    var head = document.createElement('div');
    head.className = 'adm-section__head';
    var title = document.createElement('h2');
    title.className = 'adm-section__title';
    title.textContent = '顧客・車両一覧';
    var newBtn = document.createElement('button');
    newBtn.type = 'button';
    newBtn.className = 'adm-btn adm-btn--primary';
    newBtn.textContent = '＋ 新規顧客';
    newBtn.addEventListener('click', function () {
      formMode = 'new';
      editingId = null;
      render();
    });
    head.appendChild(title);
    head.appendChild(newBtn);
    section.appendChild(head);

    // (5) フォーム（開いている場合のみ）。
    if (formMode === 'new') {
      section.appendChild(buildForm(null));
    } else if (formMode === 'edit' && editingId) {
      var target = null;
      var all = (window.App && window.App.state && window.App.state.customers) || [];
      for (var i = 0; i < all.length; i++) {
        if (all[i].id === editingId) { target = all[i]; break; }
      }
      if (target) section.appendChild(buildForm(target));
      else { formMode = null; editingId = null; }
    }

    // (2) 検索ボックス。
    var search = document.createElement('div');
    search.className = 'adm-search';
    var input = document.createElement('input');
    input.className = 'adm-search__input';
    input.type = 'search';
    input.setAttribute('placeholder', '名前・ふりがな・車種・ナンバーで検索');
    input.value = initialQuery;
    search.appendChild(input);
    section.appendChild(search);

    // (3) 車検フィルタチップ。
    if (filter) {
      // フィルタキー→ラベルの固定マップ（shakenStatus のラベルと一致）。
      var labelMap = {
        expired: '期限切れ',
        within1m: '1ヶ月以内',
        within3m: '3ヶ月以内',
        ok: '余裕あり'
      };
      var chip = document.createElement('div');
      chip.className = 'adm-filter-chip';
      chip.innerHTML = '車検: ' + Utils.escapeHtml(labelMap[filter] || filter) + ' ';
      var close = document.createElement('button');
      close.type = 'button';
      close.className = 'adm-btn adm-btn--sm';
      close.textContent = '✕';
      close.addEventListener('click', function () {
        AdminUI.go('customers', { shakenFilter: null });
      });
      chip.appendChild(close);
      section.appendChild(chip);
    }

    // (4) テーブル。
    var wrap = document.createElement('div');
    wrap.className = 'adm-table-wrap';
    var table = document.createElement('table');
    table.className = 'adm-table';
    table.innerHTML =
      '<thead><tr>' +
        '<th>顧客名</th><th>車種</th><th>ナンバー</th>' +
        '<th>車検満了日</th><th>前回来店</th><th>次のアクション</th>' +
        '<th>車検</th><th>操作</th>' +
      '</tr></thead>';
    var tbody = document.createElement('tbody');

    var list = visibleCustomers();
    for (var k = 0; k < list.length; k++) {
      tbody.appendChild(buildRow(list[k]));
    }
    table.appendChild(tbody);
    wrap.appendChild(table);
    section.appendChild(wrap);

    // 該当0件メッセージ（検索で全行が隠れたとき等に表示）。
    var empty = document.createElement('div');
    empty.className = 'adm-empty';
    empty.textContent = '該当する顧客がいません';
    empty.style.display = 'none';
    section.appendChild(empty);

    // --- DOM差し替え ---
    mount.innerHTML = '';
    mount.appendChild(section);

    // 行「編集」ボタンの委譲ハンドラ。
    tbody.addEventListener('click', function (e) {
      var btn = e.target && e.target.closest ? e.target.closest('[data-edit]') : null;
      if (!btn) return;
      formMode = 'edit';
      editingId = btn.getAttribute('data-edit');
      render();
    });

    // 初期検索語で一度トグルを適用（フィルタ結果に対する部分一致）。
    applySearch(tbody, empty, initialQuery);

    // ★検索: フル再描画せず行トグル＋フォーカス保持。AdminUI.query に反映のみ。
    function onSearch() {
      if (window.AdminUI) window.AdminUI.query = input.value;
      applySearch(tbody, empty, input.value);
    }
    input.addEventListener('input', onSearch);
    input.addEventListener('keyup', onSearch);
  }

  window.AdminCustomers = { render: render };
})();
