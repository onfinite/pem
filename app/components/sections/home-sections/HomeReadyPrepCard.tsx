import { formatRelativeHubTime } from "@/lib/formatRelativeHubTime";
import { router } from "expo-router";
import { useMemo } from "react";
import PrepHubCard from "./PrepHubCard";
import type { Prep } from "./homePrepData";

type Props = {
  prep: Prep;
  resolved: "light" | "dark";
};

export default function HomeReadyPrepCard({ prep, resolved }: Props) {
  const open = () => router.push(`/prep/${prep.id}`);

  const inboxMeta = useMemo(() => {
    const rel = formatRelativeHubTime(prep.createdAt);
    if (!rel) return null;
    return `${rel} · Pem prepared this for you`;
  }, [prep.createdAt]);

  return (
    <PrepHubCard
      prep={prep}
      resolved={resolved}
      onOpenDetail={open}
      inboxMeta={inboxMeta}
    />
  );
}
