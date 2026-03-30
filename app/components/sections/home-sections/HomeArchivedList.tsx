import { usePrepHub } from "@/contexts/PrepHubContext";
import { router } from "expo-router";
import PrepHubCard from "./PrepHubCard";

type Props = { resolved: "light" | "dark" };

export default function HomeArchivedList({ resolved }: Props) {
  const { archivedPreps } = usePrepHub();
  return (
    <>
      {archivedPreps.map((prep) => (
        <PrepHubCard
          key={prep.id}
          prep={prep}
          resolved={resolved}
          archivedVisual
          onOpenDetail={() => router.push(`/prep/${prep.id}`)}
        />
      ))}
    </>
  );
}
