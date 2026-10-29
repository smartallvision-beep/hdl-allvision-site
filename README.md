# hdl.allvision.by → hdl.by

Готовые файлы сайта HDL от ЧТУП «ОллВижн». Собираются скриптом `build.py` из рабочей папки
`D:\Work\Умный дом и электромонтаж\HDL\Сайт hdl.by`, здесь руками не правятся.

- `index.html` и папки `katalog/`, `smeta/`, `gostinicy/`, `dokumentaciya/`, `uslugi/`, `o-kompanii/`, `kontakty/`,
  `politika-personalnyh-dannyh/` — страницы; `assets/` — стили, скрипт, данные сметы; `img/` — картинки; `files/` — паспорта и каталоги PDF
- `lead.php` — приём заявок: Telegram и копия в `hdl-data/` вне папки сайта
- `config.example.php` — образец настроек; настоящий `config.php` с токеном бота лежит только на сервере

Сервер hoster.by раз в минуту забирает изменения из ветки `main`.
