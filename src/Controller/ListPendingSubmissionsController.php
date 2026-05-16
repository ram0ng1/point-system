<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Controller;

use Flarum\Http\RequestUtil;
use Illuminate\Support\Facades\Schema;
use Laminas\Diactoros\Response\JsonResponse;
use Psr\Http\Message\ResponseInterface;
use Psr\Http\Message\ServerRequestInterface;
use Psr\Http\Server\RequestHandlerInterface;
use Psr\Log\LoggerInterface;
use Ramon\PointSystem\Model\AvatarDecoration;
use Ramon\PointSystem\Model\CoverDecoration;
use Ramon\PointSystem\Model\NameDecoration;
use Ramon\PointSystem\Model\PostHighlightDecoration;
use Ramon\PointSystem\Model\ShopClaim;
use Ramon\PointSystem\Model\TitleDecoration;
use Throwable;

/**
 * GET /api/point-system/submissions (admin only)
 *
 * Returns every pending decoration submission across all five families,
 * each row flattened to a polymorphic shape consumed by the admin
 * "Pending submissions" panel.
 *
 * Resilience: each family is wrapped in its own try/catch and gated on a
 * `Schema::hasColumn(...)` check for the `status` column. If the
 * 2026_05_16_000004 migration is pending (or partially applied), the
 * affected family is skipped and a warning is logged instead of the whole
 * endpoint 500-ing.
 */
class ListPendingSubmissionsController implements RequestHandlerInterface
{
    public function __construct(
        protected LoggerInterface $logger,
    ) {}

    public function handle(ServerRequestInterface $request): ResponseInterface
    {
        $actor = RequestUtil::getActor($request);
        $actor->assertCan('pointSystem.manage');

        $families = [
            [ShopClaim::TYPE_AVATAR,  AvatarDecoration::class],
            [ShopClaim::TYPE_NAME,    NameDecoration::class],
            [ShopClaim::TYPE_COVER,   CoverDecoration::class],
            [ShopClaim::TYPE_TITLE,   TitleDecoration::class],
            [ShopClaim::TYPE_POST_HL, PostHighlightDecoration::class],
        ];

        $rows = [];

        foreach ($families as [$type, $modelClass]) {
            try {
                $table = (new $modelClass())->getTable();

                // Skip families whose `status` column doesn't exist yet —
                // happens when the 2026_05_16_000004 migration is pending
                // for a particular table. The admin sees the other
                // families' submissions instead of a 500 on the whole queue.
                if (! Schema::hasColumn($table, 'status')) {
                    $this->logger->warning('point-system: submissions table missing `status` column, run `php flarum migrate`', [
                        'table' => $table,
                    ]);
                    continue;
                }

                // Small admin queue — load all rows in one shot. No chunking
                // (chunk() needs a unique orderBy and gets pedantic about
                // pagination semantics; `get()` here is fine because the
                // queue size is bounded by admin attention).
                $items = $modelClass::query()
                    ->where('status', 'pending')
                    ->with('creator')
                    ->orderBy('created_at')
                    ->get();

                foreach ($items as $d) {
                    $creator = $d->creator_id ? $d->creator : null;
                    $rows[] = [
                        'type'        => $type,
                        'id'          => (int) $d->id,
                        'name'        => (string) $d->name,
                        'description' => $d->description,
                        'imageUrl'    => $d->image_url ?? null,
                        'imagePath'   => $d->image_path ?? null,
                        'preset'      => $d->preset ?? null,
                        'customCss'   => $d->custom_css ?? null,
                        'titleText'   => $d->title_text ?? null,
                        'color'       => $d->color ?? null,
                        'slug'        => $d->slug ?? null,
                        'price'       => (int) ($d->price ?? 0),
                        'creatorId'   => $d->creator_id !== null ? (int) $d->creator_id : null,
                        'creator'     => $creator ? [
                            'username'    => (string) $creator->username,
                            'displayName' => (string) ($creator->display_name ?? $creator->username),
                            'avatarUrl'   => $creator->avatar_url ?: null,
                        ] : null,
                        'createdAt'   => optional($d->created_at)?->toIso8601String(),
                    ];
                }
            } catch (Throwable $e) {
                // One bad family shouldn't take the whole admin queue down.
                // Log the underlying SQL error so the admin can see it in
                // storage/logs/flarum.log and react (most likely: re-run
                // `php flarum migrate`).
                $this->logger->warning('point-system: failed to load submissions for family', [
                    'type'  => $type,
                    'error' => $e->getMessage(),
                ]);
            }
        }

        usort($rows, fn ($a, $b) => strcmp((string) $a['createdAt'], (string) $b['createdAt']));

        return new JsonResponse(['data' => $rows]);
    }
}
