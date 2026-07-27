<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Tests\unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\PointSystem\Support\CssSanitizer;

/**
 * O CSS saneado aqui vai para dentro de um `<style>` em TODA página do fórum.
 * Um único escape de `</style>` seria XSS armazenado com autoria de admin, e
 * compromisso de conta admin faz parte do modelo de ameaça — por isso o
 * allowlist roda na escrita E na emissão. Estes testes travam o comportamento
 * do allowlist para que um refator não afrouxe a barreira em silêncio.
 */
class CssSanitizerTest extends TestCase
{
    public function test_null_passa_direto(): void
    {
        $this->assertNull(CssSanitizer::sanitize(null));
    }

    public function test_css_legitimo_sobrevive(): void
    {
        $css = 'color: #ff0000; font-weight: bold; text-shadow: 0 0 4px gold;';

        $this->assertSame($css, CssSanitizer::sanitize($css));
    }

    public function test_keyframes_sao_preservados(): void
    {
        $out = CssSanitizer::sanitize('@keyframes pulse { from { opacity: 0 } to { opacity: 1 } }');

        $this->assertStringContainsString('@keyframes', $out);
    }

    public function test_corta_no_tamanho_maximo(): void
    {
        $out = CssSanitizer::sanitize(str_repeat('a', CssSanitizer::MAX_LENGTH + 500));

        $this->assertSame(CssSanitizer::MAX_LENGTH, mb_strlen((string) $out));
    }

    /**
     * Cada payload precisa perder a primitiva perigosa. Não afirmamos a saída
     * exata — o que importa é o token de ataque não sobreviver.
     */
    #[DataProvider('payloadsPerigosos')]
    public function test_neutraliza_payload(string $entrada, string $tokenProibido): void
    {
        $out = (string) CssSanitizer::sanitize($entrada);

        $this->assertStringNotContainsStringIgnoringCase($tokenProibido, $out);
    }

    public static function payloadsPerigosos(): array
    {
        return [
            'quebra de style'      => ['color:red}</style><script>alert(1)</script>', '</style'],
            'tag script'           => ['background: url(x)</style ><script >x', '<script'],
            'expression legado IE' => ['width: expression(alert(1));', 'expression('],
            'behavior htc'         => ['behavior: url(evil.htc);', 'behavior:'],
            'moz-binding xbl'      => ['-moz-binding: url(evil.xml#x);', '-moz-binding:'],
            'url javascript'       => ['background: url("javascript:alert(1)");', 'javascript:'],
            'url data'             => ['background: url(data:text/html;base64,PHN2Zz4=);', 'data:'],
            'import'               => ['@import url("//evil.example/x.css");', '@import'],
            'font-face'            => ['@font-face { src: url(//evil.example/f.woff) }', '@font-face'],
            'charset'              => ['@charset "utf-8";', '@charset'],
            'namespace'            => ['@namespace svg url(http://www.w3.org/2000/svg);', '@namespace'],
        ];
    }

    /**
     * Escape hexadecimal CSS é o bypass clássico de blocklist: `\69mport`
     * decodifica para `import` só no parser do browser. O sanitizer normaliza
     * ANTES de aplicar o blocklist justamente para fechar isso.
     */
    public function test_escape_hex_nao_burla_o_blocklist(): void
    {
        $out = (string) CssSanitizer::sanitize('@\\69 mport url("//evil.example/x.css");');

        $this->assertStringNotContainsStringIgnoringCase('import url', $out);
    }

    /**
     * `position: fixed` + `display: none` são os tijolos de overlay phishing
     * (cobrir a página inteira com um formulário falso).
     */
    public function test_primitivas_de_overlay_sao_desarmadas(): void
    {
        $fixed = (string) CssSanitizer::sanitize('position: fixed; inset: 0; z-index: 99999;');
        $this->assertStringNotContainsStringIgnoringCase('position:fixed', str_replace(' ', '', $fixed));
        $this->assertStringContainsString('position:static', $fixed);

        $hidden = (string) CssSanitizer::sanitize('display: none;');
        $this->assertStringNotContainsStringIgnoringCase('display:none', str_replace(' ', '', $hidden));
    }

    /**
     * Idempotência importa porque o sanitizer roda duas vezes no caminho real
     * (escrita no resource + emissão no ForumAttributes). Se a segunda passada
     * alterasse a saída, o CSS salvo divergiria do CSS servido.
     */
    #[DataProvider('payloadsPerigosos')]
    public function test_e_idempotente(string $entrada): void
    {
        $uma = (string) CssSanitizer::sanitize($entrada);
        $duas = (string) CssSanitizer::sanitize($uma);

        $this->assertSame($uma, $duas);
    }
}
