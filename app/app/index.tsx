import PemButton from "@/components/PemButton";
import PemScreen from "@/components/PemScreen";
import PemText from "@/components/PemText";
import { space } from "@/constants/typography";

export default function Index() {
  return (
    <PemScreen variant="center">
      <PemText variant="headline">Pem</PemText>
      <PemText variant="bodyMuted" style={{ marginTop: 8 }}>
        Edit app/index.tsx to edit this screen.
      </PemText>
      <PemButton
        onPress={() => {}}
        style={{
          marginTop: 24,
          paddingVertical: space[3],
          paddingHorizontal: space[6],
          minWidth: 200,
        }}
      >
        Get started
      </PemButton>
      <PemButton
        variant="secondary"
        onPress={() => {}}
        style={{
          marginTop: 12,
          paddingVertical: space[3],
          paddingHorizontal: space[6],
          minWidth: 200,
        }}
      >
        Learn more
      </PemButton>
    </PemScreen>
  );
}
