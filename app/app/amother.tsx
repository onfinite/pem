import PemButton from "@/components/PemButton";
import PemScreen from "@/components/PemScreen";
import PemText from "@/components/PemText";
import { space } from "@/constants/typography";
import { router } from "expo-router";

export default function Amother() {
  return (
    <PemScreen variant="center">
      <PemText variant="headline">Amother</PemText>

      <PemButton
        variant="secondary"
        onPress={() => router.push("/")}
        style={{
          marginTop: 12,
          paddingVertical: space[3],
          paddingHorizontal: space[6],
          minWidth: 200,
        }}
      >
        Back to Home
      </PemButton>
    </PemScreen>
  );
}
