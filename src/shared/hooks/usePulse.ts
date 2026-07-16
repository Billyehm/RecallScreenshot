import { useEffect, useRef } from "react";
import { Animated } from "react-native";

export function usePulse() {
  const pulse = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animation = Animated.loop(
      Animated.sequence([
        Animated.timing(pulse, { toValue: 1, duration: 1200, useNativeDriver: true }),
        Animated.timing(pulse, { toValue: 0, duration: 1200, useNativeDriver: true })
      ])
    );

    animation.start();
    return () => animation.stop();
  }, [pulse]);

  return pulse;
}
