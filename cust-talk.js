/* ============================================================================
 * cust-talk.js  ─ お客様側スマホ画面「LINEトーク」ビュー（描画専用）
 * ----------------------------------------------------------------------------
 * 役割:
 *   現在のお客様(App.state.currentCustomerId)宛の通知を、LINEのトーク画面
 *   さながらに「受信吹き出しの時系列」で #cust-talk に描画する。
 *   通知はシステム→お客様への一方向配信なので、吹き出しは全て受信(--in)。
 *
 * 設計メモ:
 *   - Notifications.listForCustomer は「新しい順」で返るため、トーク表示用に
 *     【古い→新しい】へ反転する（トークは上が古い / 下が新しい）。
 *   - 緑ヘッダーはシェル(アプリバー)が描くので、この talk 内には作らない。
 *   - 日付が変わる境目に日付セパレータ(.talk__daysep)を挿入する。
 *
 * 依存(実行時にwindowから参照): Utils, App, Notifications, Channel
 * import/export は使わず IIFE で window へ代入。DOM操作は render 内のみ。
 * innerHTML へ出す動的値は必ず Utils.escapeHtml() を通す。CSSは書かない(class名のみ)。
 * ==========================================================================*/

(function () {
  "use strict";

  /* --------------------------------------------------------------------------
   * カテゴリ別の見出し（アイコン＋ラベル）。escape不要の固定文言。
   * ------------------------------------------------------------------------*/
  const CATEGORY_LABEL = {
    shaken: "🚗 車検リマインド",
    reservation: "📅 予約確認",
    repair: "🔧 修理完了",
    tire: "🛞 タイヤ交換",
    other: "📨 お知らせ",
  };

  /** カテゴリ見出しを取得（未知カテゴリは other 扱い） */
  function catLabel(category) {
    return CATEGORY_LABEL[category] || CATEGORY_LABEL.other;
  }

  /** 数値を2桁ゼロ埋め（時・分用） */
  function pad2(n) {
    return String(n).padStart(2, "0");
  }

  /** createdAt(ISO) → "HH:MM"（ローカル時刻の時分をゼロ埋め） */
  function toHHMM(createdAt) {
    const d = new Date(createdAt);
    return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
  }

  /** createdAt(ISO) → "YYYY-MM-DD"（ローカル日付。日付セパレータの区切りキー兼fmtJPShort入力） */
  function toYMD(createdAt) {
    const d = new Date(createdAt);
    return (
      d.getFullYear() + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate())
    );
  }

  const CustomerTalk = {
    /**
     * render: #cust-talk へLINEトークを描画する（描画の唯一の入口）。
     *   マウント要素が無ければ何もせず返す。
     */
    render() {
      const mount = document.getElementById("cust-talk");
      if (!mount) return; // マウント要素が無ければ何もしない

      const customerId = App.state && App.state.currentCustomerId;

      // 新しい順で受け取り、トーク表示用に【古い→新しい】へ反転
      const desc = customerId ? Notifications.listForCustomer(customerId) : [];
      const items = desc.slice().reverse();

      // --- 0件: 空表示 ---
      if (items.length === 0) {
        mount.innerHTML =
          '<div class="talk">' +
          '<div class="talk__empty">まだ通知はありません</div>' +
          "</div>";
        return;
      }

      // 補足文言（LINEに届く旨）。固定文言だが念のためescape。
      const lineNote = Utils.escapeHtml(Channel.channelNote());

      let html = "";
      let lastYMD = null; // 直前メッセージの日付。変化したらセパレータを挿入

      items.forEach(function (n) {
        const ymd = toYMD(n.createdAt);

        // 日付が変わる箇所（最初の通知の前も含む）に日付セパレータ
        if (ymd !== lastYMD) {
          html +=
            '<div class="talk__daysep">' +
            Utils.escapeHtml(Utils.fmtJPShort(ymd)) +
            "</div>";
          lastYMD = ymd;
        }

        // 受信吹き出し1件（見出し/タイトル/本文/時刻）＋直下に補足文言
        html +=
          '<div class="talk__msg">' +
          '<div class="talk__bubble talk__bubble--in">' +
          '<div class="talk__cat">' +
          catLabel(n.category) +
          "</div>" +
          '<div class="talk__title">' +
          Utils.escapeHtml(n.title) +
          "</div>" +
          '<div class="talk__body">' +
          Utils.escapeHtml(n.body) +
          "</div>" +
          '<div class="talk__time">' +
          Utils.escapeHtml(toHHMM(n.createdAt)) +
          "</div>" +
          "</div>" +
          '<div class="talk__linenote">' +
          lineNote +
          "</div>" +
          "</div>";
      });

      mount.innerHTML = '<div class="talk">' + html + "</div>";
    },
  };

  window.CustomerTalk = CustomerTalk;
})();
