# Image asset sources

- `jaesuni-home.webp`: imagegen banner based on the character and concept selected by the user. Temporary character artwork, to be revised later.
- `jaesuni-resting.webp`: chibi artwork of 재순이 holding a "currently unavailable" sign, supplied by the user for the "resting without an API key" notice. Processing only: background removed with rembg (`isnet-anime` model), 1px edge cleanup, cropped and resized to 720px wide. The sign text ("앗! 현재 사용할 수 없어요 / 잠시 후 다시 시도해주세요") is part of the supplied artwork. Rights stay with the artwork's creator/the user.
- `steam-section.webp`, `lol-section.webp`, `community-section.webp`: imagegen decorative gaming-club artwork created for the user's request for stronger graphics. No generated service logos or actual rank insignia.
- `games/413150.jpg`, `games/1966720.jpg`, `games/105600.jpg`: Steam store header images, downloaded from `https://shared.fastly.steamstatic.com/store_item_assets/steam/apps/<appid>/header.jpg`.
- `ranks/*.png`: Riot Games developer ranked-emblems asset bundle, `https://static.developer.riotgames.com/docs/lol/ranked-emblems.zip`. Only used emblem files retained.
- Summoner profile icons: Riot Data Dragon, verified version `16.19.1`, `https://ddragon.leagueoflegends.com/cdn/16.19.1/img/profileicon/<id>.png`.
- Member avatars: existing Discord/Steam profile image URLs returned by the app.

Game and service artwork remains the property of its respective owners. The home game selection is editorial; it does not claim that members own those games. Logo and UI icon attribution is in `public/brands/SOURCES.md`.
