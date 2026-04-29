/**
 * Amazon product images often use small `._AC_UL…_` / `._AC_SX…_` tokens.
 * Swap for `._AC_SL1500_` so clients load a sharper hero.
 */
export function upgradeAmazonProductImageUrl(url: string): string {
  const u = url.trim();
  if (!u || !/^https?:\/\//i.test(u)) return u;
  if (
    !/media-amazon\.com\/images\/I\//i.test(u) &&
    !/ssl-images-amazon\.com\/images\/I\//i.test(u)
  ) {
    return u;
  }
  return u.replace(
    /\._AC_[A-Za-z0-9.,]+(?=_\.(jpg|jpeg|png|webp|gif|avif))/i,
    '._AC_SL1500_',
  );
}
