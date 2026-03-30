import { usePrepHub } from "@/contexts/PrepHubContext";
import HomeReadyPrepCard from "./HomeReadyPrepCard";

type Props = { resolved: "light" | "dark" };

export default function HomeReadyPrepsList({ resolved }: Props) {
  const { readyPreps } = usePrepHub();
  return (
    <>
      {readyPreps.map((prep) => (
        <HomeReadyPrepCard key={prep.id} prep={prep} resolved={resolved} />
      ))}
    </>
  );
}
