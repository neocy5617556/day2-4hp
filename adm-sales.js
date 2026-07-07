/* 売上の集計ロジック(window.Sales) と ダッシュボードの控えめな売上サマリー(window.AdminSales)。
   売上は独立データではなく「完了した予約(status:'completed')」から自動集計する。
   依存: window.Utils / window.App
   注: このアプリの主役は車検リマインド。売上は実利の裏付けとして控えめに表示する。 */
(function () {
  'use strict';

  // ---- 集計ロジック ----
  var Sales = {};

  // 1件の売上金額（工賃 + 部品代）
  Sales.amount = function (r) {
    if (!r) return 0;
    return (Number(r.laborFee) || 0) + (Number(r.partsFee) || 0);
  };

  Sales.isCompleted = function (r) {
    return !!(r && r.status === 'completed');
  };

  // 完了予約の一覧
  Sales.completedList = function () {
    var reservations = (window.App && App.state && App.state.reservations) || [];
    return reservations.filter(Sales.isCompleted);
  };

  // 集計に使う日付（completedAt があればそれ、無ければ予約日）
  function completedDate(r) {
    if (r.completedAt) {
      var d = new Date(r.completedAt);
      return new Date(d.getFullYear(), d.getMonth(), d.getDate());
    }
    return window.Utils.parseDate(r.date);
  }

  function sameDay(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
  }
  function sameMonth(a, b) {
    return a && b && a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth();
  }

  // 本日の売上合計
  Sales.todayTotal = function () {
    var today = window.Utils.today();
    return Sales.completedList().reduce(function (sum, r) {
      return sameDay(completedDate(r), today) ? sum + Sales.amount(r) : sum;
    }, 0);
  };

  // 今月の売上合計
  Sales.monthTotal = function () {
    var today = window.Utils.today();
    return Sales.completedList().reduce(function (sum, r) {
      return sameMonth(completedDate(r), today) ? sum + Sales.amount(r) : sum;
    }, 0);
  };

  // 今月の完了作業件数
  Sales.monthCount = function () {
    var today = window.Utils.today();
    return Sales.completedList().filter(function (r) {
      return sameMonth(completedDate(r), today);
    }).length;
  };

  // 顧客ごとの累計売上・来店回数・完了作業履歴（新しい順）
  Sales.forCustomer = function (customerId) {
    var items = Sales.completedList()
      .filter(function (r) { return r.customerId === customerId; })
      .map(function (r) {
        return {
          date: r.date,
          workType: r.workType,
          amount: Sales.amount(r),
          laborFee: Number(r.laborFee) || 0,
          partsFee: Number(r.partsFee) || 0
        };
      })
      .sort(function (a, b) { return (b.date || '').localeCompare(a.date || ''); });

    var total = items.reduce(function (s, it) { return s + it.amount; }, 0);
    return { total: total, visits: items.length, items: items };
  };

  window.Sales = Sales;

  // ---- ダッシュボードの売上サマリー（控えめ表示）----
  var AdminSales = {};

  AdminSales.render = function () {
    var mount = document.getElementById('adm-sales');
    if (!mount) return;
    var Utils = window.Utils;

    mount.innerHTML =
      '<div class="adm-sales">' +
        '<div class="adm-sales__label">売上実績</div>' +
        '<div class="adm-sales__stats">' +
          '<div class="adm-sales__stat">' +
            '<span class="adm-sales__num">' + Utils.escapeHtml(Utils.yen(Sales.todayTotal())) + '</span>' +
            '<span class="adm-sales__cap">本日</span>' +
          '</div>' +
          '<div class="adm-sales__stat">' +
            '<span class="adm-sales__num">' + Utils.escapeHtml(Utils.yen(Sales.monthTotal())) + '</span>' +
            '<span class="adm-sales__cap">今月</span>' +
          '</div>' +
          '<div class="adm-sales__stat adm-sales__stat--sub">' +
            '<span class="adm-sales__num">' + Sales.monthCount() + '件</span>' +
            '<span class="adm-sales__cap">今月の完了作業</span>' +
          '</div>' +
        '</div>' +
      '</div>';
  };

  window.AdminSales = AdminSales;
})();
