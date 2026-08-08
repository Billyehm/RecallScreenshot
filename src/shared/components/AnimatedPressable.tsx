import React, { useRef } from "react";
import { Animated, Pressable, type PressableProps } from "react-native";

type AnimatedPressableProps = PressableProps & {
  pressedScale?: number;
};

export function AnimatedPressable({ children, onPressIn, onPressOut, pressedScale = 0.97, style, ...props }: AnimatedPressableProps) {
  const pressAnim = useRef(new Animated.Value(0)).current;

  const animateTo = (value: number) => {
    Animated.spring(pressAnim, {
      toValue: value,
      useNativeDriver: true,
      speed: 24,
      bounciness: 5
    }).start();
  };

  const scale = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, pressedScale]
  });

  const opacity = pressAnim.interpolate({
    inputRange: [0, 1],
    outputRange: [1, 0.88]
  });

  return (
    <Animated.View style={{ opacity, transform: [{ scale }] }}>
      <Pressable
        {...props}
        onPressIn={(event) => {
          animateTo(1);
          onPressIn?.(event);
        }}
        onPressOut={(event) => {
          animateTo(0);
          onPressOut?.(event);
        }}
        style={style}
      >
        {children}
      </Pressable>
    </Animated.View>
  );
}
