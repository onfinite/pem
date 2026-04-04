/**
 * Tavily excludes for **SHOPPING** supplemental search — maps / local / Shopping SERP.
 * Primary product data comes from SerpAPI Google Shopping (`pem-search-provider-routing.mdc`).
 */
export const SHOPPING_SEARCH_EXCLUDE_DOMAINS: string[] = [
  'shopping.google.com',
  'maps.google.com',
  'yelp.com',
  'tripadvisor.com',
  'yellowpages.com',
  'mapquest.com',
  'foursquare.com',
  'nextdoor.com',
  'chamberofcommerce.com',
  /** Editorial deal roundups — agent should use Serp product rows, not blog “best of” links */
  'today.com',
  'nbcnews.com',
  'msn.com',
  'cnn.com',
  'forbes.com',
  'businessinsider.com',
  'wired.com',
  'theverge.com',
  'mashable.com',
];
