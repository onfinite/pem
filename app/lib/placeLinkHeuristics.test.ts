import { describe, expect, it } from "vitest";
import {
  isLikelyMapsHttpUrl,
  labelForBusinessMapsUrl,
  labelForPlaceRowAction,
  shouldOpenPlaceRowAsMap,
} from "@/lib/placeLinkHeuristics";

describe("isLikelyMapsHttpUrl", () => {
  it("detects Google Maps URLs", () => {
    expect(
      isLikelyMapsHttpUrl("https://www.google.com/maps/place/Foo/@37,-122,15z"),
    ).toBe(true);
    expect(isLikelyMapsHttpUrl("https://maps.google.com/?q=coffee")).toBe(true);
  });

  it("detects short links", () => {
    expect(isLikelyMapsHttpUrl("https://maps.app.goo.gl/abc")).toBe(true);
  });

  it("detects Apple Maps web links", () => {
    expect(isLikelyMapsHttpUrl("https://maps.apple.com/?q=Oakland")).toBe(true);
  });

  it("treats business homepages as websites", () => {
    expect(isLikelyMapsHttpUrl("https://example.com")).toBe(false);
    expect(isLikelyMapsHttpUrl("https://www.yelp.com/biz/foo")).toBe(false);
  });
});

describe("shouldOpenPlaceRowAsMap / labelForPlaceRowAction", () => {
  it("uses map when coords exist even if url is a site", () => {
    expect(
      shouldOpenPlaceRowAsMap({
        lat: 1,
        lng: 2,
        urlTrimmed: "https://coffee.com",
      }),
    ).toBe(true);
    expect(
      labelForPlaceRowAction({ lat: 1, lng: 2, urlTrimmed: "https://coffee.com" }),
    ).toBe("Map");
  });

  it("labels website when only a non-maps http url and no coords", () => {
    expect(
      shouldOpenPlaceRowAsMap({ lat: 0, lng: 0, urlTrimmed: "https://shop.com" }),
    ).toBe(false);
    expect(
      labelForPlaceRowAction({ lat: 0, lng: 0, urlTrimmed: "https://shop.com" }),
    ).toBe("Website");
  });
});

describe("labelForBusinessMapsUrl", () => {
  it("matches maps vs site for BUSINESS_CARD mapsUrl field", () => {
    expect(
      labelForBusinessMapsUrl("https://www.google.com/maps/place/Foo"),
    ).toBe("Map");
    expect(labelForBusinessMapsUrl("https://brunch.io")).toBe("Website");
  });
});
