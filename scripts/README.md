# Riyad Bot Pinterest / result collage update

এই folder-এ bot-এ বসানোর জন্য আপডেটেড command এবং utility file আছে:

- `utils/resultCollage.js`
  - YouTube result collage-এ thumbnail এখন 16:9।
  - YouTube-এর আগের 10-result row layout রাখা হয়েছে।
  - Pinterest-এর জন্য আলাদা collage: 2 column × 5 row, মোট সর্বোচ্চ 10টি result।
  - Pinterest tile 1:1; title সবসময় দেখায় এবং video হলে duration দেখায়।
- `commands/pinterest.js`
  - `pin <query>` শুধু photo/image result রাখে।
  - `pin V <query>` শুধু video result রাখে।
  - image mode-এ video এবং GIF বাদ যায়; video mode-এ GIF বাদ দেওয়া হয় না।
  - duplicate result বাদ দিয়ে সর্বোচ্চ 10টি result রাখে।
- `commands/video.js`, `commands/lyricsvideo.js`, `commands/song.js`
  - 16:9 collage flow আগের মতো রেখে download path দ্রুত করা হয়েছে।
  - direct YouTube link থাকলে video command search/collage skip করে।
- `utils/mediaDownload.js`
  - পুরো media আগে memory-তে না রেখে stream করে disk-এ লেখে।
  - একই video/audio format-এর download link 60 সেকেন্ড cache করে।
  - একই সময়ে একই link resolve হলে duplicate `yt-dlp` request করে না।

## দ্রুত result পাওয়ার জন্য

`utils/resultCollage.js`-এ YouTube-এর `mqdefault.jpg` আগে নেওয়া হচ্ছে। এটি
16:9-ই থাকে, কিন্তু `maxresdefault.jpg`-এর চেয়ে অনেক ছোট—তাই collage দ্রুত
তৈরি হয়। একই 10টি result আবার এলে পুরো PNG collage 5 মিনিট cache থেকেও আসবে।

Video/audio selected হওয়ার পর দেরি হলে সেটি collage-এর সমস্যা নয়; সাধারণত
`yt-dlp` stream URL resolve এবং পরে bot-এর file download/format conversion-এর
সময় লাগে। YouTube API server-এ download-link cache রাখা উচিত, যাতে একই video
বারবার resolve না হয়। Bot-এ সম্ভব হলে direct stream URL পাওয়া মাত্র সেটি ব্যবহার
করুন এবং একই file আবার convert/download করবেন না।

## বসানোর নিয়ম

এই folder-এর:

```text
bot-files/utils/resultCollage.js
bot-files/utils/mediaDownload.js
bot-files/commands/pinterest.js
bot-files/commands/video.js
bot-files/commands/lyricsvideo.js
bot-files/commands/song.js
```

আপনার bot-এর একই relative folder-এ copy করুন। `utils/resultCollage.js`-এর পাশে চাইলে
`fonts/` folder-এ `NotoSansBengali-Regular.ttf` এবং `NotoSansBengali-Bold.ttf` রাখুন,
তাহলে Bangla title-ও ঠিকভাবে render হবে।

`search()` helper-টি query এবং limit নেয়—তৃতীয় `{ type: "image" | "video" }`
argument নতুন Pinterest API helper-এর জন্য পাঠানো হচ্ছে। পুরনো helper তৃতীয়
argument ignore করলেও command-এর local filter image/video মিশতে দেবে না।

## Pinterest 403 সম্পর্কে

`hot girl` বা `sexy girl`-এর মতো নির্দিষ্ট query-তে 403 Pinterest-এর server-side
bot/login restriction থেকে আসে; command-এর filter দিয়ে ওই upstream block bypass করা
যায় না। তাই code raw crash না করে পরিষ্কার message দেয়। আপনার API server-এ logged-in
Pinterest-এর Netscape cookie content `PINTEREST_COOKIES` environment variable হিসেবে
দিলে gallery-dl সাধারণত এই ধরনের 403 কম পায়। Cookie code-এ hard-code করবেন না।
