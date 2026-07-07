/* ============================================================================
 * notifications.js  ─ 通知サービス層（純サービス層 / DOM操作なし）
 * ----------------------------------------------------------------------------
 * このファイルの設計思想:
 *   通知の「生成(build/generate*)」と「送信(Channel.deliver)」を明確に分離する。
 *   - 生成 : どんな内容の通知を、誰に、いつ作るか を決める純粋なロジック。
 *   - 送信 : 出来上がった通知を実際に配信チャネルへ流す出口。
 *   今回の配信チャネルは「アプリ内(in-app)」だけだが、将来ここに
 *   LINE Messaging API の push を差し込むだけで本番運用に切り替えられる。
 *   分離しておくことで、生成ロジックには一切手を入れずに送信先だけ差し替え可能。
 *
 * 依存: window.Utils (data.js), window.App (app.js) を実行時に参照する。
 *       読込順は index.html が保証: data.js → notifications.js → ... → app.js
 *       （dispatch等は全てユーザー操作時に呼ばれるため App の存在は保証される）
 * import/export は使わず IIFE で window へ代入する。
 * ==========================================================================*/

/* ----------------------------------------------------------------------------
 * window.Channel : 送信の出口（配信チャネル抽象）
 *   ★ここが将来の LINE 差し込み口。生成側は Channel の中身を知らなくてよい。
 * --------------------------------------------------------------------------*/
(function () {
  "use strict";

  const Channel = {
    /**
     * deliver: 通知を実際に配信する唯一の出口。
     *   今回の実装は「アプリ内配信」として delivered/channel を確定して返すだけ。
     *   生成(Notifications.build/generate*)と送信(この関数)を分離しているため、
     *   本番化はこの関数の中身を差し替えるだけで済む。
     * @param {object} notification
     * @returns {object} 配信済みにマークした同一 notification
     */
    deliver(notification) {
      // ===== 将来の連携ポイント（LINE 差し込み箇所） =====
      // 本番運用では、ここで LINE Messaging API の push message を送信する。
      // 例) POST https://api.line.me/v2/bot/message/push  { to: lineUserId, messages:[...] }
      // customer に lineUserId を持たせ、この Channel.deliver 内で送信するだけで本番化できる。
      // 生成(Notifications.generate*)と送信(Channel.deliver)を分離しているのは、
      // まさにこの差し替えを、生成ロジックに一切触れずに実現するため。
      //
      // 例（擬似コード）:
      //   const customer = App.state.customers.find(c => c.id === notification.customerId);
      //   if (customer && customer.lineUserId) {
      //     fetch("https://api.line.me/v2/bot/message/push", {
      //       method: "POST",
      //       headers: { "Content-Type": "application/json",
      //                  "Authorization": "Bearer <CHANNEL_ACCESS_TOKEN>" },
      //       body: JSON.stringify({
      //         to: customer.lineUserId,
      //         messages: [{ type: "text", text: notification.title + "\n" + notification.body }]
      //       })
      //     });
      //     notification.channel = "line";
      //   }
      // ====================================================

      // 今回のデモ実装: アプリ内配信として確定する。
      notification.delivered = true;
      notification.channel = "in-app";
      return notification;
    },

    /**
     * channelNote: UI 側が各通知に添える補足文言を返す。
     *   「本当はLINEに飛ぶ」というデモの世界観を表現するための一文。
     * @returns {string}
     */
    channelNote() {
      return "実際の運用では、この通知はお客様のLINEに自動送信されます。";
    },
  };

  window.Channel = Channel;
})();

/* ----------------------------------------------------------------------------
 * window.Notifications : 生成 ＋ 発行
 *   build         … 純生成（保存も送信もしない）
 *   dispatch      … 送信(Channel.deliver)→保存(App.state + App.save)。生成/送信の境界。
 *   issue         … build → dispatch の便利関数（手動通知UI用）
 *   generate*     … 状況を走査して自動生成＆発行するロジック
 *   list系        … 参照用の取り出し
 * --------------------------------------------------------------------------*/
(function () {
  "use strict";

  /** createdAt(ISO文字列)の新しい順に並べ替えるための比較関数 */
  function byCreatedAtDesc(a, b) {
    return new Date(b.createdAt) - new Date(a.createdAt);
  }

  const Notifications = {
    /* ===================== 生成フェーズ ===================== */

    /**
     * build: 通知ドラフトを「生成」するだけの純粋関数。
     *   id と createdAt を付与し、未送信(delivered:false)・in-app 初期値で返す。
     *   ここでは保存も送信も一切しない。副作用なし。
     * @returns {object} notification ドラフト
     */
    build(customerId, category, title, body) {
      return {
        id: Utils.uid("ntf"),
        customerId: customerId,
        category: category, // "shaken"|"reservation"|"repair"|"tire"|"other"
        title: title,
        body: body,
        createdAt: new Date().toISOString(),
        delivered: false,
        channel: "in-app",
      };
    },

    /* ===================== 送信フェーズ ===================== */

    /**
     * dispatch: 生成済みドラフトを「送信」して保存する。
     *   ★生成と送信の境界。ここで初めて Channel（出口）を通す。
     *   1) Channel.deliver で配信処理（今回はin-app確定 / 将来はLINE push）
     *   2) state.notifications の先頭に unshift（先頭=新しい）
     *   3) App.save() で永続化＋再描画
     * @param {object} draft build() が返したドラフト
     */
    dispatch(draft) {
      // --- 送信（出口を通す） ---
      const delivered = Channel.deliver(draft);

      // --- 保存（状態へ反映し永続化・再描画） ---
      if (!Array.isArray(App.state.notifications)) {
        App.state.notifications = [];
      }
      App.state.notifications.unshift(delivered);
      App.save();
    },

    /**
     * issue: build → dispatch をまとめた便利関数（手動通知UIから使う）。
     */
    issue(customerId, category, title, body) {
      const draft = this.build(customerId, category, title, body);
      this.dispatch(draft);
    },

    /* ===================== 自動生成ロジック ===================== */

    /**
     * generateShakenReminders:
     *   全顧客を走査し、車検ステータスが expired / within1m / within3m の顧客に
     *   車検リマインドを「生成して発行(dispatch)」する。
     *   重複防止: その顧客宛の未対応(未delivered)な shaken 通知が既に state にあればスキップ。
     *   （＝直近生成済みの車検通知があれば二重生成しない）
     * @returns {{created:number, drafts:object[]}}
     */
    generateShakenReminders() {
      const customers = (App.state && App.state.customers) || [];
      const existing = (App.state && App.state.notifications) || [];
      const drafts = [];

      customers.forEach(function (c) {
        if (!c.shakenExpiry) return;

        const status = Utils.shakenStatus(c.shakenExpiry); // {key,label,className}
        const key = status.key;
        if (key !== "expired" && key !== "within1m" && key !== "within3m") {
          return; // リマインド対象外
        }

        // --- 重複防止判定（シンプル）: この顧客の shaken 通知が既にあればスキップ ---
        const alreadyHas = existing.some(function (n) {
          return n.customerId === c.id && n.category === "shaken";
        });
        if (alreadyHas) return;

        // --- 状況に応じた本文を生成 ---
        const expiryJP = Utils.fmtJP(c.shakenExpiry);
        let body;
        if (key === "expired") {
          body =
            "車検の有効期限が過ぎています(満了日: " +
            expiryJP +
            ")。至急ご連絡ください。";
        } else if (key === "within1m") {
          body =
            "車検満了まで1ヶ月を切りました(満了日: " +
            expiryJP +
            ")。ご予約はお早めに。";
        } else {
          // within3m
          body =
            "車検満了が近づいています(満了日: " +
            expiryJP +
            ")。点検のご予約はいかがですか。";
        }

        // 生成 → 発行（Notifications.issue が build→dispatch を担う）
        const draft = Notifications.build(c.id, "shaken", "車検リマインド", body);
        Notifications.dispatch(draft);
        drafts.push(draft);
      });

      return { created: drafts.length, drafts: drafts };
    },

    /**
     * forReservation:
     *   予約確定/リクエスト受付の通知を生成・発行するヘルパー。
     *   お客様が予約リクエストした時、店舗が予約登録した時のどちらでも使える。
     * @param {object} reservation {customerId,date,time,workType,...}
     * @param {string} customerName 表示用の顧客名
     */
    forReservation(reservation, customerName) {
      const dateJP = Utils.fmtJP(reservation.date);
      const time = reservation.time || "";
      const work = reservation.workType || "ご来店";
      const name = customerName ? customerName + "様 " : "";

      const title = "ご予約を承りました";
      const body =
        name +
        dateJP +
        (time ? " " + time : "") +
        "、「" +
        work +
        "」のご予約を承りました。ご来店をお待ちしております。";

      // 生成 → 発行
      this.issue(reservation.customerId, "reservation", title, body);
    },

    /* ===================== 参照系 ===================== */

    /**
     * listForCustomer: 指定顧客宛の通知を createdAt 新しい順で返す（お客様ビュー用）。
     */
    listForCustomer(customerId) {
      const all = (App.state && App.state.notifications) || [];
      return all
        .filter(function (n) {
          return n.customerId === customerId;
        })
        .slice()
        .sort(byCreatedAtDesc);
    },

    /**
     * all: 全通知を createdAt 新しい順で返す（店舗の通知一覧用）。
     */
    all() {
      const all = (App.state && App.state.notifications) || [];
      return all.slice().sort(byCreatedAtDesc);
    },
  };

  window.Notifications = Notifications;
})();
