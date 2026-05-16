// @ts-nocheck
import app from 'flarum/forum/app';
import Modal from 'flarum/common/components/Modal';
import Button from 'flarum/common/components/Button';
import LoadingIndicator from 'flarum/common/components/LoadingIndicator';

// Polling cadence — same order of magnitude as Habbo's trade-window refresh.
// Long enough to not hammer the server, short enough that "the other side
// added an item" feels responsive.
const POLL_INTERVAL_MS = 4000;

type Side = 'initiator' | 'recipient';

interface OfferItem {
  itemType: string;
  itemId: number;
  // resolved client-side from the catalog payload
  name?: string;
  imagePath?: string;
  imageUrl?: string;
  slug?: string;
  titleText?: string;
  color?: string;
}

/**
 * Habbo-style trade window. Opens via the "Trade" entry on a user's profile
 * controls dropdown (or auto-opens when the user clicks a trade-request
 * notification).
 *
 * Lifecycle:
 *   - `oninit` POSTs to /trades to open or resume the trade with the target
 *     user. Server returns the canonical state. We mirror it in component
 *     state and start polling.
 *   - `onremove` clears the polling interval. Closing the modal does NOT
 *     cancel the trade — the user can come back later and pick it up.
 *   - Each user-initiated change (add/remove item, set points, accept,
 *     cancel) hits the server immediately; the server response replaces
 *     local state so we never drift.
 *
 * Attrs:
 *   - target?: User      → counterparty (when opened from a profile)
 *   - tradeId?: number   → existing trade id (when reopened from a notification)
 */
export default class TradeModal extends Modal {
  // Every dismissal path is safe — the trade row is persisted on every
  // mutation (add item, set points, accept), so closing the window NEVER
  // loses the user's progress. Reopening the trade (via the partner's
  // profile, the trades page, or a notification) loads the exact same
  // pending row back. Allow all three native dismissal affordances:
  // Escape, the X button, and a backdrop click. The earlier `false` on
  // backdrop click pre-dated the `display: none` we now apply to the
  // `.ModalManager-invisibleBackdrop` sibling (see TradeModal.oncreate
  // and less/forum.less) — without that backdrop in the DOM, the user
  // can't even hit it accidentally; keeping the option enabled is the
  // honest default in case a future patch changes the backdrop story.
  static dismissibleOptions = {
    viaEscKey: true,
    viaCloseButton: true,
    viaBackdropClick: true,
  };

  loading = true;
  trade: any = null;
  err = '';
  busy: 'accept' | 'cancel' | 'addItem' | 'setPoints' | 'finalize' | null = null;
  pollHandle: any = null;
  pickerOpen = false;
  pointsDraft = '0';

  // Countdown state for the "5...4...3...2...1... → finalize" overlay that
  // runs once BOTH sides have accepted while the trade is still pending.
  // We hold a wall-clock deadline (`countdownEndsAt`) rather than a tick
  // counter so the displayed number stays accurate even if the browser
  // throttles our setInterval (background tabs, slow devices). The handle
  // is the redraw timer we kick off when the countdown starts and clear
  // when it ends, gets cancelled (one side un-accepts), or the modal
  // unmounts.
  countdownEndsAt: number | null = null;
  countdownHandle: any = null;
  // True once we've fired POST /finalize for the current accept-both
  // session. Either side's client races to call /finalize; the endpoint is
  // idempotent server-side, but firing twice in the same tab is wasteful.
  finalizeFired = false;

  className() {
    // Plain `PointSystemTradeModal` — no Flarum modifier class. The core
    // only ships `Modal--small` and `Modal--large` (no `--medium`); using a
    // bogus modifier risked falling into a layout state where the modal
    // rendered behind the `.ModalManager-invisibleBackdrop` sibling (user
    // bug report: "o modal fica por baixo de invisibleBackdrop"). Our own
    // CSS in less/forum.less owns the trade-modal width + presentation now.
    return 'PointSystemTradeModal';
  }

  title() {
    const t = (k: string) => app.translator.trans('ramon-point-system.forum.trade.' + k);
    if (!this.trade) return t('title_loading');
    const youAre = this.trade.youAre as Side;
    const other = youAre === 'initiator' ? this.trade.recipient : this.trade.initiator;
    return t('title_with', { name: other?.displayName || other?.username || '—' });
  }

  oninit(vnode: any) {
    super.oninit(vnode);
    if (this.attrs.tradeId) {
      this.refresh(this.attrs.tradeId);
    } else if (this.attrs.target) {
      this.open(Number(this.attrs.target.id?.()));
    } else {
      this.err = 'no_target';
      this.loading = false;
    }
  }

  oncreate(vnode: any) {
    super.oncreate?.(vnode);
    // Final defence against the .ModalManager-invisibleBackdrop covering us.
    // CSS (body:has(.PointSystemTradeModal) .ModalManager-invisibleBackdrop)
    // handles modern browsers, but on a few theme stacking contexts the
    // backdrop is appended AFTER our oncreate runs, OR the host browser
    // lacks `:has()` support entirely. Walk the DOM once on mount and
    // explicitly disable any backdrop currently present. Cheap, idempotent,
    // and harmless if the CSS already neutralised them.
    document.querySelectorAll('.ModalManager-invisibleBackdrop').forEach((el) => {
      (el as HTMLElement).style.display = 'none';
      (el as HTMLElement).style.pointerEvents = 'none';
    });
  }

  onremove() {
    if (this.pollHandle) {
      clearInterval(this.pollHandle);
      this.pollHandle = null;
    }
    // Cancel any in-flight countdown so it doesn't fire /finalize after
    // the modal unmounts — Mithril would warn about setState-after-unmount
    // and we'd hit the server with a request whose response nobody reads.
    this.stopCountdown();
    // Restore the backdrops we forced off so OTHER modals opened later
    // (award-points, confirm-purchase, etc.) keep their dismissal-on-click
    // affordance.
    document.querySelectorAll('.ModalManager-invisibleBackdrop').forEach((el) => {
      (el as HTMLElement).style.removeProperty('display');
      (el as HTMLElement).style.removeProperty('pointer-events');
    });
    super.onremove?.();
  }

  startPolling() {
    if (this.pollHandle) return;
    this.pollHandle = setInterval(() => {
      if (!this.trade || this.trade.status !== 'pending') {
        clearInterval(this.pollHandle);
        this.pollHandle = null;
        return;
      }
      this.refresh(Number(this.trade.id));
    }, POLL_INTERVAL_MS);
  }

  async open(recipientId: number) {
    this.loading = true;
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/trades`,
        body: { recipientId },
      });
      this.applyState(res?.data);
      this.startPolling();
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'open_failed';
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  async refresh(tradeId: number) {
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'GET',
        url: `${apiUrl}/point-system/trades/${tradeId}`,
      });
      this.applyState(res?.data);
      if (this.trade?.status === 'pending') this.startPolling();
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'refresh_failed';
    } finally {
      this.loading = false;
      m.redraw();
    }
  }

  applyState(trade: any) {
    if (!trade) return;
    this.trade = trade;
    // Only sync the points input from server when the user isn't actively
    // editing — otherwise we'd snap their typing back as soon as the poll
    // returns the previous value.
    if (document.activeElement?.tagName !== 'INPUT' || !document.activeElement.classList.contains('ps-trade-points')) {
      const mine = trade.youAre === 'initiator' ? trade.initiatorPoints : trade.recipientPoints;
      this.pointsDraft = String(mine ?? 0);
    }
    this.err = '';

    // Drive the 5-second pre-finalize countdown off of every state update.
    // Three transitions matter:
    //  - both-just-accepted: kick off the countdown if not already running.
    //  - one-side-un-accepted: cancel any in-flight countdown so the trade
    //    doesn't auto-finalize after the user backed out.
    //  - completed/cancelled: clear countdown plumbing; the trade is final.
    this.reconcileCountdown();
  }

  reconcileCountdown() {
    const tr = this.trade;
    if (!tr) {
      this.stopCountdown();
      return;
    }
    if (tr.status !== 'pending') {
      // Completed or cancelled — done. Reset the "fired" flag so a future
      // re-opened pending trade can countdown again.
      this.stopCountdown();
      this.finalizeFired = false;
      return;
    }
    const both = !!tr.initiatorAccepted && !!tr.recipientAccepted;
    if (both) {
      this.startCountdown();
    } else {
      // Either side un-accepted between the start of the countdown and
      // now — abort. Server-side, the trade also stays pending; nothing
      // to revert.
      this.stopCountdown();
      this.finalizeFired = false;
    }
  }

  startCountdown() {
    if (this.countdownHandle || this.countdownEndsAt) return;
    // Wall-clock deadline so the displayed digit stays correct under tab
    // throttling. 5 seconds = 5000 ms; we re-tick at 200 ms so the visible
    // digit transitions feel smooth without burning CPU.
    this.countdownEndsAt = Date.now() + 5000;
    this.countdownHandle = setInterval(() => {
      const remaining = this.countdownEndsAt! - Date.now();
      if (remaining <= 0) {
        this.stopCountdown();
        if (!this.finalizeFired) {
          this.finalizeFired = true;
          this.finalize();
        }
      } else {
        m.redraw();
      }
    }, 200);
    m.redraw();
  }

  stopCountdown() {
    if (this.countdownHandle) {
      clearInterval(this.countdownHandle);
      this.countdownHandle = null;
    }
    this.countdownEndsAt = null;
  }

  countdownRemainingSeconds(): number | null {
    if (!this.countdownEndsAt) return null;
    const ms = this.countdownEndsAt - Date.now();
    if (ms <= 0) return 0;
    return Math.ceil(ms / 1000);
  }

  async finalize() {
    if (!this.trade) return;
    this.busy = 'finalize';
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/trades/${this.trade.id}/finalize`,
        body: {},
      });
      this.applyState(res?.data);
      if (this.trade?.status === 'completed') {
        this.reconcileLocalOwnership();
        app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.trade.completed_alert'));
      }
    } catch (e: any) {
      // Inspect the response payload — `errors[0].detail` is the
      // JSON-encoded validation attributes object (controllers serialize
      // ValidationException attrs via json_encode). Parse it and surface
      // a localized message for the well-known codes.
      const rawDetail = e?.response?.errors?.[0]?.detail;
      let code = '';
      try {
        const parsed = typeof rawDetail === 'string' ? JSON.parse(rawDetail) : rawDetail;
        code = String(parsed?.trade ?? '');
      } catch {
        code = '';
      }
      if (code === 'recipient_already_owns_item') {
        this.err = app.translator.trans('ramon-point-system.forum.trade.error_recipient_owns_item') as string;
      } else if (code === 'not_both_accepted') {
        this.err = app.translator.trans('ramon-point-system.forum.trade.error_not_both_accepted') as string;
      } else if (code === 'initiator_insufficient_points' || code === 'recipient_insufficient_points') {
        this.err = app.translator.trans('ramon-point-system.forum.trade.error_insufficient_points') as string;
      } else if (code === 'item_unavailable') {
        this.err = app.translator.trans('ramon-point-system.forum.trade.error_item_unavailable') as string;
      } else {
        this.err = rawDetail || 'finalize_failed';
      }
      // Allow another attempt — the countdown is over, so if the user
      // adjusts the offer and re-accepts, a fresh countdown will kick in.
      this.finalizeFired = false;
      // DON'T `this.refresh(...)` immediately here: the server has already
      // reset both `accepted` flags in its catch handler (see
      // TradeRepository::execute), and our `applyState()` clears `this.err`
      // every time it runs. Forcing a refresh now would wipe the error
      // message before the user gets a chance to read it. The polling
      // interval (every 4s) will pick up the new state shortly anyway, by
      // which time the user has seen the explanation and either fixed the
      // offer or closed the modal.
    } finally {
      this.busy = null;
      m.redraw();
    }
  }

  view() {
    if (this.loading) return <LoadingIndicator />;
    if (this.err === 'no_target') {
      return <div className="Modal-body">{app.translator.trans('ramon-point-system.forum.trade.error_no_target')}</div>;
    }
    if (!this.trade) {
      return <div className="Modal-body">{app.translator.trans('ramon-point-system.forum.trade.error_load')}</div>;
    }

    const t = (k: string, v?: any) => app.translator.trans('ramon-point-system.forum.trade.' + k, v);
    const youAre = this.trade.youAre as Side;
    const yourPoints = youAre === 'initiator' ? this.trade.initiatorPoints : this.trade.recipientPoints;
    const theirPoints = youAre === 'initiator' ? this.trade.recipientPoints : this.trade.initiatorPoints;
    const yourAccept = youAre === 'initiator' ? this.trade.initiatorAccepted : this.trade.recipientAccepted;
    const theirAccept = youAre === 'initiator' ? this.trade.recipientAccepted : this.trade.initiatorAccepted;
    const them = youAre === 'initiator' ? this.trade.recipient : this.trade.initiator;
    const me = youAre === 'initiator' ? this.trade.initiator : this.trade.recipient;

    const yourItems = this.itemsForOwner(me?.id);
    const theirItems = this.itemsForOwner(them?.id);

    const isFinal = this.trade.status === 'completed' || this.trade.status === 'cancelled';
    const balance = Number(app.session.user?.attribute('pointBalance') ?? 0);

    return (
      <div className="Modal-body PointSystemTradeModal-body">
        <div className={`PointSystemTradeModal-banner is-${this.trade.status}`}>
          {this.trade.status === 'completed' && (
            <span>
              <i className="fas fa-check-circle" /> {t('status_completed')}
            </span>
          )}
          {this.trade.status === 'cancelled' && (
            <span>
              <i className="fas fa-times-circle" /> {t('status_cancelled')}
            </span>
          )}
          {this.trade.status === 'pending' &&
            yourAccept &&
            theirAccept &&
            (() => {
              const remaining = this.countdownRemainingSeconds();
              return remaining !== null && remaining > 0 ? (
                <span className="PointSystemTradeModal-countdown">
                  <span className="PointSystemTradeModal-countdown-digit">{remaining}</span>
                  <span className="PointSystemTradeModal-countdown-text">{t('finalizing_in')}</span>
                </span>
              ) : (
                <span>
                  <i className="fas fa-hourglass" /> {t('status_both_accepted')}
                </span>
              );
            })()}
          {this.trade.status === 'pending' && (!yourAccept || !theirAccept) && (
            <span>
              <i className="fas fa-handshake" /> {t('status_pending')}
            </span>
          )}
        </div>

        <div className="PointSystemTradeModal-panels">
          <div className={`PointSystemTradeModal-panel ${yourAccept ? 'is-accepted' : ''}`}>
            <h3>{t('your_offer')}</h3>
            <div className="PointSystemTradeModal-items">
              {yourItems.map((it) => (
                <div className="PointSystemTradeModal-itemChip" key={`y-${it.itemType}-${it.itemId}`}>
                  {this.renderItemThumb(it, me)}
                  <span className="PointSystemTradeModal-itemChip-name">{it.name || `${it.itemType}#${it.itemId}`}</span>
                  {!isFinal && (
                    <button
                      type="button"
                      className="PointSystemTradeModal-itemChip-remove"
                      title={t('remove_item') as string}
                      onclick={() => this.removeItem(it)}
                    >
                      <i className="fas fa-times" />
                    </button>
                  )}
                </div>
              ))}
              {yourItems.length === 0 && <p className="helpText">{t('no_items_yet')}</p>}
            </div>
            {!isFinal && (
              <Button className="Button Button--link PointSystemTradeModal-addItem" onclick={() => (this.pickerOpen = !this.pickerOpen)}>
                <i className="fas fa-plus" /> {t('add_item')}
              </Button>
            )}
            {this.pickerOpen && !isFinal && this.renderItemPicker(yourItems, me)}

            <div className="PointSystemTradeModal-points">
              <label>{t('your_points')}</label>
              <input
                type="number"
                min="0"
                max={balance}
                className="FormControl ps-trade-points"
                value={this.pointsDraft}
                disabled={isFinal}
                oninput={(e: Event) => (this.pointsDraft = (e.target as HTMLInputElement).value)}
                onblur={() => this.commitPoints()}
              />
              <small className="helpText">
                {t('balance')}: <strong>{balance.toLocaleString()}</strong>
              </small>
            </div>
          </div>

          <div className={`PointSystemTradeModal-panel is-readonly ${theirAccept ? 'is-accepted' : ''}`}>
            <h3>{t('their_offer', { name: them?.displayName || them?.username || '—' })}</h3>
            <div className="PointSystemTradeModal-items">
              {theirItems.map((it) => (
                <div className="PointSystemTradeModal-itemChip is-readonly" key={`t-${it.itemType}-${it.itemId}`}>
                  {this.renderItemThumb(it, them)}
                  <span className="PointSystemTradeModal-itemChip-name">{it.name || `${it.itemType}#${it.itemId}`}</span>
                </div>
              ))}
              {theirItems.length === 0 && <p className="helpText">{t('no_items_yet')}</p>}
            </div>
            <div className="PointSystemTradeModal-points">
              <label>{t('their_points')}</label>
              <div className="PointSystemTradeModal-readonly">
                <strong>{Number(theirPoints || 0).toLocaleString()}</strong>
              </div>
            </div>
          </div>
        </div>

        {!isFinal && (
          <div className="PointSystemTradeModal-actions">
            <Button className={`Button ${yourAccept ? 'Button--primary' : ''}`} loading={this.busy === 'accept'} onclick={() => this.toggleAccept()}>
              <i className={`fas ${yourAccept ? 'fa-check-double' : 'fa-check'}`} /> {yourAccept ? t('unaccept') : t('accept')}
            </Button>
            {/*
              Explicit non-destructive close. Pre-existing "Cancel trade"
              (Button--danger below) calls the server cancel endpoint and
              drops the row to status=cancelled — that's the destructive
              action. This Button just hides the modal; the trade keeps
              its items and points and waits in the trades list. Without
              this affordance, the only visible exit was the destructive
              red button, which users misread as "the way to close".

              Use `app.modal.close()` directly instead of `this.hide()` —
              the latter is async, returns a promise that resolves AFTER
              Flarum's exit animation completes, and on some theme stacking
              contexts the close was being swallowed (modal kept rendering).
              `app.modal.close()` synchronously sets the modal slot to null;
              we then explicitly stop our timers before the unmount runs so
              the pending interval callbacks don't fire on a stale `this`.
            */}
            <Button
              className="Button"
              onclick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.stopCountdown();
                if (this.pollHandle) {
                  clearInterval(this.pollHandle);
                  this.pollHandle = null;
                }
                app.modal.close();
              }}
            >
              <i className="fas fa-times-circle" /> {t('close_keep')}
            </Button>
            <Button className="Button Button--danger" loading={this.busy === 'cancel'} onclick={() => this.cancel()}>
              <i className="fas fa-trash-alt" /> {t('cancel')}
            </Button>
          </div>
        )}
        {!isFinal && (
          <p className="PointSystemTradeModal-persistHint">
            <i className="fas fa-cloud" /> {t('persist_hint')}
          </p>
        )}

        {/*
          Post-completion / post-cancellation actions. The accept / close /
          cancel row only renders while the trade is still mutable; once
          it transitions to a final status (completed or cancelled) there
          is no edit affordance and the user previously had to find the X
          in the modal header to close. Surface an explicit "Done" button
          so the dismissal is obvious — same `app.modal.close()` plumbing
          as the in-progress close button above.
        */}
        {isFinal && (
          <div className="PointSystemTradeModal-actions PointSystemTradeModal-actions--final">
            <Button
              className="Button Button--primary"
              onclick={(e: MouseEvent) => {
                e.preventDefault();
                e.stopPropagation();
                this.stopCountdown();
                if (this.pollHandle) {
                  clearInterval(this.pollHandle);
                  this.pollHandle = null;
                }
                app.modal.close();
              }}
            >
              <i className="fas fa-check" /> {t('close_final')}
            </Button>
          </div>
        )}

        {this.err && this.err !== 'no_target' && (
          <p className="PointSystemTradeModal-error">
            <i className="fas fa-exclamation-triangle" /> {t('error_' + this.err) || this.err}
          </p>
        )}
      </div>
    );
  }

  renderItemPicker(yourItems: OfferItem[], owner?: { id?: number; username?: string; displayName?: string; avatarUrl?: string | null }) {
    const owned = (app.session.user?.attribute('ownedDecorationIds') as any[]) || [];
    const onTable = new Set(yourItems.map((i) => `${i.itemType}:${i.itemId}`));
    const candidates = owned
      .map((o: any) => this.resolveItem(o.type, Number(o.id)))
      .filter((it: any) => it && !onTable.has(`${it.itemType}:${it.itemId}`));

    return (
      <div className="PointSystemTradeModal-picker">
        {candidates.length === 0 ? (
          <p className="helpText">{app.translator.trans('ramon-point-system.forum.trade.picker_empty')}</p>
        ) : (
          candidates.map((it: any) => (
            <button
              type="button"
              className="PointSystemTradeModal-pickerItem"
              key={`pick-${it.itemType}-${it.itemId}`}
              onclick={() => this.addItem(it)}
            >
              {this.renderItemThumb(it, owner)}
              <span>{it.name}</span>
            </button>
          ))
        )}
      </div>
    );
  }

  /**
   * Render a realistic preview of the item using the OWNER's actual
   * profile (avatar URL, display name). This way the user sees exactly
   * how the decoration will look on the party that owns it:
   *
   *   - avatar_decoration: owner's avatar with the decoration frame
   *     overlaid (same `.ps-avatar-deco-wrap` / `.ps-avatar-deco`
   *     classes the real post avatar uses).
   *   - cover_decoration: the banner image with the owner's avatar
   *     overlaid as a small profile pic (mini-hero shape).
   *   - name_decoration: the owner's display name rendered with the
   *     decoration's CSS class.
   *   - title_decoration: the title text (already preview-correct;
   *     title text is fixed at the decoration level, not per-user).
   *   - post_highlight_decoration: the owner's display name inside a
   *     post-hl-styled box to suggest the post-border treatment.
   */
  renderItemThumb(it: OfferItem, owner?: { id?: number; username?: string; displayName?: string; avatarUrl?: string | null }) {
    const ownerName = (owner?.displayName || owner?.username || 'Aa').slice(0, 32);
    const avatarUrl = owner?.avatarUrl ?? null;

    if (it.itemType === 'avatar_decoration') {
      const frameSrc = it.imageUrl || it.imagePath || '';
      const frameUrl = frameSrc ? this.resolveAsset(frameSrc) : '';
      const safeFrameUrl = frameUrl.replace(/"/g, '%22');
      return (
        <span className="ps-avatar-deco-wrap PointSystemTradeModal-itemThumb PointSystemTradeModal-itemThumb--avatar">
          {avatarUrl ? (
            <img className="Avatar" src={avatarUrl} alt="" />
          ) : (
            <span className="Avatar PointSystemTradeModal-itemThumb-avatarFallback">{ownerName.charAt(0).toUpperCase()}</span>
          )}
          {frameUrl && <span aria-hidden="true" className="ps-avatar-deco" style={`background-image: url("${safeFrameUrl}");`} />}
        </span>
      );
    }

    if (it.itemType === 'cover_decoration') {
      const coverSrc = it.imageUrl || it.imagePath || '';
      const coverUrl = coverSrc ? this.resolveAsset(coverSrc) : '';
      const safeCoverUrl = coverUrl.replace(/"/g, '%22');
      const coverStyle = coverUrl ? `background-image: url("${safeCoverUrl}"); background-size: cover; background-position: center;` : '';
      return (
        <span className="PointSystemTradeModal-itemThumb PointSystemTradeModal-itemThumb--cover" style={coverStyle}>
          {avatarUrl && <img className="PointSystemTradeModal-itemThumb-coverAvatar Avatar" src={avatarUrl} alt="" />}
        </span>
      );
    }

    if (it.itemType === 'name_decoration' && it.slug) {
      const slug = String(it.slug).replace(/[^a-zA-Z0-9_-]/g, '');
      return (
        <span className={`ps-name-preview ps-name-${slug} PointSystemTradeModal-itemThumb PointSystemTradeModal-itemThumb--name`}>{ownerName}</span>
      );
    }

    if (it.itemType === 'title_decoration' && it.titleText) {
      const slug = String(it.slug || '').replace(/[^a-zA-Z0-9_-]/g, '');
      const safe = String(it.color || '').replace(/[<>"';]/g, '');
      const style = safe ? `--ps-title-color:${safe};` : '';
      return (
        <span className={`ps-title-preview ps-title-${slug} PointSystemTradeModal-itemThumb`} style={style}>
          {it.titleText}
        </span>
      );
    }

    if (it.itemType === 'post_highlight_decoration' && it.slug) {
      const slug = String(it.slug).replace(/[^a-zA-Z0-9_-]/g, '');
      return (
        <span className={`ps-posthl-preview ps-posthl-${slug} PointSystemTradeModal-itemThumb PointSystemTradeModal-itemThumb--postHl`}>
          {ownerName}
        </span>
      );
    }

    return <i className="fas fa-cube PointSystemTradeModal-itemThumb" />;
  }

  itemsForOwner(ownerId: number | undefined): OfferItem[] {
    if (!ownerId || !this.trade) return [];
    return (this.trade.items || [])
      .filter((it: any) => Number(it.ownerId) === Number(ownerId))
      .map((it: any) => this.resolveItem(it.itemType, Number(it.itemId)))
      .filter(Boolean);
  }

  resolveItem(type: string, id: number): OfferItem | null {
    const sources: Record<string, string> = {
      avatar_decoration: 'pointSystemAvatarDecorations',
      name_decoration: 'pointSystemNameDecorations',
      cover_decoration: 'pointSystemCoverDecorations',
      title_decoration: 'pointSystemTitleDecorations',
      post_highlight_decoration: 'pointSystemPostHighlightDecorations',
    };
    const attr = sources[type];
    if (!attr) return { itemType: type, itemId: id };
    const list = (app.forum.attribute(attr) as any[]) || [];
    const found = list.find((d) => Number(d.id) === Number(id));
    if (!found) return { itemType: type, itemId: id, name: `#${id}` };
    return { itemType: type, itemId: id, ...found };
  }

  resolveAsset(path: string): string {
    if (!path) return '';
    if (/^https?:\/\//i.test(path)) return path;
    const base = (app.forum.attribute('assetsBaseUrl') as string | undefined) || (app.forum.attribute('baseUrl') as string) + '/assets';
    return base.replace(/\/+$/, '') + '/' + String(path).replace(/^\/+/, '');
  }

  async addItem(it: OfferItem) {
    if (!this.trade) return;
    const youAre = this.trade.youAre as Side;
    const me = youAre === 'initiator' ? this.trade.initiator : this.trade.recipient;
    const current = this.itemsForOwner(me?.id).map((c) => ({ itemType: c.itemType, itemId: c.itemId }));
    current.push({ itemType: it.itemType, itemId: it.itemId });
    await this.patchOffer({ items: current });
    this.pickerOpen = false;
  }

  async removeItem(it: OfferItem) {
    if (!this.trade) return;
    const youAre = this.trade.youAre as Side;
    const me = youAre === 'initiator' ? this.trade.initiator : this.trade.recipient;
    const current = this.itemsForOwner(me?.id)
      .filter((c) => !(c.itemType === it.itemType && c.itemId === it.itemId))
      .map((c) => ({ itemType: c.itemType, itemId: c.itemId }));
    await this.patchOffer({ items: current });
  }

  async commitPoints() {
    if (!this.trade) return;
    const youAre = this.trade.youAre as Side;
    const serverPoints = youAre === 'initiator' ? this.trade.initiatorPoints : this.trade.recipientPoints;
    const next = Math.max(0, Number(this.pointsDraft) || 0);
    if (next === Number(serverPoints)) return;
    await this.patchOffer({ points: next });
  }

  async patchOffer(payload: any) {
    if (!this.trade) return;
    this.busy = 'setPoints';
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'PATCH',
        url: `${apiUrl}/point-system/trades/${this.trade.id}`,
        body: payload,
      });
      this.applyState(res?.data);
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'patch_failed';
    } finally {
      this.busy = null;
      m.redraw();
    }
  }

  async toggleAccept() {
    if (!this.trade) return;
    // Snapshot whether THIS click is the user setting their side to accepted
    // (vs. un-accepting). The server response replaces local state, so we
    // can't read `yourAccepted` after applyState() to know if it flipped to
    // true on this turn.
    const youAre = this.trade.youAre;
    const wasAccepted = youAre === 'initiator' ? this.trade.initiatorAccepted : this.trade.recipientAccepted;
    this.busy = 'accept';
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/trades/${this.trade.id}/accept`,
        body: {},
      });
      this.applyState(res?.data);

      // If the trade just completed, refresh the user's owned-items cache
      // so the next reopen of My Decorations reflects the new inventory.
      // The server moves ShopClaim rows so a fresh /api/users/{me} call
      // would update ownedDecorationIds; rather than re-fetching the whole
      // user, we reconcile locally below.
      if (this.trade.status === 'completed') {
        this.reconcileLocalOwnership();
        app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.trade.completed_alert'));
        return;
      }

      // Unblock the user when they JUST accepted and the trade is still
      // pending (other side hasn't accepted yet). Keeping the modal open
      // forces them to either babysit the trade or hit X to close — but
      // either way the server-side state is already saved. Auto-dismiss
      // and surface a "waiting for the other side" toast so they can
      // continue browsing; the trade is reachable from the Trades tab /
      // trade-history page when the other side acts.
      const nowAccepted = youAre === 'initiator' ? this.trade.initiatorAccepted : this.trade.recipientAccepted;
      const theirAccept = youAre === 'initiator' ? this.trade.recipientAccepted : this.trade.initiatorAccepted;
      if (!wasAccepted && nowAccepted && !theirAccept) {
        app.alerts.show({ type: 'success' }, app.translator.trans('ramon-point-system.forum.trade.accepted_waiting_alert'));
        this.hide();
      }
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'accept_failed';
    } finally {
      this.busy = null;
      m.redraw();
    }
  }

  async cancel() {
    if (!this.trade) return;
    if (!confirm(app.translator.trans('ramon-point-system.forum.trade.confirm_cancel') as string)) return;
    this.busy = 'cancel';
    m.redraw();
    try {
      const apiUrl = (app.forum.attribute('apiUrl') || '/api').replace(/\/+$/, '');
      const res: any = await app.request({
        method: 'POST',
        url: `${apiUrl}/point-system/trades/${this.trade.id}/cancel`,
        body: {},
      });
      this.applyState(res?.data);
    } catch (e: any) {
      this.err = e?.response?.errors?.[0]?.detail || 'cancel_failed';
    } finally {
      this.busy = null;
      m.redraw();
    }
  }

  /**
   * Update the local user's ownedDecorationIds and pointBalance to reflect a
   * completed trade. Server is authoritative; this is just a UI nudge so
   * the user doesn't have to refresh to see the change.
   */
  reconcileLocalOwnership() {
    const user = app.session.user;
    if (!user || !this.trade) return;

    const meId = Number(user.id());
    const owned = ((user.attribute('ownedDecorationIds') as any[]) || []).slice();
    const givenAway = this.trade.items.filter((it: any) => Number(it.ownerId) === meId);
    const received = this.trade.items.filter((it: any) => Number(it.ownerId) !== meId);

    const filtered = owned.filter((o: any) => !givenAway.some((g: any) => g.itemType === o.type && Number(g.itemId) === Number(o.id)));
    for (const r of received) {
      filtered.push({ type: r.itemType, id: r.itemId });
    }

    const myPoints = this.trade.youAre === 'initiator' ? this.trade.initiatorPoints : this.trade.recipientPoints;
    const theirPoints = this.trade.youAre === 'initiator' ? this.trade.recipientPoints : this.trade.initiatorPoints;
    const balance = Math.max(0, Number(user.attribute('pointBalance') ?? 0) - Number(myPoints) + Number(theirPoints));

    user.pushAttributes({ ownedDecorationIds: filtered, pointBalance: balance });
  }
}
