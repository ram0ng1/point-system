<?php

declare(strict_types=1);

namespace Ramon\PointSystem\Tests\unit;

use PHPUnit\Framework\Attributes\DataProvider;
use PHPUnit\Framework\TestCase;
use Ramon\PointSystem\Support\RemoteImageUrl;

/**
 * A URL validada aqui é gravada na linha da decoração, servida no payload
 * público do fórum e renderizada em `<img src>` no navegador de todo mundo.
 * O contrato é: só http/https absolutos, nada de esquema exótico, nada de
 * host malformado.
 */
class RemoteImageUrlTest extends TestCase
{
    #[DataProvider('urlsValidas')]
    public function test_aceita_url_valida(string $url): void
    {
        $this->assertSame($url, RemoteImageUrl::validate($url));
    }

    public static function urlsValidas(): array
    {
        return [
            'https simples'     => ['https://cdn.example.com/frame.png'],
            'http simples'      => ['http://cdn.example.com/frame.png'],
            'com porta'         => ['https://cdn.example.com:8443/frame.png'],
            'com query'         => ['https://cdn.example.com/f.png?v=2&size=large'],
            'com fragmento'     => ['https://cdn.example.com/sprite.svg#frame-1'],
            'esquema maiusculo' => ['HTTPS://cdn.example.com/frame.png'],
        ];
    }

    public function test_apara_espacos_em_volta(): void
    {
        $this->assertSame(
            'https://cdn.example.com/frame.png',
            RemoteImageUrl::validate('   https://cdn.example.com/frame.png   ')
        );
    }

    #[DataProvider('urlsRejeitadas')]
    public function test_rejeita(string $url): void
    {
        $this->assertNull(RemoteImageUrl::validate($url));
    }

    public static function urlsRejeitadas(): array
    {
        return [
            'vazia'                => [''],
            'so espacos'           => ['    '],
            'javascript'           => ['javascript:alert(1)'],
            'data uri'             => ['data:image/svg+xml;base64,PHN2Zz48L3N2Zz4='],
            'file local'           => ['file:///etc/passwd'],
            'vbscript'             => ['vbscript:msgbox(1)'],
            'ftp'                  => ['ftp://example.com/frame.png'],
            'unc windows'          => ['\\\\servidor\\share\\frame.png'],
            'protocolo relativo'   => ['//cdn.example.com/frame.png'],
            'caminho relativo'     => ['/assets/frame.png'],
            'sem host'             => ['https://'],
            'so o esquema'         => ['https:'],
            'quebra de linha'      => ["https://cdn.example.com/a\nb.png"],
            'null byte'            => ["https://cdn.example.com/a\0b.png"],
            'espaco no host'       => ['https://cdn example.com/frame.png'],
            'javascript disfarcado' => ['java\tscript:alert(1)'],
        ];
    }

    public function test_rejeita_acima_do_limite_de_tamanho(): void
    {
        $longa = 'https://cdn.example.com/' . str_repeat('a', 1100) . '.png';

        $this->assertGreaterThan(1024, strlen($longa));
        $this->assertNull(RemoteImageUrl::validate($longa));
    }

    public function test_aceita_no_limite_de_tamanho(): void
    {
        $prefixo = 'https://cdn.example.com/';
        $sufixo = '.png';
        $enchimento = str_repeat('a', 1024 - strlen($prefixo) - strlen($sufixo));
        $url = $prefixo . $enchimento . $sufixo;

        $this->assertSame(1024, strlen($url));
        $this->assertSame($url, RemoteImageUrl::validate($url));
    }
}
