import React from "react";
import { ScrollView } from "react-native";
import { ContentStoresCard } from "../../components/ContentStoresCard";
import { VideoCoverCard } from "../../components/VideoCoverCard";
import { RichContentCard } from "../../components/RichContentCard";
import { ExtraPhotosCard } from "../../components/ExtraPhotosCard";
import { settingsStyles as s } from "./settingsStyles";

/** Settings → «Доп. контент на Ozon»: stores in scope + video covers, rich content, extra photos. */
export function OzonContentScreen() {
  return (
    <ScrollView style={s.flex} contentContainerStyle={s.container}>
      <ContentStoresCard />
      <VideoCoverCard />
      <RichContentCard />
      <ExtraPhotosCard />
    </ScrollView>
  );
}
