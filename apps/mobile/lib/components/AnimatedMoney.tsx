import { useEffect, useRef, useState } from 'react';
import { Animated, Easing, type TextStyle } from 'react-native';
import { formatMoney } from '../format';

/**
 * A currency amount that counts up from 0 to its value (and animates between
 * values) over ~600ms. Drives a numeric Animated.Value and formats each frame
 * - used for the headline balance figures.
 */
export function AnimatedMoney({
  value,
  currency,
  style,
  formatValue,
}: {
  value: number;
  currency?: string;
  style?: TextStyle | TextStyle[];
  /** Override how the animating number is rendered (e.g. without a symbol). */
  formatValue?: (n: number) => string;
}) {
  const anim = useRef(new Animated.Value(0)).current;
  const [display, setDisplay] = useState(0);

  useEffect(() => {
    const sub = anim.addListener(({ value: v }) => setDisplay(v));
    Animated.timing(anim, {
      toValue: value,
      duration: 600,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: false,
    }).start();
    return () => anim.removeListener(sub);
  }, [anim, value]);

  const text = formatValue ? formatValue(display) : formatMoney(display, currency);
  return <Animated.Text style={style}>{text}</Animated.Text>;
}
