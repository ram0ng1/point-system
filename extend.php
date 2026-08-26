<?php

/*
 * This file is part of ramon/point-system.
 *
 * Copyright (c) 2026 Ramon Guilherme.
 *
 * For the full copyright and license information, please view the LICENSE.md
 * file that was distributed with this source code.
 */

namespace Ramon\PointSystem;

use Flarum\Api\Endpoint;
use Flarum\Api\Resource\DiscussionResource;
use Flarum\Api\Resource\ForumResource;
use Flarum\Api\Resource\NotificationResource;
use Flarum\Api\Resource\PostResource;
use Flarum\Api\Resource\UserResource;
use Flarum\Discussion\Event\Started as DiscussionStarted;
use Flarum\Extend;
use Flarum\Post\Event\Posted as PostPosted;
use Flarum\User\Event\LoggedIn as UserLoggedIn;
use Flarum\User\Event\Registered as UserRegistered;

$extenders = [
    (new Extend\ServiceProvider())
        ->register(PointSystemServiceProvider::class),

    (new Extend\Frontend('forum'))
        ->js(__DIR__.'/js/dist/forum.js')
        ->css(__DIR__.'/less/forum.less')
        ->route('/rewards', 'pointSystem.shop')
        ->route('/rewards/{tab}', 'pointSystem.shop.tab')
        ->route('/decorations', 'pointSystem.decorations')
        ->route('/decorations/{tab}', 'pointSystem.decorations.tab')
        ->route('/trades', 'pointSystem.trades'),

    (new Extend\Frontend('admin'))
        ->js(__DIR__.'/js/dist/admin.js')
        ->css(__DIR__.'/less/admin.less'),

    new Extend\Locales(__DIR__.'/locale'),

    // ── Models ───────────────────────────────────────────────────────────────
    (new Extend\Model(\Flarum\User\User::class))
        ->hasOne('pointsBalance', \Ramon\PointSystem\Model\UserPoints::class, 'user_id'),

    // ── Event listeners — earn points on core actions ────────────────────────
    (new Extend\Event())
        ->listen(DiscussionStarted::class, Listener\AwardDiscussionPoints::class)
        ->listen(PostPosted::class, Listener\AwardPostPoints::class)
        ->listen(UserRegistered::class, Listener\InitUserPoints::class)
        ->listen(UserLoggedIn::class, Listener\AwardDailyLoginBonus::class)
        // ── Notification dispatch (mirrors verified's event→listener pattern;
        //    NotificationSyncer fans out to all drivers incl. flarum/realtime) ──
        ->listen(\Ramon\PointSystem\Event\PointsManuallyChanged::class, Listener\SendNotificationWhenPointsChanged::class)
        // Concessão automática (pontos por ação). O evento é levantado pelo
        // repositório em TODA mutação de saldo; o listener filtra valor
        // positivo + motivo automático + as chaves de volume.
        ->listen(\Ramon\PointSystem\Event\PointsAwarded::class, Listener\SendNotificationWhenPointsEarned::class)
        ->listen(\Ramon\PointSystem\Event\TierClaimed::class, Listener\SendNotificationWhenTierClaimed::class)
        ->listen(\Ramon\PointSystem\Event\ItemGranted::class, Listener\SendNotificationWhenItemGranted::class)
        ->listen(\Ramon\PointSystem\Event\TradeRequested::class, Listener\SendNotificationWhenTradeRequested::class)
        ->listen(\Ramon\PointSystem\Event\TradeAccepted::class, Listener\SendNotificationWhenTradeAccepted::class)
        ->listen(\Ramon\PointSystem\Event\TradeCompleted::class, Listener\SendNotificationWhenTradeCompleted::class),

    // Conditional: flarum/likes ─ award points to author + liker
    (new Extend\Conditional())
        ->whenExtensionEnabled('flarum-likes', fn () => [
            (new Extend\Event())
                ->listen(\Flarum\Likes\Event\PostWasLiked::class, Listener\AwardLikePoints::class)
                ->listen(\Flarum\Likes\Event\PostWasUnliked::class, Listener\RevertLikePoints::class),
        ]),

    // ── API ──────────────────────────────────────────────────────────────────
    /*
     * `alert` = sino + linha na tabela `notifications`. `realtime` = push por
     * websocket, driver que o flarum/realtime registra; nomes de driver não
     * instalados são simplesmente ignorados no registro, então listar
     * `realtime` aqui é seguro em fóruns sem a extensão e documenta a
     * intenção para quem for ler.
     */
    (new Extend\Notification())
        ->type(\Ramon\PointSystem\Notification\PointsEarnedBlueprint::class, ['alert', 'realtime'])
        ->type(\Ramon\PointSystem\Notification\PointsManualBlueprint::class, ['alert'])
        ->type(\Ramon\PointSystem\Notification\TierClaimedBlueprint::class, ['alert'])
        ->type(\Ramon\PointSystem\Notification\ItemGrantedBlueprint::class, ['alert'])
        ->type(\Ramon\PointSystem\Notification\TradeRequestedBlueprint::class, ['alert'])
        ->type(\Ramon\PointSystem\Notification\TradeAcceptedBlueprint::class, ['alert'])
        ->type(\Ramon\PointSystem\Notification\TradeCompletedBlueprint::class, ['alert']),

    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\ShopItemResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\AvatarDecorationResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\NameDecorationResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\CoverDecorationResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\TitleDecorationResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\PostHighlightDecorationResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\GroupOfferResource::class)),
    (new Extend\ApiResource(\Ramon\PointSystem\Api\Resource\ShopClaimResource::class)),

    // `eagerLoad` da relação de pontos: sem ele, cada usuário serializado
    // dispara um SELECT próprio em UserPoints (post stream com 20 autores = 20
    // queries). O WeakMap de UserFields só deduplica getters do MESMO usuário.
    (new Extend\ApiResource(UserResource::class))
        ->fields(Api\UserFields::class)
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad(Api\UserFields::EAGER_LOAD)
        ),

    /*
     * O eager-load acima cobre SÓ /api/users. Quando o usuário chega como
     * include de outro recurso — autor no post stream, `lastPostedUser` na
     * lista de discussões, `fromUser` na notificação — quem manda é o
     * endpoint em execução: o EloquentBuffer aplica
     * `$endpoint->getEagerLoadsFor('user', ...)`, ou seja, só as relações
     * registradas com o prefixo daquela relação.
     *
     * Sem estes três extenders, uma listagem de posts fazia um SELECT em
     * `point_system_user_points` por autor distinto — e o post stream é a
     * página mais quente do fórum. Medido com query log em 2026-08-25:
     * 8 autores distintos = 8 queries antes, 1 depois.
     */
    (new Extend\ApiResource(PostResource::class))
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad(
                Api\UserFields::eagerLoadVia('user')
            )
        ),

    (new Extend\ApiResource(DiscussionResource::class))
        ->endpoint(
            [Endpoint\Index::class, Endpoint\Show::class],
            fn (Endpoint\Index|Endpoint\Show $endpoint) => $endpoint->eagerLoad(array_merge(
                Api\UserFields::eagerLoadVia('user'),
                Api\UserFields::eagerLoadVia('lastPostedUser'),
            ))
        ),

    (new Extend\ApiResource(NotificationResource::class))
        ->endpoint(
            [Endpoint\Index::class],
            fn (Endpoint\Index $endpoint) => $endpoint->eagerLoad(
                Api\UserFields::eagerLoadVia('fromUser')
            )
        ),

    (new Extend\ApiResource(ForumResource::class))
        ->fields(Api\ForumAttributes::class),

    (new Extend\Routes('api'))
        ->post('/point-system/claim/{id}', 'pointSystem.claim', Controller\ClaimItemController::class)
        ->post('/point-system/tier-claim', 'pointSystem.tierClaim', Controller\ClaimTierController::class)
        ->post('/point-system/equip', 'pointSystem.equip', Controller\EquipDecorationController::class)
        ->post('/point-system/unequip', 'pointSystem.unequip', Controller\UnequipDecorationController::class)
        ->post('/point-system/avatar-decoration/upload', 'pointSystem.avatarDeco.upload', Controller\UploadAvatarDecorationController::class)
        ->delete('/point-system/avatar-decoration/{id}', 'pointSystem.avatarDeco.delete', Controller\DeleteAvatarDecorationController::class)
        ->post('/point-system/cover-decoration/upload', 'pointSystem.coverDeco.upload', Controller\UploadCoverDecorationController::class)
        ->delete('/point-system/cover-decoration/{id}', 'pointSystem.coverDeco.delete', Controller\DeleteCoverDecorationController::class)
        ->post('/point-system/award', 'pointSystem.award', Controller\ManualAwardController::class)
        ->post('/point-system/bulk-award', 'pointSystem.bulkAward', Controller\BulkAwardController::class)
        ->post('/point-system/grant', 'pointSystem.grant', Controller\GrantItemController::class)
        // ── Trades ──────────────────────────────────────────────────────
        ->get('/point-system/trades', 'pointSystem.trades.list', Controller\ListTradesController::class)
        ->post('/point-system/trades', 'pointSystem.trades.open', Controller\OpenTradeController::class)
        ->get('/point-system/trades/{id:[0-9]+}', 'pointSystem.trades.show', Controller\ShowTradeController::class)
        ->patch('/point-system/trades/{id:[0-9]+}', 'pointSystem.trades.update', Controller\UpdateTradeOfferController::class)
        ->post('/point-system/trades/{id:[0-9]+}/accept', 'pointSystem.trades.accept', Controller\AcceptTradeController::class)
        ->post('/point-system/trades/{id:[0-9]+}/finalize', 'pointSystem.trades.finalize', Controller\FinalizeTradeController::class)
        ->post('/point-system/trades/{id:[0-9]+}/cancel', 'pointSystem.trades.cancel', Controller\CancelTradeController::class)
        // ── User-submission moderation queue ──────────────────────────
        ->get('/point-system/submissions', 'pointSystem.submissions.list', Controller\ListPendingSubmissionsController::class)
        ->post('/point-system/submissions/{type}/{id:[0-9]+}/{action}', 'pointSystem.submissions.moderate', Controller\ModerateSubmissionController::class)
        // ── Admin trades dashboard ────────────────────────────────────
        ->get('/point-system/admin/trades', 'pointSystem.admin.trades.list', Controller\ListAllTradesController::class)
        ->post('/point-system/admin/trades/{id:[0-9]+}/revert', 'pointSystem.admin.trades.revert', Controller\RevertTradeController::class),

    // ── Permissions ──────────────────────────────────────────────────────────
    // ShopItemPolicy is registered as a global policy (it has no `$model`)
    // so any `assertCan('manage')` against the shop family routes through it.
    // AvatarDecorationPolicy is the per-row policy invoked by Endpoint->can().
    (new Extend\Policy())
        ->modelPolicy(Model\AvatarDecoration::class, Access\AvatarDecorationPolicy::class)
        ->globalPolicy(Access\ShopItemPolicy::class),

    // ── Settings ─────────────────────────────────────────────────────────────
    (new Extend\Settings())
        ->serializeToForum('pointSystem.enabled', 'point-system.enabled', 'boolval')
        ->serializeToForum('pointSystem.auto_awards_enabled', 'point-system.auto_awards_enabled', 'boolval')
        ->serializeToForum('pointSystem.points_per_discussion', 'point-system.points_per_discussion', 'intval')
        ->serializeToForum('pointSystem.points_per_post', 'point-system.points_per_post', 'intval')
        ->serializeToForum('pointSystem.points_per_like_received', 'point-system.points_per_like_received', 'intval')
        ->serializeToForum('pointSystem.points_per_like_given', 'point-system.points_per_like_given', 'intval')
        ->serializeToForum('pointSystem.points_per_registration', 'point-system.points_per_registration', 'intval')
        ->serializeToForum('pointSystem.daily_login_bonus', 'point-system.daily_login_bonus', 'intval')
        ->serializeToForum('pointSystem.currency_name', 'point-system.currency_name')
        ->serializeToForum('pointSystem.currency_icon', 'point-system.currency_icon')
        ->serializeToForum('pointSystem.points_short', 'point-system.points_short')
        ->serializeToForum('pointSystem.show_in_post_header', 'point-system.show_in_post_header', 'boolval')
        ->serializeToForum('pointSystem.show_in_user_profile', 'point-system.show_in_user_profile', 'boolval')
        ->serializeToForum('pointSystem.lifetime_enabled', 'point-system.lifetime_enabled', 'boolval')
        ->serializeToForum('pointSystem.auto_group_enabled', 'point-system.auto_group_enabled', 'boolval')
        ->serializeToForum('pointSystem.avatar_deco_enabled', 'point-system.avatar_deco_enabled', 'boolval')
        ->serializeToForum('pointSystem.name_deco_enabled', 'point-system.name_deco_enabled', 'boolval')
        ->serializeToForum('pointSystem.cover_deco_enabled', 'point-system.cover_deco_enabled', 'boolval')
        ->serializeToForum('pointSystem.title_deco_enabled', 'point-system.title_deco_enabled', 'boolval')
        ->serializeToForum('pointSystem.post_hl_deco_enabled', 'point-system.post_hl_deco_enabled', 'boolval')
        ->serializeToForum('pointSystem.deco_in_posts', 'point-system.deco_in_posts', 'boolval')
        ->serializeToForum('pointSystem.deco_in_user_card', 'point-system.deco_in_user_card', 'boolval')
        ->serializeToForum('pointSystem.deco_in_lists', 'point-system.deco_in_lists', 'boolval')
        ->serializeToForum('pointSystem.avatar_deco_in_lists', 'point-system.avatar_deco_in_lists', 'boolval')
        ->serializeToForum('pointSystem.hide_badges_with_avatar_deco', 'point-system.hide_badges_with_avatar_deco', 'boolval')
        ->serializeToForum('pointSystem.trade_enabled', 'point-system.trade_enabled', 'boolval')
        ->serializeToForum('pointSystem.user_submissions_enabled', 'point-system.user_submissions_enabled', 'boolval')
        /*
         * Nota livre do admin exibida no painel "Como ganhar pontos". Vai
         * como TEXTO — o frontend renderiza em nó de texto do Mithril, nunca
         * com `m.trust`, então HTML colado aqui aparece escapado em vez de
         * virar markup executável (CLAUDE.md §21).
         */
        ->serializeToForum('pointSystem.earn_help_extra', 'point-system.earn_help_extra')
        ->default('point-system.enabled', true)
        ->default('point-system.auto_awards_enabled', true)
        /*
         * Notificações de concessão: DESLIGADAS por padrão. Ligar isto num
         * fórum existente começaria a alertar todo mundo sem aviso, e sem a
         * chave `notify_bonus_only` (ligada por padrão) seria um alerta por
         * post e por curtida.
         *
         * Nenhuma das duas vai para `serializeToForum`: quem as lê é o
         * listener no servidor e o painel admin (via `app.data.settings`).
         * O fórum não consulta nenhuma delas, então mandá-las no payload de
         * toda página, para todo visitante inclusive guest, seria peso sem
         * função (§21/§38.4).
         */
        ->default('point-system.notify_on_award', false)
        ->default('point-system.notify_bonus_only', true)
        ->default('point-system.points_per_discussion', 10)
        ->default('point-system.points_per_post', 5)
        ->default('point-system.points_per_like_received', 2)
        ->default('point-system.points_per_like_given', 1)
        ->default('point-system.points_per_registration', 50)
        ->default('point-system.daily_login_bonus', 5)
        ->default('point-system.currency_name', 'Points')
        ->default('point-system.currency_icon', 'fas fa-coins')
        ->default('point-system.points_short', 'pts')
        ->default('point-system.show_in_post_header', true)
        ->default('point-system.show_in_user_profile', true)
        ->default('point-system.lifetime_enabled', true)
        ->default('point-system.auto_group_enabled', true)
        ->default('point-system.avatar_deco_enabled', true)
        ->default('point-system.name_deco_enabled', true)
        ->default('point-system.cover_deco_enabled', true)
        ->default('point-system.title_deco_enabled', true)
        ->default('point-system.post_hl_deco_enabled', true)
        ->default('point-system.deco_in_posts', true)
        ->default('point-system.deco_in_user_card', true)
        ->default('point-system.deco_in_lists', true)
        ->default('point-system.avatar_deco_in_lists', true)
        ->default('point-system.hide_badges_with_avatar_deco', false)
        ->default('point-system.trade_enabled', true)
        ->default('point-system.user_submissions_enabled', false)
        ->default('point-system.earn_help_extra', ''),
];

// ── GDPR (opcional) ──────────────────────────────────────────────────────────
// `class_exists` e não `ExtensionManager->isEnabled()`: o autoload do composer
// já está resolvido quando este arquivo é lido, o estado do gerenciador de
// extensões não necessariamente. flarum/gdpr fica em `suggest` — a extensão
// precisa bootar igual em fóruns que não o instalaram.
if (class_exists(\Flarum\Gdpr\Extend\UserData::class)) {
    $extenders[] = (new \Flarum\Gdpr\Extend\UserData())
        ->addType(Gdpr\PointSystemData::class);
}

return $extenders;
