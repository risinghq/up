import { describe, expect, test } from "bun:test";
import { buttonSteps, palette } from "../src/pages/theme";

const luminance = (hex: string) => {
  const [r, g, b] = [1, 3, 5].map((i) => {
    const c = parseInt(hex.slice(i, i + 2), 16) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};

describe("buttonSteps", () => {
  test("gives the white label 4.5:1 at every hue", () => {
    for (let h = 0; h < 360; h += 10) {
      const accent = Bun.color(`hsl(${h}, 80%, 50%)`, "hex")!;
      const { brand } = palette(accent)!;
      const [step] = buttonSteps(brand);
      expect(1.05 / (luminance(brand[step]) + 0.05)).toBeGreaterThanOrEqual(
        4.5,
      );
    }
  });

  test("keeps Luma's step 50 where it already passes", () => {
    expect(buttonSteps(palette("#7c3aed")!.brand)).toEqual([50, 40]);
  });
});
