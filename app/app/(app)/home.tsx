import HomeArchivedList from "@/components/sections/home-sections/HomeArchivedList";
import HomeTopBar from "@/components/sections/home-sections/HomeTopBar";
import HomePageHead from "@/components/sections/home-sections/HomePageHead";
import HomePreppingList from "@/components/sections/home-sections/HomePreppingList";
import HomeReadyEmpty from "@/components/sections/home-sections/HomeReadyEmpty";
import HomeReadyPrepsList from "@/components/sections/home-sections/HomeReadyPrepsList";
import HomeTabDock from "@/components/sections/home-sections/HomeTabDock";
import {
  TAB_DOCK_INNER_MIN,
  TOP_BAR_ROW_PAD,
  TOP_ICON_CHIP,
  glassChromeBorder,
} from "@/components/sections/home-sections/homeLayout";
import { SHOW_SAMPLE_PREPS, type PrepTab } from "@/components/sections/home-sections/homePrepData";
import { usePrepHub } from "@/contexts/PrepHubContext";
import { useTheme } from "@/contexts/ThemeContext";
import { space } from "@/constants/typography";
import { ScrollView, StyleSheet, View } from "react-native";
import { useState } from "react";
import { useSafeAreaInsets } from "react-native-safe-area-context";

/** Preps hub — settings in top bar, tab dock, Ready / Prepping / Archived. */
export default function HomeScreen() {
  const { colors, resolved } = useTheme();
  const { readyPreps } = usePrepHub();
  const insets = useSafeAreaInsets();
  const [tab, setTab] = useState<PrepTab>("ready");
  const glassBorder = glassChromeBorder(resolved);

  /** Matches dock: top pad + row + home indicator (dock stays `bottom: 0`). */
  const tabDockBottomSpace =
    insets.bottom + TAB_DOCK_INNER_MIN + space[1] + space[2];
  const bottomPad = tabDockBottomSpace + space[6];
  /** Matches header height + a little gap so the first block isn’t tight to the bar. */
  const scrollTopPad =
    insets.top + TOP_BAR_ROW_PAD * 2 + TOP_ICON_CHIP + space[1] + space[3];
  const hasPreps = SHOW_SAMPLE_PREPS && readyPreps.length > 0;

  const pageHead =
    tab === "ready"
      ? {
          title: "Preps",
          sub: hasPreps
            ? "Open when you’re ready — nothing goes out until you do."
            : "Dump voice or text first. Preps land here when they’re ready to open.",
        }
      : tab === "prepping"
        ? {
            title: "Prepping",
            sub: "What Pem is still working on — it’ll move to Ready when it’s done.",
          }
        : {
            title: "Archived",
            sub: "Finished or dismissed — still here if you need to look back.",
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
        <HomePageHead sub={pageHead.sub} />

        {tab === "ready" && !hasPreps ? <HomeReadyEmpty /> : null}
        {tab === "ready" && hasPreps ? <HomeReadyPrepsList resolved={resolved} /> : null}
        {tab === "prepping" ? <HomePreppingList /> : null}
        {tab === "archived" ? <HomeArchivedList resolved={resolved} /> : null}
      </ScrollView>

      <HomeTopBar title={pageHead.title} glassBorder={glassBorder} />
      <HomeTabDock tab={tab} onTab={setTab} glassBorder={glassBorder} />
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
