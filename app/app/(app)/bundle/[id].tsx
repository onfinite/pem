import { Redirect, useLocalSearchParams } from "expo-router";

/** Old `/bundle/:id` links redirect to prep detail — multi-part briefs are one prep + structured body. */
export default function BundleRedirectScreen() {
  const raw = useLocalSearchParams<{ id: string | string[] }>().id;
  const id = typeof raw === "string" ? raw : Array.isArray(raw) ? raw[0] : undefined;
  if (!id) {
    return <Redirect href="/home" />;
  }
  return <Redirect href={`/prep/${id}`} />;
}
