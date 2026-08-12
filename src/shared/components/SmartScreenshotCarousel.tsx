import React, { useMemo, useRef } from "react";
import { Animated, useWindowDimensions } from "react-native";

import type { Screenshot } from "../types/recall";
import { ScreenshotCard } from "./ScreenshotCard";

type Props = {
  screenshots: Screenshot[];
  onOpen: (shot: Screenshot) => void;
  onEndReached?: () => void;
  renderOverlay?: (shot: Screenshot) => React.ReactNode;
};

/** A peeking, snapping carousel whose neighbours grow as they approach the centre. */
export function SmartScreenshotCarousel({ screenshots, onOpen, onEndReached, renderOverlay }: Props) {
  const { width } = useWindowDimensions();
  const scrollX = useRef(new Animated.Value(0)).current;
  const cardWidth = Math.min(300, Math.max(238, width * 0.74));
  const gap = 14;
  const interval = cardWidth + gap;
  const sideInset = Math.max(0, (width - 40 - cardWidth) / 2);
  const snapOffsets = useMemo(() => screenshots.map((_, index) => index * interval), [interval, screenshots]);

  return (
    <Animated.FlatList
      horizontal
      data={screenshots}
      keyExtractor={(shot) => shot.id}
      contentContainerStyle={{ gap, paddingHorizontal: sideInset }}
      decelerationRate="fast"
      snapToOffsets={snapOffsets}
      disableIntervalMomentum
      showsHorizontalScrollIndicator={false}
      onEndReached={onEndReached}
      onEndReachedThreshold={0.65}
      onScroll={Animated.event([{ nativeEvent: { contentOffset: { x: scrollX } } }], { useNativeDriver: true })}
      scrollEventThrottle={16}
      removeClippedSubviews={false}
      renderItem={({ item, index }) => {
        const inputRange = [(index - 1) * interval, index * interval, (index + 1) * interval];
        const scale = scrollX.interpolate({ inputRange, outputRange: [0.86, 1, 0.86], extrapolate: "clamp" });
        const opacity = scrollX.interpolate({ inputRange, outputRange: [0.56, 1, 0.56], extrapolate: "clamp" });
        return (
          <Animated.View style={{ width: cardWidth, opacity, transform: [{ scale }] }}>
            <ScreenshotCard fullWidth shot={item} onPress={onOpen} />
            {renderOverlay?.(item)}
          </Animated.View>
        );
      }}
    />
  );
}
