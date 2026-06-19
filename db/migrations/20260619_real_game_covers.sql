SET NAMES utf8mb4;

-- Replace generic placeholder catalog images with product-specific cover images.
-- Cover URLs remain owned by MySQL; the frontend only renders games.cover_image_url.
UPDATE games
SET cover_image_url = CASE title
  WHEN '七大奇迹' THEN 'https://cdn.svc.asmodee.net/production-rprod/storage/games/7-wonders/sev-box-3d-1592411287XEcT9.png'
  WHEN '狼人杀' THEN 'https://cdn.shopify.com/s/files/1/0670/7897/9741/files/werewolves-of-millers-hollow.jpg?v=1733557361'
  WHEN '阿瓦隆' THEN 'https://cdn.shopify.com/s/files/1/0660/4590/3087/products/AvalonTHEN.webp?v=1678955024'
  WHEN '电力公司' THEN 'https://i5.walmartimages.com/seo/Power-Grid-Recharged-Family-Board-Game-by-Rio-Grande-Games_70b66a7a-dec9-4bee-8b4c-81b734439481.89ba866dd7241355f8661d11e427e31f.jpeg'
  WHEN '开膛手杰克' THEN 'https://i5.walmartimages.com/seo/Mr-Jack-London-Board-Game_c4cafbd9-e0cb-4778-b603-a9e0870d7109.323c600138067ed077cb80597e2279a0.jpeg'
  WHEN '情书' THEN 'https://cdn.svc.asmodee.net/production-zman/uploads/image-converter/2024/08/LLFront30.webp'
  WHEN '花砖物语' THEN 'https://cdn.shopify.com/s/files/1/0694/1402/7563/products/NM6010-1.jpg?v=1690217148'
  WHEN '行动代号' THEN 'https://cdn.prod.website-files.com/67d17a45b4e1484b40ea8869/6836d01be6d1472eccb6fb20_web-box.webp'
  WHEN '山屋惊魂' THEN 'https://meeples.com.my/image_items/5226_1.jpg'
  WHEN '小黑屋' THEN 'https://meeples.com.my/image_items/5226_1.jpg'
  WHEN '诡镇奇谈' THEN 'https://images-cdn.fantasyflightgames.com/filer_public/e0/18/e01818c4-92ea-421a-a0ef-6679798e79b0/ahc100_produict-page_box.png'
  WHEN '幽港迷城' THEN 'https://cdn.shopify.com/s/files/1/0281/0173/8555/articles/Gloomhaven_Cover_-_Title_PREFERRED_600x.jpg?v=1685591987'
  WHEN 'ROOT 茂林源记' THEN 'https://cdn.shopify.com/s/files/1/0106/0162/7706/products/1-RootGameBox-Edit-Web.png?v=1595294735'
  WHEN '方舟动物园' THEN 'https://capstone-games.com/cdn/shop/files/ArkNova.jpg?v=1764335617&width=1445'
  WHEN '勃艮第城堡' THEN 'https://ravensburger.cloud/images/product-cover/650x445/Strategy-Game-The-Castles-of-Burgundy-Game-for-kids-12-years-up-26925.webp'
  WHEN '大西部之路' THEN 'https://cdn.shopify.com/s/files/1/0694/1402/7563/products/ES5190.jpg?v=1691445123'
  WHEN '重塑火星' THEN 'https://fryxgames.se/wp-content/uploads/2023/08/TM.png'
  WHEN '污痕圣杯' THEN 'https://thesolomeeple.com/wp-content/uploads/2019/12/imgp0407.jpg'
  ELSE cover_image_url
END
WHERE title IN (
  '七大奇迹',
  '狼人杀',
  '阿瓦隆',
  '电力公司',
  '开膛手杰克',
  '情书',
  '花砖物语',
  '行动代号',
  '山屋惊魂',
  '小黑屋',
  '诡镇奇谈',
  '幽港迷城',
  'ROOT 茂林源记',
  '方舟动物园',
  '勃艮第城堡',
  '大西部之路',
  '重塑火星',
  '污痕圣杯'
);
