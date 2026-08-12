import React from "react";
import { Text, View } from "react-native";

import { ScreenshotCard } from "../../../shared/components/ScreenshotCard";
import { useTheme } from "../../../shared/theme/ThemeContext";
import type { Screenshot } from "../../../shared/types/recall";
import type { SearchHit } from "../domain/searchResult";

type SearchResultListProps = {
  hits: SearchHit[];
  onOpen: (shot: Screenshot) => void;
};

/**
 * Ranked results, best first.
 *
 * Rendered as a plain mapped list rather than a FlatList because it sits inside the Home
 * ScrollView, and a nested vertical VirtualizedList would break both scroll containers. The
 * native engine caps a result set at a page's worth, so there is no unbounded list to virtualize.
 */
export function SearchResultList({ hits, onOpen }: SearchResultListProps) {
  const { styles } = useTheme();

  return (
    <View style={styles.resultList}>
      {hits.map((hit) => (
        <View key={hit.screenshot.id} style={styles.resultItem}>
          <ScreenshotCard fullWidth shot={hit.screenshot} onPress={onOpen} />
          {hit.matchedTerms.length ? (
            <View style={styles.matchTermRow}>
              {/* Why this image is here: the indexed terms it shares with the query. */}
              <Text style={styles.bodyMuted}>Matched</Text>
              {hit.matchedTerms.map((term) => (
                <View key={term} style={styles.matchTerm}>
                  <Text style={styles.matchTermText}>{term}</Text>
                </View>
              ))}
            </View>
          ) : null}
        </View>
      ))}
    </View>
  );
}
