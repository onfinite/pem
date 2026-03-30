import HomeArchivedList from "@/components/sections/home-sections/HomeArchivedList";
import HomeGlassHeader from "@/components/sections/home-sections/HomeGlassHeader";
import HomePageHead from "@/components/sections/home-sections/HomePageHead";
import HomePrepingList from "@/components/sections/home-sections/HomePrepingList";
import HomeReadyEmpty from "@/components/sections/home-sections/HomeReadyEmpty";
import HomeReadyPrepsList from "@/components/sections/home-sections/HomeReadyPrepsList";
import HomeTabDock from "@/components/sections/home-sections/HomeTabDock";
import {
  TAB_DOCK_INNER_MIN,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
} from "@/components/sections/home-sections/homeLayout";
import { SHOW_SAMPLE_PREPS, type PrepTab } from "@/components/sections/home-sections/homePrepData";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Preps hub — glass header, tab dock, Ready / Preping / Archived. */
export default function HomeScreen() {
  const { colors, resolved } = useTheme();
  const { readyPreps } = usePrepHub();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PrepTab>("ready");
  const blurTint = resolved === "dark" ? "dark" : "light";
  const glassBorder =
    resolved === "dark" ? "rgba(255,255,255,0.12)" : "rgba(28,26,22,0.08)";

  /** Matches dock: top pad + row + home indicator (dock stays `bottom: 0`). */
  const tabDockBottomSpace =
    insets.bottom + TAB_DOCK_INNER_MIN + space[1] + space[2];
  const bottomPad = tabDockBottomSpace + space[6];
  const scrollTopPad =
    insets.top + TOP_BAR_ROW_PAD * 2 + TOP_ICON_CHIP + space[1];
  const hasPreps = SHOW_SAMPLE_PREPS && readyPreps.length > 0;

  const pageHead =
    tab === "ready"
      ? {
          title: "Preps",
          sub: hasPreps
            ? "Prepared for you — open a prep to review. Nothing sends without you."
            : "When you have preps, they’ll show up here as cards.",
        }
      : tab === "preping"
        ? {
            title: "Preping",
            sub: "Parallel work in flight — same as when you leave the preping screen. Nothing is final until it lands in Ready.",
          }
        : {
            title: "Archived",
            sub: "Finished or dismissed preps stay here for your reference.",
          };

  return (
    <View style={[styles.screen, { backgroundColor: colors.pageBackground }]}>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={[
          styles.scrollContent,
          { paddingTop: scrollTopPad, paddingBottom: bottomPad },
        ]}
        showsVerticalScrollIndicator={false}
      >
        <HomePageHead title={pageHead.title} sub={pageHead.sub} />

        {tab === "ready" && !hasPreps ? <HomeReadyEmpty /> : null}
        {tab === "ready" && hasPreps ? <HomeReadyPrepsList resolved={resolved} /> : null}
        {tab === "preping" ? <HomePrepingList /> : null}
        {tab === "archived" ? <HomeArchivedList resolved={resolved} /> : null}
      </ScrollView>

      <HomeGlassHeader blurTint={blurTint} glassBorder={glassBorder} />
      <HomeTabDock tab={tab} onTab={setTab} blurTint={blurTint} glassBorder={glassBorder} />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  scroll: {
    flex: 1,
  },
  scrollContent: {
    paddingHorizontal: space[4],
    gap: space[4],
  },
});
