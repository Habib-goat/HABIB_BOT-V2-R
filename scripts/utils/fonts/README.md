# Fonts folder

Drop these 4 font files here (exact filenames matter — the generator looks
for them by name):

| File                     | Get it from (Google Fonts, free)          |
|--------------------------|--------------------------------------------|
| Poppins-Bold.ttf         | https://fonts.google.com/specimen/Poppins  |
| Poppins-Regular.ttf      | https://fonts.google.com/specimen/Poppins  |
| HindSiliguri-Bold.ttf    | https://fonts.google.com/specimen/Hind+Siliguri |
| HindSiliguri-Regular.ttf | https://fonts.google.com/specimen/Hind+Siliguri |

If you skip this step, the bot still works — it just falls back to
whatever fonts are installed on the server (the Dockerfile already
installs `fonts-noto`, which covers Bangla). Adding these 4 files just
makes the English title font match the sample designs exactly and
guarantees Bangla renders correctly even outside Docker.

No code changes needed — just place the `.ttf` files in this folder.
