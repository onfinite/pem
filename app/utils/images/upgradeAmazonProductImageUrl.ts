/** Match backend: prefer large Amazon `._AC_SL1500_` product images in the client too. */
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
    "._AC_SL1500_",
  );
}
